/**
 * Offline scanner: runs pattern detection for all CNPJs in cnpjs_interesse.csv
 * Usage: GCP_PROJECT_ID=xxx GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json bun run scripts/scan-suspicious.ts
 */
import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "";
const KEY_FILE   = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const DEFAULT_YEAR = 2023;

if (!PROJECT_ID) { console.error("GCP_PROJECT_ID not set"); process.exit(1); }

const bq = new BigQuery({
  projectId: PROJECT_ID,
  ...(KEY_FILE ? { keyFilename: KEY_FILE } : {}),
  location: "US",
});

// ── thresholds ────────────────────────────────────────────────────────────────
const SPLIT_THRESHOLD_BRL          = 17_600;
const SPLIT_MIN_COUNT              = 3;
const CONCENTRATION_THRESHOLD      = 0.40;
const CONCENTRATION_MIN_SPEND      = 50_000;
const INEXIGIBILITY_MIN_COUNT      = 3;
const SINGLE_BIDDER_MIN_OCCURRENCES = 2;
const WIN_RATE_THRESHOLD            = 0.60;
const WIN_RATE_MIN_SAMPLE           = 5;
const AMENDMENT_INFLATION_THRESHOLD = 1.25;
const AMENDMENT_MIN_ORIGINAL_VALUE  = 10_000;
const NEWBORN_MAX_DAYS_TO_CONTRACT  = 180;
const NEWBORN_MIN_CONTRACT_VALUE    = 50_000;
const SURGE_RATIO_THRESHOLD         = 5.0;
const SURGE_MIN_ABSOLUTE_VALUE      = 1_000_000;
const SURGE_LOOKBACK_YEARS          = 4;

// ── helpers ───────────────────────────────────────────────────────────────────
async function query(sql: string, params: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const [job] = await bq.createQueryJob({ query: sql, params, location: "US" });
  const [rows] = await job.getQueryResults();
  return rows as Array<Record<string, unknown>>;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (n: number) => brl.format(n);

// ── per-pattern checks ────────────────────────────────────────────────────────
async function checkSplit(cnpj: string, ano: number) {
  const rows = await query(`
    SELECT id_orgao_superior, nome_orgao_superior,
      FORMAT_DATE('%Y-%m', data_assinatura_contrato) AS mes,
      COUNT(*) AS n, SUM(valor_inicial_compra) AS total
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND ano = @ano AND valor_inicial_compra > 0 AND valor_inicial_compra < @thr
    GROUP BY id_orgao_superior, nome_orgao_superior, mes
    HAVING COUNT(*) >= @min AND SUM(valor_inicial_compra) > @thr`, {
    cnpj, ano, thr: SPLIT_THRESHOLD_BRL, min: SPLIT_MIN_COUNT
  });
  return rows.map(r => `  SPLIT  ${r.mes} · ${r.nome_orgao_superior} · ${r.n} contratos · total ${fmt(Number(r.total))}`);
}

async function checkConcentration(cnpj: string, ano: number) {
  const rows = await query(`
    SELECT nome_orgao_superior,
      SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D',''),@cnpj) THEN valor_final_compra ELSE 0 END) AS sup,
      SUM(valor_final_compra) AS tot
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE ano=@ano AND id_orgao_superior IN (
      SELECT DISTINCT id_orgao_superior FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D',''),@cnpj) AND ano=@ano)
    GROUP BY nome_orgao_superior
    HAVING SUM(valor_final_compra)>=@min AND SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado,r'\\D',''),@cnpj) THEN valor_final_compra ELSE 0 END)/NULLIF(SUM(valor_final_compra),0)>=@thr`,
    { cnpj, ano, min: CONCENTRATION_MIN_SPEND, thr: CONCENTRATION_THRESHOLD });
  return rows.map(r => `  CONC   ${r.nome_orgao_superior} · ${((Number(r.sup)/Number(r.tot))*100).toFixed(0)}% · sup ${fmt(Number(r.sup))} / tot ${fmt(Number(r.tot))}`);
}

async function checkInexig(cnpj: string, ano: number) {
  const rows = await query(`
    SELECT nome_unidade_gestora, COUNT(*) AS n, SUM(valor_inicial_compra) AS total
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado,r'\\D',''),@cnpj)
      AND ano=@ano AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
    GROUP BY nome_unidade_gestora HAVING COUNT(*)>=@min`,
    { cnpj, ano, min: INEXIGIBILITY_MIN_COUNT });
  return rows.map(r => `  INEXIG ${r.nome_unidade_gestora} · ${r.n} contratos · ${fmt(Number(r.total))}`);
}

async function checkSingleBidder(cnpj: string, ano: number) {
  const rows = await query(`
    WITH p AS (
      SELECT id_licitacao, COUNT(*) AS tot,
        COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante,r'\\D',''),@cnpj)) AS par,
        COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante,r'\\D',''),@cnpj) AND vencedor) AS won
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\` GROUP BY id_licitacao)
    SELECT COUNT(*) AS n, SUM(l.valor_licitacao) AS total
    FROM p JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING(id_licitacao)
    WHERE l.ano=@ano AND p.par=1 AND p.won=1 AND p.tot=1`,
    { cnpj, ano });
  const n = Number(rows[0]?.n ?? 0);
  if (n < SINGLE_BIDDER_MIN_OCCURRENCES) return [];
  return [`  SOLO   ${n} licitações único participante · ${fmt(Number(rows[0]?.total ?? 0))}`];
}

async function checkAlwaysWinner(cnpj: string, ano: number) {
  const rows = await query(`
    WITH p AS (
      SELECT pa.id_licitacao, pa.vencedor, l.valor_licitacao
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\` pa
      JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING(id_licitacao)
      WHERE STARTS_WITH(REGEXP_REPLACE(pa.cpf_cnpj_participante,r'\\D',''),@cnpj) AND l.ano=@ano)
    SELECT COUNT(*) AS tot, COUNTIF(vencedor) AS wins, SUM(valor_licitacao) AS value FROM p
    HAVING COUNT(*)>=@min AND COUNTIF(vencedor)/NULLIF(COUNT(*),0)>=@thr`,
    { cnpj, ano, min: WIN_RATE_MIN_SAMPLE, thr: WIN_RATE_THRESHOLD });
  if (!rows.length) return [];
  const r = rows[0];
  const rate = (Number(r.wins)/Number(r.tot)*100).toFixed(0);
  return [`  WINNER ${r.wins}/${r.tot} vitórias (${rate}%) · valor ${fmt(Number(r.value))}`];
}

async function checkAmendment(cnpj: string, ano: number) {
  const rows = await query(`
    WITH a AS (SELECT id_contrato, COUNT(*) AS n FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_termo_aditivo\` GROUP BY id_contrato)
    SELECT COUNT(*) AS n, MAX(c.valor_final_compra/NULLIF(c.valor_inicial_compra,0)) AS maxr,
      SUM(c.valor_final_compra-c.valor_inicial_compra) AS excess
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\` c LEFT JOIN a USING(id_contrato)
    WHERE STARTS_WITH(REGEXP_REPLACE(c.cpf_cnpj_contratado,r'\\D',''),@cnpj) AND c.ano=@ano
      AND c.valor_inicial_compra>=@min AND c.valor_final_compra/NULLIF(c.valor_inicial_compra,0)>=@thr`,
    { cnpj, ano, min: AMENDMENT_MIN_ORIGINAL_VALUE, thr: AMENDMENT_INFLATION_THRESHOLD });
  const n = Number(rows[0]?.n ?? 0);
  if (!n) return [];
  const maxr = Number(rows[0]?.maxr ?? 0);
  return [`  AMEND  ${n} contratos inflados · excesso ${fmt(Number(rows[0]?.excess ?? 0))} · max ${((maxr-1)*100).toFixed(0)}% acima`];
}

async function checkNewborn(cnpj: string) {
  const rows = await query(`
    WITH e AS (
      SELECT MIN(est.data_inicio_atividade) AS data_inicio_atividade, e.porte
      FROM \`basedosdados.br_me_cnpj.empresas\` e
      JOIN \`basedosdados.br_me_cnpj.estabelecimentos\` est
        ON est.cnpj_basico = e.cnpj_basico AND est.ano=@ano AND est.mes=12
      WHERE e.cnpj_basico=@cnpj AND e.ano=@ano AND e.mes=12
      GROUP BY e.porte LIMIT 1),
    c AS (
      SELECT MIN(data_assinatura_contrato) AS first, SUM(valor_final_compra) AS total
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado,r'\\D',''),1,8)=@cnpj AND valor_final_compra>=@min)
    SELECT e.porte, c.first, c.total,
      DATE_DIFF(c.first,e.data_inicio_atividade,DAY) AS days
    FROM e,c WHERE e.data_inicio_atividade IS NOT NULL AND c.first IS NOT NULL
      AND DATE_DIFF(c.first,e.data_inicio_atividade,DAY) BETWEEN 0 AND @max AND c.total>=@min`,
    { cnpj, ano: DEFAULT_YEAR, min: NEWBORN_MIN_CONTRACT_VALUE, max: NEWBORN_MAX_DAYS_TO_CONTRACT });
  if (!rows.length) return [];
  const r = rows[0];
  return [`  NEWBRN ${Math.round(Number(r.days)/30)} mês(es) até 1º contrato (${r.first}) · porte ${r.porte} · ${fmt(Number(r.total))}`];
}

async function checkSurge(cnpj: string, ano: number) {
  const rows = await query(`
    SELECT ano, SUM(valor_final_compra) AS v, COUNT(*) AS n
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado,r'\\D',''),@cnpj)
      AND ano BETWEEN @min AND @max GROUP BY ano ORDER BY ano`,
    { cnpj, ano_min: ano - SURGE_LOOKBACK_YEARS, min: ano - SURGE_LOOKBACK_YEARS, max: ano });
  const hist = rows.map(r => ({ ano: Number(r.ano), v: Number(r.v) }));
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i-1], curr = hist[i];
    if (prev.v > 0 && curr.v >= SURGE_MIN_ABSOLUTE_VALUE && curr.v/prev.v >= SURGE_RATIO_THRESHOLD) {
      return [`  SURGE  ${curr.ano}: ${(curr.v/prev.v).toFixed(1)}× · ${fmt(prev.v)} → ${fmt(curr.v)}`];
    }
  }
  return [];
}

// ── run all patterns for one CNPJ ─────────────────────────────────────────────
async function scan(cnpj: string, name: string): Promise<string[]> {
  const results = await Promise.allSettled([
    checkSplit(cnpj, DEFAULT_YEAR),
    checkConcentration(cnpj, DEFAULT_YEAR),
    checkInexig(cnpj, DEFAULT_YEAR),
    checkSingleBidder(cnpj, DEFAULT_YEAR),
    checkAlwaysWinner(cnpj, DEFAULT_YEAR),
    checkAmendment(cnpj, DEFAULT_YEAR),
    checkNewborn(cnpj),
    checkSurge(cnpj, DEFAULT_YEAR),
  ]);
  const flags: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flags.push(...r.value);
    else console.error(`  [err] ${cnpj}:`, r.reason?.message ?? r.reason);
  }
  return flags;
}

// ── main ──────────────────────────────────────────────────────────────────────
function parseCsv(csv: string) {
  return csv.trim().split("\n").slice(1).filter(Boolean).map(line => {
    const parts = line.split(",");
    return { cnpj: parts[0].trim(), name: parts[1]?.replace(/"/g, "").trim() ?? "" };
  });
}

const csvPath = resolve(import.meta.dir, "../cnpjs_interesse.csv");
const companies = parseCsv(readFileSync(csvPath, "utf-8"));

console.log(`Scanning ${companies.length} companies (ano=${DEFAULT_YEAR})...\n`);

let flagged = 0;
for (const { cnpj, name } of companies) {
  process.stdout.write(`${cnpj} ${name} ... `);
  try {
    const flags = await scan(cnpj, name);
    if (flags.length > 0) {
      flagged++;
      console.log(`\n  ⚠  ${flags.length} alerta(s)`);
      flags.forEach(f => console.log(f));
    } else {
      console.log("limpo");
    }
  } catch (e) {
    console.log(`ERRO: ${(e as Error).message}`);
  }
}

console.log(`\n──────────────────────────────────────────`);
console.log(`${flagged} / ${companies.length} companies with alerts`);
