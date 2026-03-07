/**
 * Batch scanner: runs all 8 pattern queries against every CNPJ in the contracts
 * database in ~8 BigQuery jobs (instead of N_cnpjs × 8 jobs).
 *
 * Usage:
 *   GCP_PROJECT_ID=xxx bun run scripts/scan-all.ts [--ano 2023] [--out results.json] [--import /path/to/community.db]
 *
 * Outputs a ranked table to stdout and optionally writes JSON to --out.
 * --import writes results into community.db cnpj_flags table (upsert).
 * Each row: { cnpj_basico, flags: string[], score: number }
 */
import { BigQuery } from "@google-cloud/bigquery";
import { writeFileSync } from "fs";
import { Database } from "bun:sqlite";

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "";
const KEY_FILE   = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!PROJECT_ID) { console.error("GCP_PROJECT_ID not set"); process.exit(1); }

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const ANO        = Number(getArg("--ano", "2023"));
const OUT_FILE   = getArg("--out", "");
const IMPORT_DB  = getArg("--import", "");

// Maps flag prefix (from addFlag messages) → pattern key matching PATTERN_LABELS in index.ts
const PREFIX_TO_PATTERN: Record<string, string> = {
  SPLIT:  "split_contracts_below_threshold",
  CONC:   "contract_concentration",
  INEXIG: "inexigibility_recurrence",
  SOLO:   "single_bidder",
  WINNER: "always_winner",
  AMEND:  "amendment_inflation",
  NEWBRN: "newborn_company",
  SURGE:  "sudden_surge",
};

// ── thresholds (legal citations in docs/patterns-audit.md) ───────────────────
// US1: threshold is year-dependent.
// - ≤ 2023: R$17.600 (Decreto 9.412/2018 / Lei 8.666/93 art.24,II)
// - 2024+:  R$57.912 (Decreto 11.871/2024 / Lei 14.133/2021 art.75,I)
const SPLIT_THRESHOLD_BRL           = ANO >= 2024 ? 57_912 : 17_600;
const SPLIT_MIN_COUNT               = 3;
// US2: CGU audit methodology — 40% share; R$50k min excludes micro-units; R$10k min supplier spend
const CONCENTRATION_THRESHOLD       = 0.40;
const CONCENTRATION_MIN_SPEND       = 50_000;
const CONCENTRATION_MIN_SUPPLIER    = 10_000;
// US3: TCU Acórdão 1.793/2011 — recorrência de inexigibilidade; R$1k min excludes micro-value
const INEXIGIBILITY_MIN_COUNT       = 3;
const INEXIGIBILITY_MIN_VALUE       = 1_000;
// US4: Open Contracting Partnership "73 Red Flags" (2024), Flag #1
const SINGLE_BIDDER_MIN_OCCURRENCES = 2;
// US5: OCDE 2021 — competitive auctions only (≥2 bidders); Q3 of win-rate distribution
const WIN_RATE_MIN_COMPETITIVE_BIDS = 10; // min participations in auctions with ≥2 bidders
// US6: Lei 14.133/2021 art.125 §1º — legal ceiling = 25% above original for goods/services (50% for construction)
const AMENDMENT_INFLATION_THRESHOLD              = 1.25;  // goods/services: art.125 §1º, I
const AMENDMENT_CONSTRUCTION_INFLATION_THRESHOLD = 1.50;  // construction/engineering: art.125 §1º, II
const AMENDMENT_MAX_INFLATION_RATIO = 10.0;  // cap — ratios above 10× are almost certainly data entry errors
const AMENDMENT_MIN_ORIGINAL_VALUE  = 10_000;
// RE2 regex for construction/engineering keyword detection in 'objeto' free-text field
const CONSTRUCTION_KEYWORDS_RE = `r'obra|constru|reform|engenhari|paviment|demoli'`;
// US7: 180 days = practical minimum for legitimate operational readiness
const NEWBORN_MAX_DAYS_TO_CONTRACT  = 180;
const NEWBORN_MIN_CONTRACT_VALUE    = 50_000;
// US8: UNODC procurement red flag methodology (2013) — 5× YoY + R$1M absolute
const SURGE_RATIO_THRESHOLD         = 5.0;
const SURGE_MIN_ABSOLUTE_VALUE      = 1_000_000;
const SURGE_LOOKBACK_YEARS          = 4;

// ── BigQuery client ────────────────────────────────────────────────────────────
const bq = new BigQuery({
  projectId: PROJECT_ID,
  ...(KEY_FILE ? { keyFilename: KEY_FILE } : {}),
  location: "US",
});

async function runQuery(
  name: string,
  sql: string
): Promise<Array<Record<string, unknown>>> {
  const t0 = Date.now();
  process.stderr.write(`  running ${name}...`);
  const [job] = await bq.createQueryJob({ query: sql, location: "US" });
  const [rows] = await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const gb = Number(meta.statistics?.totalBytesProcessed ?? 0) / 1e9;
  process.stderr.write(` ${rows.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${gb.toFixed(3)} GB\n`);
  return rows as Array<Record<string, unknown>>;
}

// ── helpers ────────────────────────────────────────────────────────────────────
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt  = (n: number) => brl.format(n);
const pct  = (n: number) => `${(n * 100).toFixed(0)}%`;

// Accumulate flags per cnpj_basico
const flagMap = new Map<string, string[]>();
function addFlag(cnpj: string, msg: string) {
  if (!flagMap.has(cnpj)) flagMap.set(cnpj, []);
  flagMap.get(cnpj)!.push(msg);
}

// ── 1. SPLIT — contract splitting below procurement threshold ──────────────────
async function batchSplit() {
  const rows = await runQuery("SPLIT", `
    SELECT
      SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
      id_orgao_superior,
      nome_orgao_superior,
      FORMAT_DATE('%Y-%m', data_assinatura_contrato) AS mes,
      COUNT(1)                     AS n,
      SUM(valor_inicial_compra)    AS total
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE ano = ${ANO}
      AND LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', '')) = 14
      AND valor_inicial_compra > 0
      AND valor_inicial_compra < ${SPLIT_THRESHOLD_BRL}
      AND data_assinatura_contrato IS NOT NULL
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(1) >= ${SPLIT_MIN_COUNT}
      AND SUM(valor_inicial_compra) > ${SPLIT_THRESHOLD_BRL}
  `);
  for (const r of rows) {
    addFlag(
      String(r.cnpj_basico),
      `SPLIT  ${r.mes} · ${r.nome_orgao_superior} · ${r.n} contratos · ${fmt(Number(r.total))}`
    );
  }
}

// ── 2. CONCENTRATION — dominates a single ministry's spend ────────────────────
async function batchConcentration() {
  const rows = await runQuery("CONCENTRATION", `
    WITH spend AS (
      -- Join on (id_orgao_superior, nome_orgao_superior) to prevent merging
      -- two distinct agencies that share the same name (rare but possible).
      SELECT
        SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
        id_orgao_superior,
        nome_orgao_superior,
        SUM(valor_final_compra) AS sup
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE ano = ${ANO}
        AND LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', '')) = 14
      GROUP BY 1, 2, 3
    ),
    ministry_total AS (
      SELECT id_orgao_superior, nome_orgao_superior, SUM(valor_final_compra) AS tot
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE ano = ${ANO}
      GROUP BY 1, 2
    )
    SELECT s.cnpj_basico, s.nome_orgao_superior,
      s.sup / NULLIF(m.tot, 0) AS share, s.sup, m.tot
    FROM spend s
    JOIN ministry_total m USING(id_orgao_superior, nome_orgao_superior)
    WHERE m.tot >= ${CONCENTRATION_MIN_SPEND}
      AND s.sup >= ${CONCENTRATION_MIN_SUPPLIER}
      AND s.sup / NULLIF(m.tot, 0) >= ${CONCENTRATION_THRESHOLD}
    ORDER BY share DESC
  `);
  for (const r of rows) {
    addFlag(
      String(r.cnpj_basico),
      `CONC   ${r.nome_orgao_superior} · ${pct(Number(r.share))} da verba · sup ${fmt(Number(r.sup))} / tot ${fmt(Number(r.tot))}`
    );
  }
}

// ── 3. INEXIGIBILITY — repeated no-bid awards ─────────────────────────────────
// Groups by (cnpj_basico, id_unidade_gestora) to avoid merging units with identical names.
// Excludes micro-value contracts (< R$1k) that are unlikely to represent real abuse.
async function batchInexig() {
  const rows = await runQuery("INEXIG", `
    SELECT
      SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
      id_unidade_gestora,
      nome_unidade_gestora,
      COUNT(1)                  AS n,
      SUM(valor_inicial_compra) AS total
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE ano = ${ANO}
      AND LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', '')) = 14
      AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
      AND valor_inicial_compra >= ${INEXIGIBILITY_MIN_VALUE}
    GROUP BY 1, 2, 3
    HAVING COUNT(1) >= ${INEXIGIBILITY_MIN_COUNT}
  `);
  for (const r of rows) {
    addFlag(
      String(r.cnpj_basico),
      `INEXIG ${r.nome_unidade_gestora} (${r.id_unidade_gestora}) · ${r.n} contratos · ${fmt(Number(r.total))}`
    );
  }
}

// ── 4. SINGLE BIDDER — won auctions as the only participant ───────────────────
async function batchSingleBidder() {
  const rows = await runQuery("SINGLE_BIDDER", `
    WITH auction_stats AS (
      -- For each auction: total bidders (ALL participants including CPF individuals),
      -- and which cnpj_basico won (extracted from CNPJ-14 format only — corporate winner).
      -- Counting CPF bidders keeps this consistent with the per-CNPJ implementation in
      -- index.ts (patternSingleBidder uses COUNT(*) across all participant types).
      -- A CPF individual IS a real competitor even if rarely wins large contracts.
      SELECT
        id_licitacao,
        COUNT(1) AS total_bidders,
        MAX(IF(vencedor AND LENGTH(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', '')) = 14,
               SUBSTR(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', ''), 1, 8), NULL)) AS winner_cnpj
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\`
      GROUP BY 1
    )
    SELECT
      a.winner_cnpj            AS cnpj_basico,
      COUNT(1)                 AS n_solo_wins,
      SUM(l.valor_licitacao)   AS total_value
    FROM auction_stats a
    JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING(id_licitacao)
    WHERE l.ano = ${ANO}
      AND a.total_bidders = 1
      AND a.winner_cnpj IS NOT NULL
    GROUP BY 1
    HAVING COUNT(1) >= ${SINGLE_BIDDER_MIN_OCCURRENCES}
    ORDER BY n_solo_wins DESC
  `);
  for (const r of rows) {
    addFlag(
      String(r.cnpj_basico),
      `SOLO   ${r.n_solo_wins} licitações único participante · ${fmt(Number(r.total_value))}`
    );
  }
}

// ── 5. ALWAYS WINNER — win rate above Q3 in competitive auctions (≥2 bidders) ─
async function batchAlwaysWinner() {
  const rows = await runQuery("ALWAYS_WINNER", `
    WITH auction_bidder_count AS (
      -- count distinct bidders per auction (across all years, since id_licitacao is global)
      SELECT id_licitacao, COUNT(1) AS n_bidders
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\`
      WHERE LENGTH(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', '')) = 14
      GROUP BY 1
      HAVING COUNT(1) >= 2   -- competitive auctions only
    ),
    p AS (
      SELECT
        SUBSTR(REGEXP_REPLACE(pa.cpf_cnpj_participante, r'\\D', ''), 1, 8) AS cnpj_basico,
        pa.vencedor,
        l.valor_licitacao
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\` pa
      JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING(id_licitacao)
      JOIN auction_bidder_count USING(id_licitacao)   -- inner join = competitive only
      WHERE l.ano = ${ANO}
        AND LENGTH(REGEXP_REPLACE(pa.cpf_cnpj_participante, r'\\D', '')) = 14
    ),
    rates AS (
      SELECT
        cnpj_basico,
        COUNT(1)                                AS tot,
        COUNTIF(vencedor)                       AS wins,
        COUNTIF(vencedor) / NULLIF(COUNT(1), 0) AS win_rate,
        SUM(valor_licitacao)                    AS total_value
      FROM p
      GROUP BY 1
      HAVING COUNT(1) >= ${WIN_RATE_MIN_COMPETITIVE_BIDS}
    ),
    threshold AS (
      -- Q3 of competitive win rates; typically 1.0 in this dataset (bimodal),
      -- which means only perfect-win companies are flagged — intentionally strict
      SELECT APPROX_QUANTILES(win_rate, 4)[OFFSET(3)] AS q3
      FROM rates
    )
    SELECT r.*, t.q3 AS threshold_q3
    FROM rates r, threshold t
    WHERE r.win_rate >= t.q3
    ORDER BY wins DESC, win_rate DESC
  `);
  if (rows.length) {
    const q3 = Number(rows[0].threshold_q3);
    process.stderr.write(`         (Q3 threshold = ${pct(q3)})\n`);
  }
  for (const r of rows) {
    addFlag(
      String(r.cnpj_basico),
      `WINNER ${r.wins}/${r.tot} vitórias em disputas competitivas (${pct(Number(r.win_rate))}) · valor ${fmt(Number(r.total_value))}`
    );
  }
}

// ── 6. AMENDMENT INFLATION — contracts ballooning via additive terms ──────────
async function batchAmendment() {
  const rows = await runQuery("AMENDMENT", `
    SELECT
      SUBSTR(REGEXP_REPLACE(c.cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
      COUNT(1) AS n_inflated,
      MAX(c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0)) AS max_ratio,
      SUM(c.valor_final_compra - c.valor_inicial_compra)             AS total_excess
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\` c
    WHERE c.ano = ${ANO}
      AND LENGTH(REGEXP_REPLACE(c.cpf_cnpj_contratado, r'\\D', '')) = 14
      AND c.valor_inicial_compra >= ${AMENDMENT_MIN_ORIGINAL_VALUE}
      AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) >=
            IF(REGEXP_CONTAINS(LOWER(IFNULL(c.objeto, '')), ${CONSTRUCTION_KEYWORDS_RE}),
               ${AMENDMENT_CONSTRUCTION_INFLATION_THRESHOLD}, ${AMENDMENT_INFLATION_THRESHOLD})
      AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) <= ${AMENDMENT_MAX_INFLATION_RATIO}
    GROUP BY 1
    ORDER BY total_excess DESC
  `);
  for (const r of rows) {
    const ratio = Number(r.max_ratio);
    addFlag(
      String(r.cnpj_basico),
      `AMEND  ${r.n_inflated} contratos inflados · excesso ${fmt(Number(r.total_excess))} · max ${((ratio - 1) * 100).toFixed(0)}% acima`
    );
  }
}

// ── 7. NEWBORN — new company landing large contracts quickly ──────────────────
async function batchNewborn() {
  const rows = await runQuery("NEWBORN", `
    WITH founding AS (
      SELECT
        e.cnpj_basico,
        MIN(est.data_inicio_atividade) AS data_inicio_atividade,
        e.porte
      FROM \`basedosdados.br_me_cnpj.empresas\` e
      JOIN \`basedosdados.br_me_cnpj.estabelecimentos\` est
        ON est.cnpj_basico = e.cnpj_basico
        AND est.ano = ${ANO} AND est.mes = 12
      WHERE e.ano = ${ANO} AND e.mes = 12
      GROUP BY e.cnpj_basico, e.porte
    ),
    first_contract AS (
      -- No ano filter intentional: must find the very first contract ever across all years.
      -- Restricting to ano=ANO would miss earlier contracts, producing false negatives for US7.
      -- Cost bounded by: LENGTH=14 CPF exclusion + valor_final_compra >= R$50k filter.
      SELECT
        SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
        MIN(data_assinatura_contrato) AS first_contract_date,
        SUM(valor_final_compra)       AS total_value
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', '')) = 14
        AND valor_final_compra >= ${NEWBORN_MIN_CONTRACT_VALUE}
      GROUP BY 1
    )
    SELECT
      f.cnpj_basico,
      f.porte,
      c.first_contract_date,
      c.total_value,
      DATE_DIFF(c.first_contract_date, f.data_inicio_atividade, DAY) AS days_to_contract
    FROM founding f
    JOIN first_contract c USING(cnpj_basico)
    WHERE f.data_inicio_atividade IS NOT NULL
      AND DATE_DIFF(c.first_contract_date, f.data_inicio_atividade, DAY)
          BETWEEN 0 AND ${NEWBORN_MAX_DAYS_TO_CONTRACT}
    ORDER BY days_to_contract ASC
  `);
  for (const r of rows) {
    const months = Math.round(Number(r.days_to_contract) / 30);
    addFlag(
      String(r.cnpj_basico),
      `NEWBRN ${months} mês(es) até 1º contrato (${r.first_contract_date}) · porte ${r.porte} · ${fmt(Number(r.total_value))}`
    );
  }
}

// ── 8. SUDDEN SURGE — 5× year-over-year revenue jump ─────────────────────────
async function batchSurge() {
  const rows = await runQuery("SURGE", `
    WITH yearly AS (
      SELECT
        SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) AS cnpj_basico,
        ano,
        SUM(valor_final_compra) AS v
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE ano BETWEEN ${ANO - SURGE_LOOKBACK_YEARS} AND ${ANO}
        AND LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', '')) = 14
      GROUP BY 1, 2
    ),
    lagged AS (
      SELECT
        cnpj_basico, ano, v,
        LAG(v)   OVER (PARTITION BY cnpj_basico ORDER BY ano) AS prev_v,
        LAG(ano) OVER (PARTITION BY cnpj_basico ORDER BY ano) AS prev_ano
      FROM yearly
    )
    SELECT cnpj_basico, ano, v, prev_v,
      v / NULLIF(prev_v, 0) AS ratio
    FROM lagged
    WHERE ano - prev_ano = 1        -- consecutive years only; gaps mean dormant period, not a surge
      AND prev_v > 0
      AND v >= ${SURGE_MIN_ABSOLUTE_VALUE}
      AND v / NULLIF(prev_v, 0) >= ${SURGE_RATIO_THRESHOLD}
    ORDER BY ratio DESC
  `);
  for (const r of rows) {
    const ratio = Number(r.ratio);
    addFlag(
      String(r.cnpj_basico),
      `SURGE  ${r.ano}: ${ratio.toFixed(1)}× · ${fmt(Number(r.prev_v))} → ${fmt(Number(r.v))}`
    );
  }
}

// ── main ───────────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.error(`\nBatch scan for ano=${ANO} — 8 queries\n`);

const results = await Promise.allSettled([
  batchSplit(),
  batchConcentration(),
  batchInexig(),
  batchSingleBidder(),
  batchAlwaysWinner(),
  batchAmendment(),
  batchNewborn(),
  batchSurge(),
]);

for (const r of results) {
  if (r.status === "rejected") {
    console.error(`  [err] ${r.reason?.message ?? r.reason}`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`\nDone in ${elapsed}s\n`);

// ── rank and print ─────────────────────────────────────────────────────────────
const ranked = [...flagMap.entries()]
  .map(([cnpj, flags]) => ({ cnpj, flags, score: flags.length }))
  .sort((a, b) => b.score - a.score);

console.log(`${"CNPJ".padEnd(10)}  ${"FLAGS".padEnd(5)}  DETAILS`);
console.log("─".repeat(100));

for (const { cnpj, flags, score } of ranked) {
  console.log(`${cnpj}  [${String(score).padStart(2)}]`);
  for (const f of flags) console.log(`             ${f}`);
}

console.log("\n" + "─".repeat(100));
console.log(`${ranked.length} CNPJs com alertas (ano=${ANO})`);

if (OUT_FILE) {
  writeFileSync(OUT_FILE, JSON.stringify(ranked, null, 2));
  console.error(`\nJSON written to ${OUT_FILE}`);
}

if (IMPORT_DB) {
  if (ranked.length === 0) {
    console.error("\nNo flagged CNPJs to import.");
  } else {
    // Fetch company names from BigQuery for all flagged CNPJs.
    // cnpjList is safe: values are digit-only strings from a prior BigQuery result.
    // Guard above ensures ranked.length > 0 so IN (...) is never empty.
    const cnpjList = ranked.map((r) => `'${r.cnpj}'`).join(",");
    const nameRows = await runQuery("NAMES", `
      SELECT cnpj_basico, razao_social
      FROM \`basedosdados.br_me_cnpj.empresas\`
      WHERE ano = ${ANO} AND mes = 12
        AND cnpj_basico IN (${cnpjList})
    `);
    const nameMap = new Map<string, string>(
      nameRows.map((r) => [String(r.cnpj_basico), String(r.razao_social)])
    );

    const db = new Database(IMPORT_DB, { create: true });
    db.run(`CREATE TABLE IF NOT EXISTS cnpj_flags (
      cnpj         TEXT PRIMARY KEY,
      flag_count   INTEGER NOT NULL DEFAULT 0,
      flag_types   TEXT NOT NULL DEFAULT '[]',
      razao_social TEXT,
      updated_at   TEXT NOT NULL
    )`);
    try { db.run("ALTER TABLE cnpj_flags ADD COLUMN razao_social TEXT"); } catch {}
    const upsert = db.prepare(
      `INSERT INTO cnpj_flags(cnpj, flag_count, flag_types, razao_social, updated_at)
       VALUES(?, ?, ?, ?, datetime('now'))
       ON CONFLICT(cnpj) DO UPDATE SET
         flag_count   = excluded.flag_count,
         flag_types   = excluded.flag_types,
         razao_social = excluded.razao_social,
         updated_at   = excluded.updated_at`
    );
    let imported = 0;
    for (const { cnpj, flags } of ranked) {
      const patterns = [...new Set(
        flags.map((f) => {
          const prefix = f.split(/\s+/)[0];
          return PREFIX_TO_PATTERN[prefix] ?? prefix.toLowerCase();
        })
      )];
      upsert.run(cnpj, patterns.length, JSON.stringify(patterns), nameMap.get(cnpj) ?? null);
      imported++;
    }
    db.close();
    console.error(`\nImported ${imported} CNPJs into ${IMPORT_DB}`);
  }
}
