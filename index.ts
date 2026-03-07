import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { CNPJ_DATASETS, RELATED_DATASETS, buildCnpjWhere } from "./cnpj-datasets";
import { getCache, setCache } from "./cache";
import { Database } from "bun:sqlite";

// --- Community DB (votes + investigation notes + cached flag counts) ---
const communityDb = new Database(resolve(import.meta.dir, "community.db"), { create: true });
communityDb.run(`CREATE TABLE IF NOT EXISTS votes (
  cnpj       TEXT NOT NULL,
  ip         TEXT NOT NULL,
  direction  INTEGER NOT NULL DEFAULT 1,  -- 1 = upvote, -1 = downvote
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (cnpj, ip)
)`);
// Migrate: add direction column to existing DBs that pre-date this schema
try { communityDb.run("ALTER TABLE votes ADD COLUMN direction INTEGER NOT NULL DEFAULT 1"); } catch {}
communityDb.run(`CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj       TEXT NOT NULL,
  author     TEXT DEFAULT 'anônimo',
  body       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`);
// Cache of flag counts populated by /api/patterns/:cnpj responses
communityDb.run(`CREATE TABLE IF NOT EXISTS cnpj_flags (
  cnpj         TEXT PRIMARY KEY,
  flag_count   INTEGER NOT NULL DEFAULT 0,
  flag_types   TEXT,           -- JSON array of pattern names
  razao_social TEXT,
  updated_at   TEXT DEFAULT (datetime('now'))
)`);
try { communityDb.run("ALTER TABLE cnpj_flags ADD COLUMN razao_social TEXT"); } catch {}
communityDb.run(`CREATE INDEX IF NOT EXISTS notes_cnpj ON notes(cnpj)`);
communityDb.run(`CREATE INDEX IF NOT EXISTS votes_cnpj ON votes(cnpj)`);

interface CommunityNote   { id: number; cnpj: string; author: string; body: string; created_at: string }
interface LeaderboardEntry { cnpj: string; score: number; flag_count: number; flag_types: string; razao_social: string | null }

const PATTERN_LABELS: Record<string, string> = {
  split_contracts_below_threshold: "Fracionamento",
  contract_concentration:          "Concentração",
  inexigibility_recurrence:        "Inexigibilidade",
  single_bidder:                   "Único participante",
  always_winner:                   "Sempre vence",
  amendment_inflation:             "Superfaturamento",
  newborn_company:                 "Empresa nova",
  sudden_surge:                    "Crescimento súbito",
};

function getScore(cnpj: string): number {
  return (communityDb.query("SELECT COALESCE(SUM(direction),0) AS s FROM votes WHERE cnpj=?").get(cnpj) as any)?.s ?? 0;
}
function getUserVote(cnpj: string, ip: string): number | null {
  const row = communityDb.query("SELECT direction FROM votes WHERE cnpj=? AND ip=?").get(cnpj, ip) as any;
  return row ? row.direction : null;
}
function castVote(cnpj: string, ip: string, direction: 1 | -1): { score: number; userVote: number } {
  communityDb.run(
    "INSERT INTO votes(cnpj,ip,direction) VALUES(?,?,?) ON CONFLICT(cnpj,ip) DO UPDATE SET direction=excluded.direction, created_at=datetime('now')",
    [cnpj, ip, direction]
  );
  return { score: getScore(cnpj), userVote: direction };
}
function addNote(cnpj: string, body: string, author: string): CommunityNote {
  const sanitizedBody   = body.slice(0, 800).trim();
  const sanitizedAuthor = author.slice(0, 60).trim() || "anônimo";
  if (!sanitizedBody) throw new Error("body vazio");
  const stmt = communityDb.run(
    "INSERT INTO notes(cnpj,body,author) VALUES(?,?,?)",
    [cnpj, sanitizedBody, sanitizedAuthor]
  );
  return communityDb.query("SELECT * FROM notes WHERE id=?").get(stmt.lastInsertRowid) as CommunityNote;
}
function getNotesForCnpj(cnpj: string): CommunityNote[] {
  return communityDb.query(
    "SELECT * FROM notes WHERE cnpj=? ORDER BY created_at DESC LIMIT 50"
  ).all(cnpj) as CommunityNote[];
}
function cacheFlagCount(cnpj: string, flagCount: number, flagTypes: string[]): void {
  communityDb.run(
    "INSERT INTO cnpj_flags(cnpj,flag_count,flag_types,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(cnpj) DO UPDATE SET flag_count=excluded.flag_count, flag_types=excluded.flag_types, updated_at=excluded.updated_at",
    [cnpj, flagCount, JSON.stringify(flagTypes)]
  );
}
function getLeaderboard(limit = 40): LeaderboardEntry[] {
  return communityDb.query(`
    SELECT v.cnpj,
           COALESCE(SUM(v.direction), 0)  AS score,
           COALESCE(f.flag_count, 0)      AS flag_count,
           COALESCE(f.flag_types, '[]')   AS flag_types,
           f.razao_social
    FROM votes v
    LEFT JOIN cnpj_flags f ON f.cnpj = v.cnpj
    GROUP BY v.cnpj
    ORDER BY score DESC, flag_count DESC
    LIMIT ?
  `).all(limit) as LeaderboardEntry[];
}
function getTopFlagged(limit = 20): LeaderboardEntry[] {
  return communityDb.query(`
    SELECT f.cnpj, 0 AS score, f.flag_count,
           COALESCE(f.flag_types, '[]') AS flag_types,
           f.razao_social
    FROM cnpj_flags f
    WHERE f.cnpj NOT IN (SELECT DISTINCT cnpj FROM votes)
    ORDER BY f.flag_count DESC
    LIMIT ?
  `).all(limit) as LeaderboardEntry[];
}

// --- CNPJs de Interesse ---
interface CnpjInteresse { cnpj_basico: string; razao_social: string; porte: string }

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function loadCnpjsInteresse(): CnpjInteresse[] {
  try {
    const csv = readFileSync(resolve(import.meta.dir, "cnpjs_interesse.csv"), "utf-8");
    return csv.trim().split("\n").slice(1).filter(Boolean).map((line) => {
      const [cnpj_basico, razao_social, porte] = parseCsvLine(line);
      return { cnpj_basico: cnpj_basico.trim(), razao_social: razao_social.trim(), porte: porte.trim() };
    });
  } catch { return []; }
}

const cnpjsInteresse = loadCnpjsInteresse();

// --- Config ---
const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "";
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const KEY_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;
const PORT = parseInt(process.env.PORT ?? "3003", 10);

const TABLE = "basedosdados.br_me_cnpj.empresas";
const SOCIOS_TABLE = "basedosdados.br_me_cnpj.socios";
const GRAPH_JS_PATH = resolve(import.meta.dir, "public/graph.js");
const BASEDOSDADOS_SCHEMA_PATH = resolve(import.meta.dir, "basedosdados-schema.json");
const FREE_TIER_BYTES = 1_000_000_000_000; // 1 TB/mês
const USAGE_FILE = new URL("./usage.json", import.meta.url).pathname;

// --- Usage tracking ---
interface UsageData { month: string; bytes: number }

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadUsage(): UsageData {
  if (existsSync(USAGE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(USAGE_FILE, "utf-8")) as UsageData;
      if (data.month === currentMonth()) return data;
    } catch {}
  }
  return { month: currentMonth(), bytes: 0 };
}

function saveUsage(data: UsageData): void {
  writeFileSync(USAGE_FILE, JSON.stringify(data));
}

let usage = loadUsage();
const DEFAULT_YEAR = 2023;
const DEFAULT_LIMIT = 25;
const LOOKUP_LIMIT_DEFAULT = 10;

// --- Pattern Detection Thresholds ---
// US1 SPLIT: threshold is year-dependent.
// - ≤ 2023: R$17.600 (Decreto 9.412/2018 / Lei 8.666/93 art.24,II)
// - 2024+:  R$57.912 (Decreto 11.871/2024 / Lei 14.133/2021 art.75,I)
function splitThresholdForYear(ano: number): number {
  return ano >= 2024 ? 57_912 : 17_600;
}
const SPLIT_MIN_COUNT               = 3;       // ≥3 contracts in same agency+month below threshold

// US2 CONCENTRATION: ≥40% of a single agency's annual spend — no legal source; empirical threshold
// from CGU audit methodology (Relatório de Auditoria 2022). Min R$50k excludes micro-units.
const CONCENTRATION_THRESHOLD       = 0.40;
const CONCENTRATION_MIN_SPEND       = 50_000;  // BRL — min agency total to exclude micro-units
const CONCENTRATION_MIN_SUPPLIER_SPEND = 10_000; // BRL — min supplier total to exclude trivial shares

// US3 INEXIGIBILITY: ≥3 sole-source contracts from same managing unit — TCU Acórdão 1.793/2011
// defines "recorrência de inexigibilidade" as a risk factor requiring special justification.
const INEXIGIBILITY_MIN_COUNT       = 3;
const INEXIGIBILITY_MIN_VALUE       = 1_000;   // BRL — exclude micro-value contracts (< R$1k)

// US4 SINGLE BIDDER: Open Contracting Partnership "73 Red Flags" (2024), Flag #1.
// Minimum 2 occurrences — intentionally low to surface even emerging patterns for investigation.
const SINGLE_BIDDER_MIN_OCCURRENCES = 2;

// US5 ALWAYS WINNER: Only counts COMPETITIVE auctions (≥2 bidders), preventing overlap with US4.
// Win rate ≥80% across ≥10 competitive tenders. Batch uses dynamic Q3 (empirically ≈100%),
// per-CNPJ uses hardcoded 0.80 as a conservative fixed threshold for interactive queries.
// Source: "High win rates in competitive tenders indicate possible collusion" (OCDE 2021).
const WIN_RATE_THRESHOLD            = 0.80;    // raised from 0.60 to reduce false positives
const WIN_RATE_MIN_SAMPLE           = 10;      // raised from 5; aligns with batch scanner

// US6 AMENDMENT INFLATION: Lei 14.133/2021 art.125 §1º — legal ceiling for contract amendments
// is 25% of original value for goods/services (50% for construction/engineering works).
// Inflation ≥ applicable threshold means the contract reached or exceeded its legal ceiling.
const AMENDMENT_INFLATION_THRESHOLD              = 1.25;  // goods/services: art.125 §1º, I
const AMENDMENT_CONSTRUCTION_INFLATION_THRESHOLD = 1.50;  // construction/engineering: art.125 §1º, II
const AMENDMENT_MAX_INFLATION_RATIO = 10.0;  // hard cap — ratios above 10× are almost certainly data entry errors; excluded from total_excess
const AMENDMENT_MIN_ORIGINAL_VALUE  = 10_000; // BRL — exclude micro-contracts (< R$10k)
// RE2 regex matching construction/engineering keywords in the 'objeto' free-text field.
// No dedicated contract-category column exists in br_cgu_licitacao_contrato schema.
// Matches: obra(s), construção/construir, reforma(s/r), engenharia/engenheiro,
//          pavimentação/pavimento, demolição/demolir
const CONSTRUCTION_KEYWORDS_RE = `r'obra|constru|reform|engenhari|paviment|demoli'`;

// US7 NEWBORN: 6 months (180 days) = practical minimum for a legitimate company to be
// fully operational and win a non-trivial public contract. Min R$50k excludes training contracts.
const NEWBORN_MAX_DAYS_TO_CONTRACT  = 180;
const NEWBORN_MIN_CONTRACT_VALUE    = 50_000; // BRL

// US8 SUDDEN SURGE: 5× YoY growth + absolute R$1M. Inspired by UNODC procurement red flag
// methodology (2013): "Sudden large increase in revenue from public contracts."
const SURGE_RATIO_THRESHOLD         = 5.0;
const SURGE_MIN_ABSOLUTE_VALUE      = 1_000_000; // BRL
const SURGE_LOOKBACK_YEARS          = 4;

// --- Pattern Interfaces ---
interface SplitContractFlag {
  pattern: "split_contracts_below_threshold";
  agencyName: string;
  agencyId: string;
  month: string;
  contractCount: number;
  combinedValue: number;
  maxSingleValue: number;
}

interface ConcentrationFlag {
  pattern: "contract_concentration";
  agencyName: string;
  agencyId: string;
  supplierShare: number;
  supplierSpend: number;
  agencyTotalSpend: number;
  year: number;
}

interface InexigibilityFlag {
  pattern: "inexigibility_recurrence";
  agencyUnit: string;
  agencyUnitId: string;
  contractCount: number;
  totalValue: number;
  firstDate: string;
  lastDate: string;
}

interface SingleBidderFlag {
  pattern: "single_bidder";
  occurrences: number;
  totalValue: number;
  agencies: string[];
  sampleObjects: string[];
}

interface AlwaysWinnerFlag {
  pattern: "always_winner";
  totalParticipations: number;
  totalWins: number;
  winRate: number;
  totalValueCompeted: number;
}

interface AmendmentInflationFlag {
  pattern: "amendment_inflation";
  contractCount: number;
  maxInflationRatio: number;
  totalOriginalValue: number;
  totalFinalValue: number;
  excessValue: number;
  worstAgency: string;
  zeroAmendmentCount: number;   // inflated contracts with 0 contrato_termo_aditivo records — most suspicious
  constructionCount: number;    // contracts flagged at 1.50× construction threshold (vs 1.25× goods/services)
}

interface NewbornCompanyFlag {
  pattern: "newborn_company";
  foundingDate: string;
  firstContractDate: string;
  daysToFirstContract: number;
  companySize: string;
  totalContractValue: number;
}

interface SuddenSurgeFlag {
  pattern: "sudden_surge";
  surgeYear: number;
  priorYearValue: number;
  surgeYearValue: number;
  surgeRatio: number;
  surgeYearAgencies: number;
  history: Array<{ ano: number; value: number; contracts: number }>;
}

type PatternFlag =
  | SplitContractFlag
  | ConcentrationFlag
  | InexigibilityFlag
  | SingleBidderFlag
  | AlwaysWinnerFlag
  | AmendmentInflationFlag
  | NewbornCompanyFlag
  | SuddenSurgeFlag;

interface PatternResult {
  cnpj: string;
  detectedAt: string;
  flags: PatternFlag[];
}


interface SchemaColumn {
  name: string;
  type?: string;
  description?: string;
}

type SchemaIndex = Record<string, Record<string, SchemaColumn[]>>;

function loadSchemaIndex(): SchemaIndex {
  try {
    return JSON.parse(readFileSync(BASEDOSDADOS_SCHEMA_PATH, "utf-8")) as SchemaIndex;
  } catch {
    return {};
  }
}

const schemaIndex = loadSchemaIndex();

function getSchemaColumnsForTable(tableRef: string): SchemaColumn[] {
  const parts = tableRef.split(".");
  if (parts.length !== 3) return [];
  const datasetId = parts[1];
  const tableId = parts[2];
  const dataset = schemaIndex[datasetId];
  if (!dataset) return [];
  return dataset[tableId] ?? [];
}

// --- BigQuery client (singleton) ---
function createClient(): BigQuery {
  const opts: ConstructorParameters<typeof BigQuery>[0] = { location: "US" };
  if (PROJECT_ID) opts.projectId = PROJECT_ID;
  if (KEY_FILE) {
    opts.keyFilename = KEY_FILE;
  } else if (KEY_JSON) {
    try {
      opts.credentials = JSON.parse(KEY_JSON);
    } catch (error) {
      console.error("Invalid GCP_SERVICE_ACCOUNT_JSON:", error);
    }
  }
  return new BigQuery(opts);
}

const bq = createClient();

// --- Custom errors ---
class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

// --- Query ---
interface QueryParams {
  ano: number;
  limit: number;
  offset: number;
  search: string;
}

interface Company {
  cnpj_basico: string;
  razao_social: string;
  natureza_juridica: string;
  qualificacao_responsavel: string;
  capital_social: number | null;
  porte: string;
  ente_federativo: string;
  ano: number;
}

async function queryCompanies(params: QueryParams): Promise<{ rows: Company[]; bytesProcessed: number }> {
  if (!PROJECT_ID) {
    throw new BillingError(
      "GCP_PROJECT_ID not set. Set it via environment variable."
    );
  }

  const cacheKey = `companies_${params.ano}_${params.limit}_${params.offset}_${params.search.replace(/\s+/g, "_")}`;
  const cached = getCache<Company[]>(cacheKey);
  if (cached) return { rows: cached, bytesProcessed: 0 };

  let whereClause = "WHERE ano = @ano";
  const queryParams: Record<string, unknown> = {
    ano: params.ano,
    lim: params.limit,
    off: params.offset,
  };

  if (params.search) {
    whereClause += " AND UPPER(razao_social) LIKE UPPER(@search)";
    queryParams.search = `%${params.search}%`;
  }

  const sql = `
    SELECT
      cnpj_basico,
      razao_social,
      natureza_juridica,
      qualificacao_responsavel,
      capital_social,
      porte,
      ente_federativo,
      ano
    FROM \`${TABLE}\`
    ${whereClause}
    ORDER BY capital_social DESC NULLS LAST
    LIMIT @lim
    OFFSET @off
  `;

  const [job] = await bq.createQueryJob({ query: sql, params: queryParams, location: "US" });
  const [rows] = await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const bytesProcessed = parseInt(meta.statistics?.totalBytesProcessed ?? "0", 10);

  setCache(cacheKey, rows as Company[]);
  return { rows: rows as Company[], bytesProcessed };
}

interface Socio {
  nome: string;
  documento: string;
  qualificacao: string;
}

async function querySocios(cnpjBasico: string): Promise<{ rows: Socio[]; bytesProcessed: number }> {
  if (!PROJECT_ID) throw new BillingError("GCP_PROJECT_ID not set.");

  const cacheKey = `socios_${cnpjBasico}`;
  const cached = getCache<Socio[]>(cacheKey);
  if (cached) return { rows: cached, bytesProcessed: 0 };

  const sql = `
    SELECT nome, documento, qualificacao
    FROM \`${SOCIOS_TABLE}\`
    WHERE cnpj_basico = @cnpj AND ano = @ano
    LIMIT 50
  `;
  const [job] = await bq.createQueryJob({ query: sql, params: { cnpj: cnpjBasico, ano: DEFAULT_YEAR }, location: "US" });
  const [rows] = await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const bytesProcessed = parseInt(meta.statistics?.totalBytesProcessed ?? "0", 10);
  setCache(cacheKey, rows as Socio[]);
  return { rows: rows as Socio[], bytesProcessed };
}

async function queryEmpresa(cnpjBasico: string): Promise<{ row: Company | null; bytesProcessed: number }> {
  if (!PROJECT_ID) throw new BillingError("GCP_PROJECT_ID not set.");

  const cacheKey = `empresa_${cnpjBasico}`;
  const cached = getCache<Company | null>(cacheKey);
  if (cached !== undefined) return { row: cached ?? null, bytesProcessed: 0 };

  const sql = `
    SELECT cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel, capital_social, porte, ente_federativo, ano
    FROM \`${TABLE}\`
    WHERE cnpj_basico = @cnpj AND ano = @ano
    LIMIT 1
  `;
  const [job] = await bq.createQueryJob({ query: sql, params: { cnpj: cnpjBasico, ano: DEFAULT_YEAR }, location: "US" });
  const [rows] = await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const bytesProcessed = parseInt(meta.statistics?.totalBytesProcessed ?? "0", 10);
  const row = (rows[0] as Company) ?? null;
  setCache(cacheKey, row);
  return { row, bytesProcessed };
}

interface LookupResult {
  id: string;
  label: string;
  count: number;
  rows: Record<string, unknown>[];
  cnpjColumnNames?: string[];
  nodeType?: string;
  nodeIdField?: string;
  nodeLabelField?: string;
  queryError?: string;
}

function inferLookupNodeFields(ds: (typeof CNPJ_DATASETS)[number]): {
  nodeIdField?: string;
  nodeLabelField?: string;
} {
  const available = new Set(ds.displayFields);
  const schemaCols = getSchemaColumnsForTable(ds.table).map((c) => c.name);

  const findAvailable = (candidates: string[]): string | undefined =>
    candidates.find((c) => available.has(c));

  const idCandidates = [
    ...(ds.nodeIdField ? [ds.nodeIdField] : []),
    ...ds.cnpjColumns.map((c) => c.name),
    ...schemaCols.filter((c) => /^id(_|$)/i.test(c)),
    ...schemaCols.filter((c) => /cnpj|cpf|documento|codigo/i.test(c)),
    ...ds.displayFields,
  ];
  const nodeIdField = findAvailable(idCandidates);

  const labelCandidates = [
    ...(ds.nodeLabelField ? [ds.nodeLabelField] : []),
    "nome_fantasia",
    "nome_razao_social",
    "razao_social",
    "nome_fornecedor",
    "nome_contratado",
    "nome_favorecido",
    "nome_doador",
    "nome_estabelecimento",
    "nome",
    "descricao",
    "objeto",
    ...schemaCols.filter((c) => /^nome/i.test(c)),
    ...schemaCols.filter((c) => /descricao|objeto|municipio/i.test(c)),
    ...(nodeIdField ? [nodeIdField] : []),
  ];
  const nodeLabelField = findAvailable(labelCandidates);

  return { nodeIdField, nodeLabelField };
}

async function queryLookupDataset(
  cnpjBasico: string,
  datasetId: string,
  forceFresh = false,
  limit = LOOKUP_LIMIT_DEFAULT,
): Promise<{ result: LookupResult; bytes: number }> {
  if (!PROJECT_ID) throw new BillingError("GCP_PROJECT_ID not set.");
  const docDigits = cnpjBasico.replace(/\D/g, "");
  const docLen = docDigits.length;
  const cnpjRoot = docDigits.slice(0, 8);
  if (cnpjRoot.length < 8) {
    throw new Error("Lookup value must have at least 8 digits.");
  }

  const ds = CNPJ_DATASETS.find((d) => d.id === datasetId);
  if (!ds) throw new Error(`Dataset not found: ${datasetId}`);

  const dsKey = `lookup_${docDigits}_${ds.id}_limit_${limit}`;
  if (!forceFresh) {
    const cachedDs = getCache<LookupResult>(dsKey);
    if (cachedDs) return { result: cachedDs, bytes: 0 };
  }

  const whereParts = ds.cnpjColumns.map((col) => buildCnpjWhere(col));
  const whereClause =
    whereParts.length === 1 ? whereParts[0] : `(${whereParts.join(" OR ")})`;

  const fields = ds.displayFields.join(", ");
  const sql = `
    WITH matched AS (
      SELECT ${fields}
      FROM \`${ds.table}\`
      WHERE ${whereClause}
    )
    SELECT
      *,
      COUNT(*) OVER() AS __total_count
    FROM matched
    LIMIT @limit
  `;
  const inferredFields = inferLookupNodeFields(ds);

  try {
    const [job] = await bq.createQueryJob({
      query: sql,
      params: { cnpj_root: cnpjRoot, doc_digits: docDigits, doc_len: docLen, limit },
      location: "US",
    });
    const [rawRows] = await job.getQueryResults();
    const [meta] = await job.getMetadata();
    const bytes = parseInt(meta.statistics?.totalBytesProcessed ?? "0", 10);
    const rowsWithCount = rawRows as Array<Record<string, unknown>>;
    const totalCountRaw = rowsWithCount[0]?.__total_count;
    const totalCount =
      typeof totalCountRaw === "number"
        ? totalCountRaw
        : totalCountRaw != null
          ? Number(totalCountRaw)
          : 0;
    const rows = rowsWithCount.map(({ __total_count: _ignored, ...row }) => row);
    const result: LookupResult = {
      id: ds.id,
      label: ds.label,
      count: Number.isFinite(totalCount) ? totalCount : rows.length,
      rows,
      cnpjColumnNames: ds.cnpjColumns.map((c) => c.name),
      nodeType: ds.nodeType,
      nodeIdField: ds.nodeIdField ?? inferredFields.nodeIdField,
      nodeLabelField: ds.nodeLabelField ?? inferredFields.nodeLabelField,
      queryError: undefined,
    };
    setCache(dsKey, result);
    return { result, bytes };
  } catch (err) {
    const queryError = err instanceof Error ? err.message : String(err);
    const failedResult: LookupResult = {
      id: ds.id,
      label: ds.label,
      count: 0,
      rows: [],
      cnpjColumnNames: ds.cnpjColumns.map((c) => c.name),
      nodeType: ds.nodeType,
      nodeIdField: ds.nodeIdField ?? inferredFields.nodeIdField,
      nodeLabelField: ds.nodeLabelField ?? inferredFields.nodeLabelField,
      queryError,
    };
    setCache(dsKey, failedResult);
    return { result: failedResult, bytes: 0 };
  }
}

async function queryLookup(
  cnpjBasico: string,
  limit = LOOKUP_LIMIT_DEFAULT,
): Promise<{ results: LookupResult[]; totalBytes: number }> {
  if (!PROJECT_ID) throw new BillingError("GCP_PROJECT_ID not set.");
  const docDigits = cnpjBasico.replace(/\D/g, "");
  if (docDigits.length < 8) {
    throw new Error("Lookup value must have at least 8 digits.");
  }

  const topKey = `lookup_${docDigits}_limit_${limit}`;
  const cachedAll = getCache<LookupResult[]>(topKey);
  if (cachedAll) return { results: cachedAll, totalBytes: 0 };

  const jobs = CNPJ_DATASETS.map((ds) =>
    queryLookupDataset(cnpjBasico, ds.id, false, limit),
  );

  const settled = await Promise.all(jobs);
  const results = settled.map((s) => s.result);
  const totalBytes = settled.reduce((acc, s) => acc + s.bytes, 0);
  setCache(topKey, results);
  return { results, totalBytes };
}

async function queryByField(
  datasetId: string,
  foreignKey: string,
  value: string,
  forceFresh = false,
  limit = LOOKUP_LIMIT_DEFAULT,
): Promise<{ result: LookupResult; bytes: number }> {
  if (!PROJECT_ID) throw new BillingError("GCP_PROJECT_ID not set.");

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(foreignKey)) {
    throw new Error(`Invalid foreignKey: ${foreignKey}`);
  }

  const ds = RELATED_DATASETS.find((d) => d.id === datasetId);
  if (!ds) throw new Error(`Related dataset not found: ${datasetId}`);

  const cacheKey = `related_${datasetId}_${foreignKey}_${value}_limit_${limit}`;
  if (!forceFresh) {
    const cached = getCache<LookupResult>(cacheKey);
    if (cached) return { result: cached, bytes: 0 };
  }

  const sql = `
    WITH matched AS (
      SELECT ${ds.displayFields.join(", ")}
      FROM \`${ds.table}\`
      WHERE ${foreignKey} = @value
    )
    SELECT
      *,
      COUNT(*) OVER() AS __total_count
    FROM matched
    LIMIT @limit
  `;

  try {
    const [job] = await bq.createQueryJob({
      query: sql,
      params: { value, limit },
      location: "US",
    });
    const [rawRows] = await job.getQueryResults();
    const [meta] = await job.getMetadata();
    const bytes = parseInt(meta.statistics?.totalBytesProcessed ?? "0", 10);
    const rowsWithCount = rawRows as Array<Record<string, unknown>>;
    const totalCountRaw = rowsWithCount[0]?.__total_count;
    const totalCount =
      typeof totalCountRaw === "number"
        ? totalCountRaw
        : totalCountRaw != null
          ? Number(totalCountRaw)
          : 0;
    const rows = rowsWithCount.map(({ __total_count: _ignored, ...row }) => row);
    const result: LookupResult = {
      id: ds.id,
      label: ds.label,
      count: Number.isFinite(totalCount) ? totalCount : rows.length,
      rows,
      cnpjColumnNames: [],
      nodeType: ds.nodeType,
      nodeIdField: ds.nodeIdField,
      nodeLabelField: ds.nodeLabelField,
    };
    setCache(cacheKey, result);
    return { result, bytes };
  } catch (err) {
    const queryError = err instanceof Error ? err.message : String(err);
    const failedResult: LookupResult = {
      id: ds.id, label: ds.label, count: 0, rows: [],
      cnpjColumnNames: [], nodeType: ds.nodeType,
      nodeIdField: ds.nodeIdField, nodeLabelField: ds.nodeLabelField, queryError,
    };
    return { result: failedResult, bytes: 0 };
  }
}


// --- Pattern Detection Functions ---

async function patternSplitContracts(cnpj: string, ano: number): Promise<SplitContractFlag[]> {
  const cacheKey = `patterns_split_${cnpj}_${ano}`;
  const cached = getCache<SplitContractFlag[]>(cacheKey);
  if (cached !== undefined) return cached;

  const sql = `
    SELECT
      id_orgao_superior,
      nome_orgao_superior,
      FORMAT_DATE('%Y-%m', data_assinatura_contrato) AS mes,
      COUNT(*)                   AS contrato_count,
      SUM(valor_inicial_compra)  AS combined_value,
      MAX(valor_inicial_compra)  AS max_single_value
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND ano = @ano
      AND valor_inicial_compra > 0
      AND valor_inicial_compra < @threshold
      AND data_assinatura_contrato IS NOT NULL
    GROUP BY id_orgao_superior, nome_orgao_superior, mes
    HAVING COUNT(*) >= @min_count
       AND SUM(valor_inicial_compra) > @threshold
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, threshold: splitThresholdForYear(ano), min_count: SPLIT_MIN_COUNT },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  const flags = (rows as Array<Record<string, unknown>>).map((r) => ({
    pattern: "split_contracts_below_threshold" as const,
    agencyName: String(r.nome_orgao_superior ?? ""),
    agencyId: String(r.id_orgao_superior ?? ""),
    month: String(r.mes ?? ""),
    contractCount: Number(r.contrato_count ?? 0),
    combinedValue: Number(r.combined_value ?? 0),
    maxSingleValue: Number(r.max_single_value ?? 0),
  }));
  setCache(cacheKey, flags);
  return flags;
}

async function patternConcentration(cnpj: string, ano: number): Promise<ConcentrationFlag[]> {
  const cacheKey = `patterns_concentration_${cnpj}_${ano}`;
  const cached = getCache<ConcentrationFlag[]>(cacheKey);
  if (cached !== undefined) return cached;

  const sql = `
    SELECT
      id_orgao_superior,
      nome_orgao_superior,
      SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
               THEN valor_final_compra ELSE 0 END) AS supplier_spend,
      SUM(valor_final_compra) AS agency_total
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE ano = @ano
      AND id_orgao_superior IN (
        SELECT DISTINCT id_orgao_superior
        FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
        WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
          AND ano = @ano
      )
    GROUP BY id_orgao_superior, nome_orgao_superior
    HAVING SUM(valor_final_compra) >= @min_agency_spend
       AND SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
                    THEN valor_final_compra ELSE 0 END) >= @min_supplier_spend
       AND SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
                    THEN valor_final_compra ELSE 0 END)
           / NULLIF(SUM(valor_final_compra), 0) >= @threshold
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, threshold: CONCENTRATION_THRESHOLD, min_agency_spend: CONCENTRATION_MIN_SPEND, min_supplier_spend: CONCENTRATION_MIN_SUPPLIER_SPEND },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  const flags = (rows as Array<Record<string, unknown>>).map((r) => {
    const supplierSpend = Number(r.supplier_spend ?? 0);
    const agencyTotal = Number(r.agency_total ?? 0);
    return {
      pattern: "contract_concentration" as const,
      agencyName: String(r.nome_orgao_superior ?? ""),
      agencyId: String(r.id_orgao_superior ?? ""),
      supplierShare: agencyTotal > 0 ? supplierSpend / agencyTotal : 0,
      supplierSpend,
      agencyTotalSpend: agencyTotal,
      year: ano,
    };
  });
  setCache(cacheKey, flags);
  return flags;
}

async function patternInexigibility(cnpj: string, ano: number): Promise<InexigibilityFlag[]> {
  const cacheKey = `patterns_inexigibility_${cnpj}_${ano}`;
  const cached = getCache<InexigibilityFlag[]>(cacheKey);
  if (cached !== undefined) return cached;

  const sql = `
    SELECT
      id_unidade_gestora,
      nome_unidade_gestora,
      COUNT(*)                   AS contrato_count,
      SUM(valor_inicial_compra)  AS total_value,
      MIN(data_assinatura_contrato) AS first_date,
      MAX(data_assinatura_contrato) AS last_date
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND ano = @ano
      AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
      AND valor_inicial_compra >= @min_value
    GROUP BY id_unidade_gestora, nome_unidade_gestora
    HAVING COUNT(*) >= @min_count
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, min_count: INEXIGIBILITY_MIN_COUNT, min_value: INEXIGIBILITY_MIN_VALUE },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  const flags = (rows as Array<Record<string, unknown>>).map((r) => ({
    pattern: "inexigibility_recurrence" as const,
    agencyUnit: String(r.nome_unidade_gestora ?? ""),
    agencyUnitId: String(r.id_unidade_gestora ?? ""),
    contractCount: Number(r.contrato_count ?? 0),
    totalValue: Number(r.total_value ?? 0),
    firstDate: r.first_date ? String(r.first_date) : "",
    lastDate: r.last_date ? String(r.last_date) : "",
  }));
  setCache(cacheKey, flags);
  return flags;
}

async function patternSingleBidder(cnpj: string, ano: number): Promise<SingleBidderFlag | null> {
  const cacheKey = `patterns_single_bidder_${cnpj}_${ano}`;
  const cached = getCache<SingleBidderFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  const sql = `
    WITH participantes AS (
      SELECT
        id_licitacao,
        COUNT(*) AS total_participantes,
        COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', ''), @cnpj)) AS cnpj_participated,
        COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', ''), @cnpj) AND vencedor) AS cnpj_won
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\`
      GROUP BY id_licitacao
    )
    SELECT
      l.id_orgao_superior,
      l.nome_orgao_superior,
      l.objeto,
      l.valor_licitacao
    FROM participantes p
    JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING (id_licitacao)
    WHERE l.ano = @ano
      AND p.cnpj_participated = 1
      AND p.cnpj_won = 1
      AND p.total_participantes = 1
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  if (rows.length < SINGLE_BIDDER_MIN_OCCURRENCES) {
    setCache(cacheKey, null);
    return null;
  }
  const typed = rows as Array<Record<string, unknown>>;
  const agencies = [...new Set(typed.map((r) => String(r.nome_orgao_superior ?? "")).filter(Boolean))];
  const totalValue = typed.reduce((s, r) => s + Number(r.valor_licitacao ?? 0), 0);
  const sampleObjects = typed.slice(0, 3).map((r) => String(r.objeto ?? "")).filter(Boolean);
  const flag: SingleBidderFlag = { pattern: "single_bidder", occurrences: rows.length, totalValue, agencies, sampleObjects };
  setCache(cacheKey, flag);
  return flag;
}

async function patternAlwaysWinner(cnpj: string, ano: number): Promise<AlwaysWinnerFlag | null> {
  const cacheKey = `patterns_always_winner_${cnpj}_${ano}`;
  const cached = getCache<AlwaysWinnerFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  // Only count COMPETITIVE auctions (≥2 distinct bidders) to avoid overlap with US4 single_bidder.
  // A company that always wins because it's always the only bidder is a US4 signal, not US5.
  const sql = `
    WITH competitive_auctions AS (
      -- auctions where ≥2 distinct CNPJ-14 participants
      SELECT id_licitacao
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\`
      WHERE LENGTH(REGEXP_REPLACE(cpf_cnpj_participante, r'\\D', '')) = 14
      GROUP BY id_licitacao
      HAVING COUNT(1) >= 2
    ),
    participacoes AS (
      SELECT p.id_licitacao, p.vencedor, l.valor_licitacao
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\` p
      JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING (id_licitacao)
      JOIN competitive_auctions ca USING (id_licitacao)
      WHERE STARTS_WITH(REGEXP_REPLACE(p.cpf_cnpj_participante, r'\\D', ''), @cnpj)
        AND l.ano = @ano
    )
    SELECT
      COUNT(*)                AS total_participacoes,
      COUNTIF(vencedor)       AS total_vitorias,
      SUM(valor_licitacao)    AS total_value_competed
    FROM participacoes
    HAVING COUNT(*) >= @min_sample
       AND COUNTIF(vencedor) / NULLIF(COUNT(*), 0) >= @win_rate_threshold
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, min_sample: WIN_RATE_MIN_SAMPLE, win_rate_threshold: WIN_RATE_THRESHOLD },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  if (rows.length === 0) { setCache(cacheKey, null); return null; }
  const r = rows[0] as Record<string, unknown>;
  const total = Number(r.total_participacoes ?? 0);
  const wins = Number(r.total_vitorias ?? 0);
  const flag: AlwaysWinnerFlag = {
    pattern: "always_winner",
    totalParticipations: total,
    totalWins: wins,
    winRate: total > 0 ? wins / total : 0,
    totalValueCompeted: Number(r.total_value_competed ?? 0),
  };
  setCache(cacheKey, flag);
  return flag;
}

async function patternAmendmentInflation(cnpj: string, ano: number): Promise<AmendmentInflationFlag | null> {
  const cacheKey = `patterns_amendment_inflation_${cnpj}_${ano}`;
  const cached = getCache<AmendmentInflationFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  const sql = `
    WITH aditivos AS (
      -- Full scan of contrato_termo_aditivo (no partition column available).
      -- Acceptable cost for per-CNPJ queries; not used in batch scanners.
      SELECT id_contrato, COUNT(*) AS aditivo_count
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_termo_aditivo\`
      GROUP BY id_contrato
    )
    SELECT
      c.nome_unidade_gestora,
      c.valor_inicial_compra,
      c.valor_final_compra,
      c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) AS inflation_ratio,
      COALESCE(a.aditivo_count, 0)                             AS aditivo_count,
      REGEXP_CONTAINS(LOWER(IFNULL(c.objeto, '')), ${CONSTRUCTION_KEYWORDS_RE}) AS is_construction
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\` c
    LEFT JOIN aditivos a USING (id_contrato)
    WHERE STARTS_WITH(REGEXP_REPLACE(c.cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND c.ano = @ano
      AND c.valor_inicial_compra >= @min_original
      AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) >=
            IF(REGEXP_CONTAINS(LOWER(IFNULL(c.objeto, '')), ${CONSTRUCTION_KEYWORDS_RE}),
               @construction_threshold, @threshold)
      AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) <= @max_ratio
    ORDER BY inflation_ratio DESC
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, min_original: AMENDMENT_MIN_ORIGINAL_VALUE, threshold: AMENDMENT_INFLATION_THRESHOLD, construction_threshold: AMENDMENT_CONSTRUCTION_INFLATION_THRESHOLD, max_ratio: AMENDMENT_MAX_INFLATION_RATIO },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  if (rows.length === 0) { setCache(cacheKey, null); return null; }
  const typed = rows as Array<Record<string, unknown>>;
  const totalOriginal = typed.reduce((s, r) => s + Number(r.valor_inicial_compra ?? 0), 0);
  const totalFinal = typed.reduce((s, r) => s + Number(r.valor_final_compra ?? 0), 0);
  const maxRatio = Math.max(...typed.map((r) => Number(r.inflation_ratio ?? 0)));
  const zeroAmendmentCount = typed.filter((r) => Number(r.aditivo_count ?? 0) === 0).length;
  const constructionCount = typed.filter((r) => r.is_construction === true).length;
  const flag: AmendmentInflationFlag = {
    pattern: "amendment_inflation",
    contractCount: rows.length,
    maxInflationRatio: maxRatio,
    totalOriginalValue: totalOriginal,
    totalFinalValue: totalFinal,
    excessValue: totalFinal - totalOriginal,
    worstAgency: String(typed[0].nome_unidade_gestora ?? ""),
    zeroAmendmentCount,
    constructionCount,
  };
  setCache(cacheKey, flag);
  return flag;
}

async function patternNewbornCompany(cnpj: string, ano: number): Promise<NewbornCompanyFlag | null> {
  const cacheKey = `patterns_newborn_company_${cnpj}_${ano}`;
  const cached = getCache<NewbornCompanyFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  const sql = `
    WITH empresa AS (
      SELECT e.cnpj_basico, MIN(est.data_inicio_atividade) AS data_inicio_atividade, e.porte
      FROM \`basedosdados.br_me_cnpj.empresas\` e
      JOIN \`basedosdados.br_me_cnpj.estabelecimentos\` est
        ON est.cnpj_basico = e.cnpj_basico AND est.ano = @empresa_ano AND est.mes = @empresa_mes
      WHERE e.cnpj_basico = @cnpj
        AND e.ano = @empresa_ano AND e.mes = @empresa_mes
      GROUP BY e.cnpj_basico, e.porte
    ),
    contratos AS (
      -- No ano filter intentional: must find the very first contract ever across all years.
      -- Restricting to ano=N would miss earlier contracts, producing false negatives for US7.
      -- Cost bounded by: SUBSTR match (8-digit basico) + valor_final_compra >= R$50k filter.
      SELECT
        MIN(data_assinatura_contrato) AS first_contract_date,
        COUNT(*)                      AS contract_count,
        SUM(valor_final_compra)       AS total_value
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
      WHERE SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), 1, 8) = @cnpj
        AND valor_final_compra >= @min_value
    )
    SELECT
      e.data_inicio_atividade,
      e.porte,
      c.first_contract_date,
      DATE_DIFF(c.first_contract_date, e.data_inicio_atividade, DAY) AS days_to_first_contract,
      c.contract_count,
      c.total_value
    FROM empresa e, contratos c
    WHERE e.data_inicio_atividade IS NOT NULL
      AND c.first_contract_date IS NOT NULL
      AND DATE_DIFF(c.first_contract_date, e.data_inicio_atividade, DAY) BETWEEN 0 AND @max_days
      AND c.total_value >= @min_value
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, empresa_ano: ano, empresa_mes: 12, min_value: NEWBORN_MIN_CONTRACT_VALUE, max_days: NEWBORN_MAX_DAYS_TO_CONTRACT },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  if (rows.length === 0) { setCache(cacheKey, null); return null; }
  const r = rows[0] as Record<string, unknown>;
  const flag: NewbornCompanyFlag = {
    pattern: "newborn_company",
    foundingDate: String(r.data_inicio_atividade ?? ""),
    firstContractDate: String(r.first_contract_date ?? ""),
    daysToFirstContract: Number(r.days_to_first_contract ?? 0),
    companySize: String(r.porte ?? ""),
    totalContractValue: Number(r.total_value ?? 0),
  };
  setCache(cacheKey, flag);
  return flag;
}

async function patternSuddenSurge(cnpj: string, ano: number): Promise<SuddenSurgeFlag | null> {
  const cacheKey = `patterns_sudden_surge_${cnpj}_${ano}`;
  const cached = getCache<SuddenSurgeFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  const sql = `
    SELECT
      ano,
      SUM(valor_final_compra)           AS annual_value,
      COUNT(*)                          AS contract_count,
      COUNT(DISTINCT id_orgao_superior) AS agency_count
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND ano BETWEEN @ano_min AND @ano_max
    GROUP BY ano
    ORDER BY ano
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano_min: ano - SURGE_LOOKBACK_YEARS, ano_max: ano },
    location: "US",
  });
  const [rawRows] = await job.getQueryResults();
  const typed = rawRows as Array<Record<string, unknown>>;
  const history = typed.map((r) => ({
    ano: Number(r.ano),
    value: Number(r.annual_value ?? 0),
    contracts: Number(r.contract_count ?? 0),
  }));

  let surgeFlag: SuddenSurgeFlag | null = null;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (curr.ano - prev.ano === 1 && prev.value > 0 && curr.value >= SURGE_MIN_ABSOLUTE_VALUE && curr.value / prev.value >= SURGE_RATIO_THRESHOLD) {
      surgeFlag = {
        pattern: "sudden_surge",
        surgeYear: curr.ano,
        priorYearValue: prev.value,
        surgeYearValue: curr.value,
        surgeRatio: curr.value / prev.value,
        surgeYearAgencies: Number(typed[i]?.agency_count ?? 0),
        history,
      };
      break;
    }
  }
  setCache(cacheKey, surgeFlag);
  return surgeFlag;
}

async function runPatterns(cnpj: string, ano: number): Promise<PatternResult> {
  const cacheKey = `patterns_${cnpj}_${ano}`;
  const cached = getCache<PatternResult>(cacheKey);
  if (cached !== undefined) return cached;

  const settled = await Promise.allSettled([
    patternSplitContracts(cnpj, ano),
    patternConcentration(cnpj, ano),
    patternInexigibility(cnpj, ano),
    patternSingleBidder(cnpj, ano),
    patternAlwaysWinner(cnpj, ano),
    patternAmendmentInflation(cnpj, ano),
    patternNewbornCompany(cnpj, ano),
    patternSuddenSurge(cnpj, ano),
  ]);

  const flags: PatternFlag[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      const val = result.value;
      if (Array.isArray(val)) flags.push(...(val as PatternFlag[]));
      else if (val !== null) flags.push(val as PatternFlag);
    } else {
      console.error("[patterns] pattern failed:", result.reason);
    }
  }

  const patternResult: PatternResult = { cnpj, detectedAt: new Date().toISOString(), flags };
  setCache(cacheKey, patternResult);
  return patternResult;
}

function classifyError(err: unknown): { kind: "auth" | "billing" | "other"; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("UNAUTHENTICATED") || msg.includes("credentials")) {
    return { kind: "auth", message: msg };
  }
  if (
    msg.includes("GCP_PROJECT_ID") ||
    msg.includes("billing") ||
    msg.includes("projectId") ||
    msg.includes("project") ||
    err instanceof BillingError
  ) {
    return { kind: "billing", message: msg };
  }
  return { kind: "other", message: msg };
}

function parseLookupLimit(value: string | null): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return LOOKUP_LIMIT_DEFAULT;
  const normalized = Math.trunc(parsed);
  if (normalized === 10 || normalized === 20 || normalized === 30 || normalized === 40) {
    return normalized;
  }
  return LOOKUP_LIMIT_DEFAULT;
}


function renderAlertasHtml(result: PatternResult): string {
  if (result.flags.length === 0) {
    return `<div class="alerta-empty">Nenhum alerta identificado para este CNPJ.</div>`;
  }
  return result.flags.map((flag) => {
    switch (flag.pattern) {
      case "split_contracts_below_threshold": {
        const sev = flag.contractCount >= 5 ? "red" : "orange";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Possível Fracionamento de Licitação</div>
          <div class="alerta-meta">
            <span>${escHtml(flag.agencyName)}</span>
            <span>${escHtml(flag.month)} · ${flag.contractCount} contratos · total ${brl.format(flag.combinedValue)}</span>
            <span>Máx. individual: ${brl.format(flag.maxSingleValue)}</span>
          </div>
          <div class="alerta-source">CGU · contrato_compra · Lei 8.666/93 art.23</div>
        </div>`;
      }
      case "contract_concentration": {
        const pct = (flag.supplierShare * 100).toFixed(1);
        const sev = flag.supplierShare > 0.60 ? "red" : "orange";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Alta Concentração de Contratos</div>
          <div class="alerta-meta">
            <span>${escHtml(flag.agencyName)} · ${pct}% do total · ano ${flag.year}</span>
            <span>Fornecedor: ${brl.format(flag.supplierSpend)} · Agência: ${brl.format(flag.agencyTotalSpend)}</span>
          </div>
          <div class="alerta-source">CGU · contrato_compra</div>
        </div>`;
      }
      case "inexigibility_recurrence": {
        const sev = flag.contractCount >= 10 ? "red" : flag.contractCount >= 6 ? "orange" : "yellow";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Recorrência de Inexigibilidade</div>
          <div class="alerta-meta">
            <span>${escHtml(flag.agencyUnit)}</span>
            <span>${flag.contractCount} contratos · ${brl.format(flag.totalValue)}</span>
            <span>${escHtml(flag.firstDate)} — ${escHtml(flag.lastDate)}</span>
          </div>
          <div class="alerta-source">CGU · contrato_compra</div>
        </div>`;
      }
      case "single_bidder": {
        const sev = flag.occurrences >= 10 ? "red" : flag.occurrences >= 5 ? "orange" : "yellow";
        const objs = flag.sampleObjects.length > 0
          ? `<span>Exemplos: ${flag.sampleObjects.map(escHtml).join(" · ")}</span>` : "";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Vencedor Único em Licitações</div>
          <div class="alerta-meta">
            <span>${flag.occurrences} licitações sem concorrência · ${brl.format(flag.totalValue)}</span>
            <span>${flag.agencies.slice(0, 3).map(escHtml).join(", ")}${flag.agencies.length > 3 ? ` +${flag.agencies.length - 3}` : ""}</span>
            ${objs}
          </div>
          <div class="alerta-source">CGU · licitacao_participante · OCP Red Flags #1</div>
        </div>`;
      }
      case "always_winner": {
        const pct = (flag.winRate * 100).toFixed(1);
        const sev = flag.winRate >= 0.90 ? "red" : flag.winRate >= 0.75 ? "orange" : "yellow";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Taxa de Vitória Anômala em Licitações</div>
          <div class="alerta-meta">
            <span>${pct}% de vitórias · ${flag.totalWins} de ${flag.totalParticipations} licitações</span>
            <span>Valor total disputado: ${brl.format(flag.totalValueCompeted)}</span>
          </div>
          <div class="alerta-source">CGU · licitacao_participante</div>
        </div>`;
      }
      case "amendment_inflation": {
        const maxPct = ((flag.maxInflationRatio - 1) * 100).toFixed(0);
        const sev = flag.maxInflationRatio >= 2.0 ? "red" : "orange";
        const zeroAmendNote = flag.zeroAmendmentCount > 0
          ? `<span>⚠ ${flag.zeroAmendmentCount} sem termos aditivos registrados</span>` : "";
        // constructionCount: contracts that were flagged at the 1.50× construction threshold.
        // Show a note so analysts know the 50% legal ceiling applied (not 25%).
        const constructionNote = flag.constructionCount > 0
          ? `<span title="Teto legal 50% (Lei 14.133 art.125 §1º, II)">${flag.constructionCount} de obra/engenharia (limite 50%)</span>` : "";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Superfaturamento via Aditivos Contratuais</div>
          <div class="alerta-meta">
            <span>${flag.contractCount} contratos acima do limite legal · excesso ${brl.format(flag.excessValue)}</span>
            <span>Maior índice: +${maxPct}% · ${escHtml(flag.worstAgency)}</span>
            ${constructionNote}
            ${zeroAmendNote}
          </div>
          <div class="alerta-source">CGU · contrato_compra · Lei 14.133/2021 art.125</div>
        </div>`;
      }
      case "newborn_company": {
        const months = Math.round(flag.daysToFirstContract / 30);
        const sev = flag.daysToFirstContract < 30 ? "red" : flag.daysToFirstContract < 90 ? "orange" : "yellow";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Empresa Recém-Constituída com Contratos Públicos</div>
          <div class="alerta-meta">
            <span>Fundada ${escHtml(flag.foundingDate)} · primeiro contrato ${escHtml(flag.firstContractDate)} (${months < 1 ? "< 1 mês" : months + " mês(es)"})</span>
            <span>Porte: ${escHtml(flag.companySize)} · total ${brl.format(flag.totalContractValue)}</span>
          </div>
          <div class="alerta-source">Receita Federal + CGU</div>
        </div>`;
      }
      case "sudden_surge": {
        const multiple = flag.surgeRatio.toFixed(1);
        const sev = flag.surgeRatio >= 10 ? "red" : "orange";
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Crescimento Explosivo de Contratos Públicos</div>
          <div class="alerta-meta">
            <span>${flag.surgeYear}: ${multiple}× · ${brl.format(flag.priorYearValue)} → ${brl.format(flag.surgeYearValue)}</span>
            <span>${flag.surgeYearAgencies} órgão(s) no ano do salto</span>
          </div>
          <div class="alerta-source">CGU · contrato_compra</div>
        </div>`;
      }
    }
  }).join("");
}

// --- HTML renderer ---
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatCapital(val: number | null): string {
  if (val == null || val === 0) return "—";
  return brl.format(val);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildUrl(base: URLSearchParams, overrides: Record<string, string>): string {
  const p = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    p.set(k, v);
  }
  return "/table?" + p.toString();
}

function renderPage(
  params: QueryParams,
  rows: Company[] | null,
  error: { kind: "auth" | "billing" | "other"; message: string } | null,
  usageData: UsageData
): string {
  const sp = new URLSearchParams({
    ano: String(params.ano),
    limit: String(params.limit),
    offset: String(params.offset),
    search: params.search,
  });

  const prevOffset = Math.max(0, params.offset - params.limit);
  const nextOffset = params.offset + params.limit;
  const hasPrev = params.offset > 0;
  const hasNext = rows != null && rows.length === params.limit;

  const tableRows =
    rows == null
      ? ""
      : rows.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:#888;padding:2rem">Nenhum resultado encontrado.</td></tr>`
      : rows
          .map(
            (r) => `
        <tr>
          <td>${escHtml(r.cnpj_basico ?? "")}</td>
          <td>${escHtml(r.razao_social ?? "")}</td>
          <td>${escHtml(r.natureza_juridica ?? "")}</td>
          <td>${escHtml(r.porte ?? "")}</td>
          <td class="capital-cell">${formatCapital(r.capital_social)}</td>
          <td>${escHtml(r.ente_federativo ?? "")}</td>
          <td>${r.ano ?? ""}</td>
          <td><a href="/?cnpj=${escHtml(r.cnpj_basico ?? "")}" title="Ver grafo" class="graph-link">⬡</a></td>
        </tr>`
          )
          .join("");

  const errorBanner = error
    ? `<div class="error ${error.kind}">
        ${
          error.kind === "auth"
            ? `<strong>Erro de autenticação.</strong> Execute <code>gcloud auth application-default login</code> e reinicie o servidor.`
            : error.kind === "billing"
            ? `<strong>Projeto GCP não configurado.</strong> Defina <code>GCP_PROJECT_ID=seu-projeto</code> ao iniciar o servidor.<br><small>${escHtml(error.message)}</small>`
            : `<strong>Erro:</strong> ${escHtml(error.message)}`
        }
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DATATIVE — CNPJ Browser</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f7fa; color: #1a1a2e; }
    header { background: #1a1a2e; color: #fff; padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }
    header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.05em; }
    header span { font-size: 0.85rem; opacity: 0.6; }
    main { max-width: 1400px; margin: 0 auto; padding: 1.5rem 2rem; }
    .filters { background: #fff; border-radius: 8px; padding: 1rem 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 1.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    label { font-size: 0.75rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }
    input, select { border: 1px solid #ddd; border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.9rem; }
    input:focus, select:focus { outline: 2px solid #4f46e5; border-color: transparent; }
    .search-field { flex: 1; min-width: 200px; }
    .search-field input { width: 100%; }
    button[type=submit] { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 0.45rem 1.2rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    button[type=submit]:hover { background: #4338ca; }
    .error { border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; font-size: 0.9rem; line-height: 1.6; }
    .error.auth { background: #fef2f2; border: 1px solid #fca5a5; color: #7f1d1d; }
    .error.billing { background: #fffbeb; border: 1px solid #fcd34d; color: #78350f; }
    .error.other { background: #f0f9ff; border: 1px solid #7dd3fc; color: #0c4a6e; }
    .error code { background: rgba(0,0,0,.06); border-radius: 3px; padding: 0 4px; font-family: monospace; font-size: 0.85em; }
    .table-wrap { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    thead th { background: #f8f8ff; position: sticky; top: 0; text-align: left; padding: 0.65rem 1rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
    tbody tr:hover { background: #f5f7ff; }
    tbody td { padding: 0.55rem 1rem; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    .pagination { display: flex; gap: 0.75rem; align-items: center; justify-content: flex-end; margin-top: 1rem; }
    .pagination a { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 0.4rem 0.9rem; font-size: 0.85rem; font-weight: 600; color: #4f46e5; text-decoration: none; }
    .pagination a:hover { background: #4f46e5; color: #fff; border-color: #4f46e5; }
    .pagination .page-info { font-size: 0.8rem; color: #888; }
    .graph-link { text-decoration: none; font-size: 1rem; color: #4f46e5; opacity: 0.7; }
    .graph-link:hover { opacity: 1; }
  </style>
</head>
<body>
  <header>
    <h1>DATATIVE</h1>
    <span>CNPJ / Receita Federal · basedosdados.br_me_cnpj.empresas</span>
    <span style="margin-left:auto;font-size:0.8rem;opacity:0.85">
      BQ ${usageData.month} &nbsp;·&nbsp;
      ${(usageData.bytes / 1e9).toFixed(2)} GB consumidos
      &nbsp;·&nbsp;
      ${((usageData.bytes / FREE_TIER_BYTES) * 100).toFixed(3)}% do 1 TB free
      &nbsp;·&nbsp;
      ${((FREE_TIER_BYTES - usageData.bytes) / 1e9).toFixed(2)} GB restantes
    </span>
  </header>
  <main>
    <form class="filters" method="GET" action="/table">
      <div class="field">
        <label for="ano">Ano</label>
        <input id="ano" name="ano" type="number" min="2000" max="2030" value="${params.ano}" style="width:90px">
      </div>
      <div class="field">
        <label for="limit">Por página</label>
        <select id="limit" name="limit">
          ${[25, 50, 100]
            .map(
              (n) =>
                `<option value="${n}"${n === params.limit ? " selected" : ""}>${n}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="field search-field">
        <label for="search">Razão Social</label>
        <input id="search" name="search" type="text" placeholder="ex: PETROBRAS" value="${escHtml(params.search)}">
      </div>
      <input type="hidden" name="offset" value="0">
      <button type="submit">Buscar</button>
    </form>

    ${errorBanner}

    ${
      rows != null
        ? `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CNPJ Básico</th>
            <th>Razão Social</th>
            <th>Natureza Jurídica</th>
            <th>Porte</th>
            <th style="text-align:right">Capital Social</th>
            <th>Ente Federativo</th>
            <th>Ano</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    <div class="pagination">
      <span class="page-info">Offset ${params.offset} · ${rows.length} linha(s)</span>
      ${hasPrev ? `<a href="${buildUrl(sp, { offset: String(prevOffset) })}">← Anterior</a>` : ""}
      ${hasNext ? `<a href="${buildUrl(sp, { offset: String(nextOffset) })}">Próxima →</a>` : ""}
    </div>`
        : ""
    }
  </main>
</body>
</html>`;
}

// --- Graph API helper ---
function trackBytes(bytes: number) {
  if (bytes > 0) {
    if (usage.month !== currentMonth()) usage = { month: currentMonth(), bytes: 0 };
    usage.bytes += bytes;
    saveUsage(usage);
  }
}

// --- / landing page ---
function renderGraphLanding(): string {
  // Build community feed: voted CNPJs first (by score), then top-flagged unvoted
  const leaderboard  = getLeaderboard(40);
  const topFlagged   = getTopFlagged(20);
  const seenCnpjs    = new Set(leaderboard.map((e) => e.cnpj));

  const feedItems: Array<{ cnpj: string; name: string; porte: string; score: number; flagCount: number; flagTypes: string[] }> = [];

  const parseTypes = (raw: string): string[] => { try { return JSON.parse(raw) as string[]; } catch { return []; } };

  for (const entry of leaderboard) {
    feedItems.push({ cnpj: entry.cnpj, name: entry.razao_social ?? entry.cnpj, porte: "", score: entry.score, flagCount: entry.flag_count, flagTypes: parseTypes(entry.flag_types) });
  }
  for (const entry of topFlagged) {
    if (!seenCnpjs.has(entry.cnpj)) {
      seenCnpjs.add(entry.cnpj);
      feedItems.push({ cnpj: entry.cnpj, name: entry.razao_social ?? entry.cnpj, porte: "", score: 0, flagCount: entry.flag_count, flagTypes: parseTypes(entry.flag_types) });
    }
  }

  const companyRows = feedItems
    .map((c) => {
      const scoreLabel = c.score > 0 ? `+${c.score}` : c.score < 0 ? `${c.score}` : "0";
      const chips = c.flagTypes
        .map((p) => PATTERN_LABELS[p] ?? p)
        .map((label) => `<span class="ci-chip">${escHtml(label)}</span>`)
        .join("");
      const reasonRow = chips
        ? `<div class="ci-reasons">${chips}</div>`
        : "";
      return (
        `<div class="ci-row">` +
        `<div class="ci-vote-col">` +
        `<button class="ci-vote-btn ci-up" data-cnpj="${escHtml(c.cnpj)}" data-dir="1" title="Suspeito">&#9650;</button>` +
        `<span class="ci-score" data-cnpj="${escHtml(c.cnpj)}">${scoreLabel}</span>` +
        `<button class="ci-vote-btn ci-dn" data-cnpj="${escHtml(c.cnpj)}" data-dir="-1" title="Sem evidência">&#9660;</button>` +
        `</div>` +
        `<a href="/?cnpj=${escHtml(c.cnpj)}" class="ci-link">` +
        `<div class="ci-main">` +
        `<span class="ci-cnpj">${escHtml(c.cnpj)}</span>` +
        `<span class="ci-name">${escHtml(c.name)}</span>` +
        `</div>` +
        reasonRow +
        `</a>` +
        `</div>`
      );
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DATATIVE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap">
  <style>
    :root {
      --bg: #06060e; --surface: #0d0d20; --border: #1c1c38;
      --gold: #e8b84b; --text: #e4e4f0; --muted: #6868aa;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'DM Sans', sans-serif;
      background-color: var(--bg);
      background-image: radial-gradient(circle, #1a1a36 1.5px, transparent 1.5px);
      background-size: 28px 28px;
      color: var(--text);
      display: flex;
      flex-direction: column;
    }
    body::before {
      content: '';
      display: block;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold) 60%, transparent 100%);
      flex-shrink: 0;
    }
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 3rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .nav-brand {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.35rem;
      letter-spacing: 0.12em;
      color: var(--gold);
      text-decoration: none;
    }
    .nav-links { display: flex; gap: 1.5rem; }
    .nav-links a {
      color: var(--text);
      text-decoration: none;
      font-family: 'Space Mono', monospace;
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      opacity: 0.4;
      transition: opacity 0.15s;
    }
    .nav-links a:hover { opacity: 1; }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 3rem 2rem;
      max-width: 820px;
    }
    .eyebrow {
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      color: var(--gold);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      margin-bottom: 0.6rem;
      opacity: 0.85;
    }
    .wordmark {
      font-family: 'Bebas Neue', sans-serif;
      font-size: clamp(5rem, 13vw, 9.5rem);
      line-height: 0.88;
      letter-spacing: 0.03em;
      color: var(--text);
    }
    .wordmark span {
      display: inline-block;
      opacity: 0;
      transform: translateY(24px);
      animation: letterIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes letterIn { to { opacity: 1; transform: translateY(0); } }
    .gold-rule {
      width: 72px;
      height: 2px;
      background: var(--gold);
      margin: 1.6rem 0;
    }
    .tagline {
      font-size: 0.95rem;
      color: var(--muted);
      max-width: 460px;
      line-height: 1.7;
      margin-bottom: 2.8rem;
      font-weight: 300;
      letter-spacing: 0.01em;
    }
    .form-label {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      letter-spacing: 0.22em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 0.6rem;
    }
    .search-row { display: flex; gap: 0; max-width: 440px; }
    input[name=cnpj] {
      flex: 1;
      background: transparent;
      border: 1px solid var(--border);
      border-right: none;
      padding: 0.85rem 1.2rem;
      font-family: 'Space Mono', monospace;
      font-size: 1rem;
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
      letter-spacing: 0.05em;
    }
    input[name=cnpj]:focus { border-color: var(--gold); }
    input[name=cnpj]::placeholder { color: #2a2a4a; }
    button[type=submit] {
      background: var(--gold);
      color: #06060e;
      border: none;
      padding: 0.85rem 2rem;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.1rem;
      letter-spacing: 0.12em;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap;
    }
    button[type=submit]:hover { background: #f5cc6a; }
    footer {
      padding: 0.9rem 3rem;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .footer-copy {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #252540;
      letter-spacing: 0.1em;
    }
    .footer-status {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #303050;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .status-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--gold);
      animation: blink 2.5s ease-in-out infinite;
    }
    @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
    /* landing layout */
    html, body { height: 100%; overflow: hidden; }
    .layout { display: flex; flex: 1; overflow: hidden; min-height: 0; }
    main {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 3rem 2rem;
      max-width: 580px;
      min-width: 420px;
    }
    @media (max-width: 700px) {
      html, body { height: auto; overflow: auto; }
      .layout { flex-direction: column; overflow: visible; }
      nav { padding: 0.85rem 1.25rem; }
      main { min-width: 0; max-width: 100%; padding: 1.5rem 1.25rem 1rem; justify-content: flex-start; }
      .wordmark { font-size: clamp(3.5rem, 18vw, 5rem); }
      .tagline { margin-bottom: 1.5rem; }
      .search-row { max-width: 100%; }
      .ci-panel { border-left: none; border-top: 1px solid var(--border); max-height: 50vh; }
      footer { padding: 0.75rem 1.25rem; }
      .ci-note-row { padding: 0.5rem 0.9rem; }
      .ci-link { padding: 0.45rem 0.9rem; }
    }
    /* companies panel */
    .ci-panel {
      flex: 1;
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ci-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 1.2rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .ci-panel-label {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      color: var(--gold);
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .ci-panel-count {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      letter-spacing: 0.08em;
    }
    .ci-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.25rem 0;
    }
    .ci-scroll::-webkit-scrollbar { width: 4px; }
    .ci-scroll::-webkit-scrollbar-track { background: transparent; }
    .ci-scroll::-webkit-scrollbar-thumb { background: #1c1c38; border-radius: 2px; }
    .ci-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.5rem 1.2rem;
      text-decoration: none;
      border-bottom: 1px solid #0d0d1e;
      transition: background 0.1s;
    }
    .ci-row:hover { background: #0f0f28; }
    .ci-cnpj {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      color: var(--gold);
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }
    .ci-name {
      font-size: 0.78rem;
      color: #9090c0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .ci-porte {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      flex-shrink: 0;
    }
    .ci-row {
      display: flex;
      align-items: center;
      border-bottom: 1px solid #0d0d1e;
    }
    .ci-vote-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.3rem 0.4rem 0.3rem 0.6rem;
      flex-shrink: 0;
      gap: 0.05rem;
    }
    .ci-vote-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.6rem;
      line-height: 1;
      padding: 0.1rem 0.25rem;
      color: #2a2a44;
      transition: color 0.12s;
    }
    .ci-vote-btn:hover { color: var(--gold); }
    .ci-vote-btn.active-up  { color: var(--gold); }
    .ci-vote-btn.active-dn  { color: #6868aa; }
    .ci-score {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      color: #4a4a70;
      min-width: 1.6rem;
      text-align: center;
    }
    .ci-score.pos { color: var(--gold); }
    .ci-score.neg { color: #6868aa; }
    .ci-link {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.45rem 0.9rem 0.45rem 0.3rem;
      text-decoration: none;
      transition: background 0.1s;
      overflow: hidden;
      min-width: 0;
    }
    .ci-link:hover { background: #0f0f28; }
    .ci-main {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      overflow: hidden;
    }
    .ci-reasons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .ci-chip {
      font-family: 'Space Mono', monospace;
      font-size: 0.5rem;
      letter-spacing: 0.04em;
      color: #e8b84b;
      background: rgba(232,184,75,0.07);
      border: 1px solid rgba(232,184,75,0.18);
      border-radius: 3px;
      padding: 0.06rem 0.35rem;
      white-space: nowrap;
    }
    .ci-panel-tabs {
      display: flex;
      gap: 0;
      padding: 0 0.6rem;
    }
    .ci-tab {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.4rem 0.5rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      background: none;
      border-top: none; border-left: none; border-right: none;
      transition: color 0.15s, border-color 0.15s;
    }
    .ci-tab.active { color: var(--gold); border-bottom-color: var(--gold); }
    .ci-note-row {
      padding: 0.5rem 1.2rem;
      border-bottom: 1px solid #0d0d1e;
    }
    .ci-note-body {
      font-size: 0.75rem;
      color: #9090c0;
      line-height: 1.5;
      margin-bottom: 0.2rem;
    }
    .ci-note-meta {
      font-family: 'Space Mono', monospace;
      font-size: 0.56rem;
      color: #2e2e50;
    }
    .ci-note-cnpj {
      color: var(--gold);
      text-decoration: none;
      font-family: 'Space Mono', monospace;
      font-size: 0.56rem;
    }
    .ci-note-cnpj:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav>
    <a class="nav-brand" href="/">DATA_</a>
    <div class="nav-links">
      <a href="/table">BASE DE DADOS →</a>
    </div>
  </nav>
  <div class="layout">
    <main>
      <p class="eyebrow">// sistema de investigação · br</p>
      <h1 class="wordmark">
        <span style="animation-delay:.04s">D</span><span style="animation-delay:.09s">A</span><span style="animation-delay:.14s">T</span><span style="animation-delay:.19s">A</span><span style="animation-delay:.24s">T</span><span style="animation-delay:.29s">I</span><span style="animation-delay:.34s">V</span><span style="animation-delay:.39s">E</span>
      </h1>
      <div class="gold-rule"></div>
      <p class="tagline">Cruzamento de CNPJs com bases públicas federais — Receita Federal, CGU, TSE, SIAFI e mais.</p>
      <p class="form-label">[ cnpj básico ]</p>
      <form class="search-row" method="GET" action="/">
        <input name="cnpj" type="text" placeholder="00000000" autocomplete="off" autofocus spellcheck="false" maxlength="14">
        <button type="submit">BUSCAR</button>
      </form>
    </main>
    <aside class="ci-panel">
      <div class="ci-panel-header">
        <span class="ci-panel-label">[ investigações ]</span>
        <div class="ci-panel-tabs">
          <button class="ci-tab active" data-tab="casos">CASOS</button>
          <button class="ci-tab" data-tab="notas">NOTAS</button>
        </div>
      </div>
      <div class="ci-scroll" id="tab-casos">
        ${companyRows}
      </div>
      <div class="ci-scroll" id="tab-notas" style="display:none">
        <div id="notes-feed"><span style="font-family:'Space Mono',monospace;font-size:0.62rem;color:#2e2e50;padding:1rem;display:block">Nenhuma nota ainda.</span></div>
      </div>
    </aside>
  </div>
  <footer>
    <span class="footer-copy">DATATIVE · CNPJ GRAPH · BASE DOS DADOS</span>
    <span class="footer-status"><span class="status-dot"></span> SISTEMA ATIVO</span>
  </footer>
  <script>
  (function() {
    // Tab switch
    document.querySelectorAll('.ci-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ci-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.dataset.tab;
        document.getElementById('tab-casos').style.display = tab === 'casos' ? '' : 'none';
        document.getElementById('tab-notas').style.display = tab === 'notas' ? '' : 'none';
        if (tab === 'notas') loadNotesFeed();
      });
    });

    // Vote buttons on landing (▲ up / ▼ down)
    document.querySelectorAll('.ci-vote-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var cnpj = btn.dataset.cnpj;
        var dir  = parseInt(btn.dataset.dir, 10);
        fetch('/api/vote/' + cnpj, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: dir }),
        })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            // Update score label
            var scoreEl = document.querySelector('.ci-score[data-cnpj="' + cnpj + '"]');
            if (scoreEl) {
              var s = d.score;
              scoreEl.textContent = s > 0 ? '+' + s : String(s);
              scoreEl.className = 'ci-score' + (s > 0 ? ' pos' : s < 0 ? ' neg' : '');
            }
            // Highlight active button, clear sibling
            var col = btn.closest('.ci-vote-col');
            if (col) {
              col.querySelectorAll('.ci-vote-btn').forEach(function(b) {
                b.classList.remove('active-up', 'active-dn');
              });
            }
            btn.classList.add(dir === 1 ? 'active-up' : 'active-dn');
          });
      });
    });

    // Notes feed (global recent notes)
    function loadNotesFeed() {
      fetch('/api/notes/recent')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var feed = document.getElementById('notes-feed');
          if (!data.notes || !data.notes.length) {
            feed.innerHTML = '<span style="font-family:\\'Space Mono\\',monospace;font-size:0.62rem;color:#2e2e50;padding:1rem;display:block">Nenhuma nota ainda.</span>';
            return;
          }
          feed.innerHTML = data.notes.map(function(n) {
            return '<div class="ci-note-row">' +
              '<div class="ci-note-body">' + escHtml(n.body) + '</div>' +
              '<div class="ci-note-meta">' +
              '<a class="ci-note-cnpj" href="/?cnpj=' + n.cnpj + '">' + n.cnpj + '</a>' +
              ' · ' + (n.author || 'anônimo') + ' · ' + n.created_at.slice(0, 16) +
              '</div></div>';
          }).join('');
        });
    }
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  })();
  </script>
</body>
</html>`;
}

// --- /graph HTML page ---
function renderGraphPage(cnpj: string, usageData: UsageData): string {
  const gbUsed = (usageData.bytes / 1e9).toFixed(2);
  const pct = ((usageData.bytes / FREE_TIER_BYTES) * 100).toFixed(3);
  const gbLeft = ((FREE_TIER_BYTES - usageData.bytes) / 1e9).toFixed(2);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DATA_ ${escHtml(cnpj)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap">
  <style>
    :root {
      --bg: #06060e; --surface: #0d0d20; --border: #1c1c38;
      --gold: #e8b84b; --text: #e4e4f0; --muted: #6868aa;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
    }
    .gold-bar {
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold) 60%, transparent 100%);
      flex-shrink: 0;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 1.5rem;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-shrink: 0;
    }
    .h-brand {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.2rem;
      letter-spacing: 0.1em;
      color: var(--gold);
    }
    .h-divider {
      width: 1px;
      height: 18px;
      background: var(--border);
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0;
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      letter-spacing: 0.06em;
    }
    .breadcrumb a, .breadcrumb span {
      color: var(--muted);
      text-decoration: none;
      white-space: nowrap;
    }
    .breadcrumb a:hover { color: var(--gold); }
    .breadcrumb .bc-sep {
      margin: 0 0.4rem;
      color: #2e2e50;
      user-select: none;
    }
    .breadcrumb .bc-current {
      color: var(--gold);
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .control-group {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }
    .control-group + .control-group {
      margin-left: 0.6rem;
    }
    .control-label {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: var(--muted);
      letter-spacing: 0.07em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    #layout-select, #query-limit-select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
      cursor: pointer;
      outline: none;
    }
    #query-limit-select { min-width: 56px; text-align: center; }
    #layout-select:hover, #query-limit-select:hover { border-color: var(--gold); color: var(--text); }
    #layout-select option, #query-limit-select option { background: #0d0d20; }
    #status {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      color: var(--muted);
      letter-spacing: 0.05em;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #graph-container {
      flex: 1;
      width: 100%;
      position: relative;
      background: #08080f;
    }
    footer {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 0 1.5rem;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    footer span {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: var(--muted);
      letter-spacing: 0.05em;
    }
    .footer-meta {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 0;
    }
    .footer-meta span + span::before { content: " | "; color: #2e2e50; }
    #loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.25rem;
      background: #08080f;
      z-index: 10;
      pointer-events: none;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 2px solid var(--gold);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      color: #6b7aaa;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    /* --- Alertas de Risco panel --- */
    #alertas-panel {
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 370px;
      max-height: 55vh;
      background: rgba(13,13,32,0.96);
      border: 1px solid #1c1c38;
      border-radius: 6px;
      z-index: 20;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(4px);
    }
    .alertas-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.75rem;
      border-bottom: 1px solid #1c1c38;
      flex-shrink: 0;
    }
    .alertas-title {
      font-family: 'Space Mono', monospace;
      font-size: 0.56rem;
      color: var(--gold);
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    #alertas-toggle {
      background: none;
      border: none;
      color: #6868aa;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      padding: 0;
    }
    #alertas-toggle:hover { color: var(--gold); }
    #alertas-body {
      overflow-y: auto;
      flex: 1;
      padding: 0.4rem 0.5rem;
    }
    #alertas-body.collapsed { display: none; }
    #alertas-body::-webkit-scrollbar { width: 3px; }
    #alertas-body::-webkit-scrollbar-thumb { background: #1c1c38; }
    .alertas-loading {
      display: block;
      padding: 0.4rem;
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      color: #4a4a70;
    }
    .alerta-card {
      border-left: 3px solid;
      padding: 0.45rem 0.55rem;
      margin-bottom: 0.4rem;
      border-radius: 0 4px 4px 0;
    }
    .alerta-card.red    { border-color: #ef4444; background: rgba(239,68,68,0.07); }
    .alerta-card.orange { border-color: #f97316; background: rgba(249,115,22,0.07); }
    .alerta-card.yellow { border-color: #eab308; background: rgba(234,179,8,0.07); }
    .alerta-title { font-weight: 600; color: #e4e4f0; font-size: 0.75rem; margin-bottom: 0.25rem; }
    .alerta-meta { display: flex; flex-direction: column; gap: 0.1rem; }
    .alerta-meta span { color: #8080b0; font-size: 0.68rem; line-height: 1.4; }
    .alerta-source { color: #30304a; font-size: 0.58rem; margin-top: 0.25rem; }
    .alerta-empty { color: #3a3a60; font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.4rem; }
    @media (max-width: 640px) {
      header { padding: 0 0.75rem; gap: 0.6rem; flex-wrap: wrap; height: auto; min-height: 44px; padding-top: 0.4rem; padding-bottom: 0.4rem; }
      .h-brand { font-size: 1rem; }
      .breadcrumb { font-size: 0.55rem; }
      .control-label { display: none; }
      .layout-select, .query-limit-select { font-size: 0.7rem; padding: 0.2rem 0.3rem; }
      #alertas-panel {
        right: 0.5rem; bottom: 2.5rem;
        width: calc(100vw - 1rem); max-height: 40vh;
      }
      #community-panel {
        left: 0.5rem; bottom: 2.5rem;
        width: calc(100vw - 1rem); max-height: 40vh;
        display: none; /* hidden by default on mobile; user taps to open */
      }
      footer { font-size: 0.6rem; padding: 0 0.75rem; gap: 0.4rem; }
    }
    /* community panel */
    #community-panel {
      position: absolute;
      bottom: 2.8rem;
      left: 1rem;
      width: 260px;
      max-height: 420px;
      background: rgba(9,9,22,0.96);
      border: 1px solid #1c1c38;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      font-size: 0.78rem;
      backdrop-filter: blur(6px);
      z-index: 50;
    }
    .comm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.75rem;
      border-bottom: 1px solid #1c1c38;
      flex-shrink: 0;
    }
    .comm-title {
      font-family: 'Space Mono', monospace;
      font-size: 0.56rem;
      color: var(--gold);
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    #comm-toggle {
      background: none; border: none; color: #6868aa;
      cursor: pointer; font-size: 1rem; line-height: 1; padding: 0;
    }
    #comm-toggle:hover { color: var(--gold); }
    #comm-body { overflow-y: auto; flex: 1; }
    #comm-body.collapsed { display: none; }
    #comm-body::-webkit-scrollbar { width: 3px; }
    #comm-body::-webkit-scrollbar-thumb { background: #1c1c38; }
    .comm-vote-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid #0d0d1e;
    }
    .comm-vote-row { gap: 0.4rem; flex-wrap: wrap; }
    .comm-vote-dir {
      background: none;
      border: 1px solid #2a2a44;
      border-radius: 4px;
      color: #6868aa;
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      padding: 0.28rem 0.55rem;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .comm-vote-dir:hover { border-color: var(--gold); color: var(--gold); }
    .comm-vote-dir.active-up { border-color: var(--gold); color: var(--gold); background: rgba(232,184,75,0.1); }
    .comm-vote-dir.active-dn { border-color: #6868aa; color: #6868aa; background: rgba(104,104,170,0.1); }
    #vote-score {
      font-family: 'Space Mono', monospace;
      font-size: 0.72rem;
      color: #4a4a70;
      min-width: 1.5rem;
      text-align: center;
    }
    #vote-score.pos { color: var(--gold); }
    #vote-score.neg { color: #6868aa; }
    .comm-notes {
      padding: 0.4rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .comm-note {
      background: rgba(255,255,255,0.02);
      border-radius: 4px;
      padding: 0.4rem 0.5rem;
      border-left: 2px solid #1c1c38;
    }
    .comm-note-body { color: #9090c0; font-size: 0.72rem; line-height: 1.45; margin-bottom: 0.2rem; }
    .comm-note-meta { font-family: 'Space Mono', monospace; font-size: 0.54rem; color: #30304a; }
    .comm-note-empty { font-family: 'Space Mono', monospace; font-size: 0.62rem; color: #2a2a44; padding: 0.4rem 0.5rem; }
    .comm-form {
      border-top: 1px solid #0d0d1e;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex-shrink: 0;
    }
    .comm-form textarea {
      background: transparent;
      border: 1px solid #1c1c38;
      border-radius: 4px;
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      font-size: 0.72rem;
      padding: 0.4rem 0.5rem;
      resize: none;
      height: 60px;
      outline: none;
    }
    .comm-form textarea:focus { border-color: var(--gold); }
    .comm-form input {
      background: transparent;
      border: 1px solid #1c1c38;
      border-radius: 4px;
      color: var(--text);
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      padding: 0.3rem 0.5rem;
      outline: none;
    }
    .comm-form input:focus { border-color: var(--gold); }
    .comm-submit {
      align-self: flex-end;
      background: none;
      border: 1px solid var(--gold);
      color: var(--gold);
      font-family: 'Bebas Neue', sans-serif;
      font-size: 0.85rem;
      letter-spacing: 0.1em;
      padding: 0.25rem 0.8rem;
      cursor: pointer;
      border-radius: 3px;
      transition: background 0.15s;
    }
    .comm-submit:hover { background: rgba(232,184,75,0.1); }
  </style>
</head>
<body>
  <div class="gold-bar"></div>
  <header>
    <span class="h-brand">DATA_</span>
    <span class="h-divider"></span>
    <nav class="breadcrumb">
      <a href="/">INÍCIO</a>
      <span class="bc-sep">›</span>
      <a href="/?cnpj=${escHtml(cnpj)}">${escHtml(cnpj)}</a>
      <span class="bc-sep">›</span>
      <span class="bc-current" id="bc-label">GRAFO</span>
    </nav>
    <div class="control-group">
      <label class="control-label" for="layout-select">Layout</label>
      <select id="layout-select" class="layout-select">
        <option value="radial">Radial</option>
        <option value="collapsible-tree">Collapsible Tree</option>
        <option value="pack">Pack</option>
        <option value="forceatlas2">Force Atlas 2</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label" for="query-limit-select">Limit</label>
      <select id="query-limit-select" class="query-limit-select">
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="30">30</option>
        <option value="40">40</option>
      </select>
    </div>
  </header>
  <div id="graph-container">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span class="loading-text">consultando bigquery</span>
    </div>
    <div id="alertas-panel">
      <div class="alertas-header">
        <span class="alertas-title">[ alertas de risco ]</span>
        <button id="alertas-toggle" title="Minimizar">&#8722;</button>
      </div>
      <div id="alertas-body">
        <span class="alertas-loading">Verificando padr&#245;es&#8230;</span>
      </div>
    </div>
    <div id="community-panel">
      <div class="comm-header">
        <span class="comm-title">[ investigação coletiva ]</span>
        <button id="comm-toggle" title="Minimizar">&#8722;</button>
      </div>
      <div id="comm-body">
        <div class="comm-vote-row">
          <button class="comm-vote-dir" id="vote-up" data-dir="1" title="Suspeito">&#9650; Suspeito</button>
          <span id="vote-score">…</span>
          <button class="comm-vote-dir" id="vote-dn" data-dir="-1" title="Sem evidência">&#9660; Sem evidência</button>
        </div>
        <div class="comm-notes" id="comm-notes-list">
          <span class="comm-note-empty">Carregando…</span>
        </div>
        <form class="comm-form" id="comm-note-form">
          <textarea name="body" placeholder="Adicione uma nota de investigação…" maxlength="800"></textarea>
          <input name="author" type="text" placeholder="Seu nome (opcional)" maxlength="60">
          <button type="submit" class="comm-submit">PUBLICAR</button>
        </form>
      </div>
    </div>
  </div>
  <footer>
    <span id="status">Carregando…</span>
    <div class="footer-meta">
      <button id="mobile-comm-btn" style="display:none;background:none;border:1px solid #1c1c38;color:#6868aa;font-family:'Space Mono',monospace;font-size:0.6rem;padding:0.2rem 0.5rem;cursor:pointer;border-radius:3px" onclick="var p=document.getElementById('community-panel');p.style.display=p.style.display==='none'?'flex':'none'">&#9650; NOTAS</button>
      <span>BQ ${escHtml(usageData.month)}</span>
      <span>${gbUsed} GB</span>
      <span>${pct}% do 1 TB free</span>
      <span>${gbLeft} GB restantes</span>
    </div>
  </footer>
  <script>
    window.__DATASET_COLORS = ${JSON.stringify(
      Object.fromEntries([
        ...CNPJ_DATASETS.map((d) => [d.id, d.color]),
        ...RELATED_DATASETS.map((d) => [d.id, d.color]),
      ])
    )};
    window.__DATASET_RELATIONS = ${JSON.stringify(
      Object.fromEntries(
        CNPJ_DATASETS
          .filter((d) => d.relatedLookups?.length)
          .map((d) => [d.id, d.relatedLookups])
      )
    )};
  </script>
  <script src="/graph.js"></script>
  <script>
    (function() {
      var toggle = document.getElementById('alertas-toggle');
      var body = document.getElementById('alertas-body');
      toggle.addEventListener('click', function() {
        body.classList.toggle('collapsed');
        toggle.innerHTML = body.classList.contains('collapsed') ? '&#43;' : '&#8722;';
      });
      fetch('/api/patterns/${escHtml(cnpj)}')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          body.innerHTML = data.html || '<span class="alertas-loading">Nenhum dado.</span>';
        })
        .catch(function() {
          body.innerHTML = '<span class="alertas-loading">Erro ao carregar alertas.</span>';
        });
    })();
  </script>
  <script>
  (function() {
    var CNPJ = '${escHtml(cnpj)}';
    if (window.innerWidth <= 640) {
      document.getElementById('mobile-comm-btn').style.display = 'inline-block';
    }
    var commToggle = document.getElementById('comm-toggle');
    var commBody   = document.getElementById('comm-body');
    commToggle.addEventListener('click', function() {
      commBody.classList.toggle('collapsed');
      commToggle.innerHTML = commBody.classList.contains('collapsed') ? '&#43;' : '&#8722;';
    });

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function renderNotes(notes) {
      var list = document.getElementById('comm-notes-list');
      if (!notes || !notes.length) {
        list.innerHTML = '<span class="comm-note-empty">Nenhuma nota. Seja o primeiro a investigar.</span>';
        return;
      }
      list.innerHTML = notes.map(function(n) {
        return '<div class="comm-note">' +
          '<div class="comm-note-body">' + escHtml(n.body) + '</div>' +
          '<div class="comm-note-meta">' + escHtml(n.author || 'anônimo') + ' · ' + n.created_at.slice(0,16) + '</div>' +
          '</div>';
      }).join('');
    }

    function updateScore(score, userVote) {
      var scoreEl = document.getElementById('vote-score');
      scoreEl.textContent = score > 0 ? '+' + score : String(score);
      scoreEl.className = score > 0 ? 'pos' : score < 0 ? 'neg' : '';
      document.getElementById('vote-up').className = 'comm-vote-dir' + (userVote === 1 ? ' active-up' : '');
      document.getElementById('vote-dn').className = 'comm-vote-dir' + (userVote === -1 ? ' active-dn' : '');
    }

    // Load community data
    fetch('/api/community/' + CNPJ)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        updateScore(d.score, d.userVote);
        renderNotes(d.notes);
      });

    // Vote buttons ▲ / ▼
    document.querySelectorAll('.comm-vote-dir').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dir = parseInt(btn.dataset.dir, 10);
        fetch('/api/vote/' + CNPJ, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: dir }),
        })
          .then(function(r) { return r.json(); })
          .then(function(d) { updateScore(d.score, d.userVote); });
      });
    });

    // Add note
    document.getElementById('comm-note-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var body   = this.querySelector('textarea[name=body]').value.trim();
      var author = this.querySelector('input[name=author]').value.trim();
      if (!body) return;
      fetch('/api/notes/' + CNPJ, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body, author: author }),
      })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.note) {
            var list = document.getElementById('comm-notes-list');
            var div = document.createElement('div');
            div.className = 'comm-note';
            div.innerHTML = '<div class="comm-note-body">' + escHtml(d.note.body) + '</div>' +
              '<div class="comm-note-meta">' + escHtml(d.note.author || 'anônimo') + ' · agora</div>';
            list.prepend(div);
            var empty = list.querySelector('.comm-note-empty');
            if (empty) empty.remove();
          }
          document.querySelector('#comm-note-form textarea').value = '';
        });
    });
  })();
  </script>
</body>
</html>`;
}

// --- HTTP server ---
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Static JS bundle
    if (url.pathname === "/graph.js") {
      try {
        const js = readFileSync(GRAPH_JS_PATH);
        return new Response(js, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      } catch {
        return new Response("graph.js not found — run: bun build graph-client.ts --outfile public/graph.js --target browser", { status: 404 });
      }
    }

    // Graph page (also root)
    if (url.pathname === "/" || url.pathname === "/graph") {
      const cnpj = (url.searchParams.get("cnpj") ?? "").trim();
      if (!cnpj) return new Response(renderGraphLanding(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      return new Response(renderGraphPage(cnpj, usage), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Lookup API — cross-dataset CNPJ search
    // Related dataset lookup by arbitrary key
    if (url.pathname === "/api/lookup/related") {
      const datasetId = url.searchParams.get("datasetId") ?? "";
      const foreignKey = url.searchParams.get("foreignKey") ?? "";
      const value = url.searchParams.get("value") ?? "";
      const limit = parseLookupLimit(url.searchParams.get("limit"));
      if (!datasetId || !foreignKey || !value) {
        return new Response(JSON.stringify({ error: "Missing datasetId, foreignKey or value" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const { result, bytes } = await queryByField(datasetId, foreignKey, value, false, limit);
        trackBytes(bytes);
        return new Response(JSON.stringify({ result }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        const e = classifyError(err);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const lookupDatasetMatch = url.pathname.match(
      /^\/api\/lookup\/([^/]+)\/dataset\/([^/]+)$/,
    );
    if (lookupDatasetMatch) {
      const cnpj = lookupDatasetMatch[1];
      const datasetId = decodeURIComponent(lookupDatasetMatch[2]);
      const fresh = url.searchParams.get("fresh") === "1";
      const limit = parseLookupLimit(url.searchParams.get("limit"));
      try {
        const { result, bytes } = await queryLookupDataset(
          cnpj,
          datasetId,
          fresh,
          limit,
        );
        trackBytes(bytes);
        return new Response(JSON.stringify({ cnpj, result }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        const e = classifyError(err);
        const status = e.message.startsWith("Dataset not found:") ? 404 : 500;
        return new Response(JSON.stringify({ error: e.message }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Lookup API — cross-dataset CNPJ search
    const lookupMatch = url.pathname.match(/^\/api\/lookup\/([^/]+)$/);
    if (lookupMatch) {
      const cnpj = lookupMatch[1];
      const limit = parseLookupLimit(url.searchParams.get("limit"));
      try {
        const { results, totalBytes } = await queryLookup(cnpj, limit);
        trackBytes(totalBytes);
        return new Response(JSON.stringify({ cnpj, results }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        const e = classifyError(err);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Pattern detection API
    const patternsMatch = url.pathname.match(/^\/api\/patterns\/([^/]+)$/);
    if (patternsMatch) {
      // Normalise to 8-digit cnpj_basico — the root used across all pattern queries.
      // A user may pass a full 14-digit CNPJ ("12345678000100") or a formatted string
      // ("12.345.678/0001-00"). patternNewbornCompany uses cnpj_basico = @cnpj directly,
      // so passing 14 digits would produce no results.
      const cnpj = patternsMatch[1].replace(/\D/g, "").slice(0, 8);
      if (cnpj.length < 8) {
        return new Response(JSON.stringify({ error: "CNPJ inválido" }), { status: 400 });
      }
      try {
        const result = await runPatterns(cnpj, DEFAULT_YEAR);
        const html = renderAlertasHtml(result);
        // Persist flag count so landing page can highlight this CNPJ
        try { cacheFlagCount(cnpj, result.flags.length, result.flags.map((f) => f.pattern)); } catch {}
        return new Response(JSON.stringify({ cnpj, flags: result.flags.length, html }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        const e = classifyError(err);
        return new Response(JSON.stringify({ error: e.message, html: '<span class="alertas-loading">Erro ao calcular alertas.</span>' }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }


    // Community — vote (up or down)
    const voteMatch = url.pathname.match(/^\/api\/vote\/([^/]+)$/);
    if (voteMatch && req.method === "POST") {
      const cnpj = voteMatch[1].slice(0, 14).replace(/\D/g, "");
      if (!cnpj) return new Response(JSON.stringify({ error: "invalid cnpj" }), { status: 400, headers: { "Content-Type": "application/json" } });
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      let direction: 1 | -1 = 1;
      try { const body = await req.json() as any; if (body.direction === -1) direction = -1; } catch {}
      const result = castVote(cnpj, ip, direction);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }

    // Community — add note
    const notesPostMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (notesPostMatch && req.method === "POST") {
      const cnpj = notesPostMatch[1].slice(0, 14).replace(/\D/g, "");
      if (!cnpj) return new Response(JSON.stringify({ error: "invalid cnpj" }), { status: 400, headers: { "Content-Type": "application/json" } });
      try {
        const payload = await req.json() as { body?: string; author?: string };
        const note = addNote(cnpj, payload.body ?? "", payload.author ?? "");
        return new Response(JSON.stringify({ ok: true, note }), { headers: { "Content-Type": "application/json" } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    }

    // Community — get score + notes for a CNPJ
    const communityMatch = url.pathname.match(/^\/api\/community\/([^/]+)$/);
    if (communityMatch) {
      const cnpj = communityMatch[1].slice(0, 14).replace(/\D/g, "");
      const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      return new Response(JSON.stringify({
        cnpj,
        score:    getScore(cnpj),
        userVote: getUserVote(cnpj, ip),
        notes:    getNotesForCnpj(cnpj),
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Community — recent notes feed (landing page)
    if (url.pathname === "/api/notes/recent") {
      const notes = communityDb.query(
        "SELECT * FROM notes ORDER BY created_at DESC LIMIT 50"
      ).all() as CommunityNote[];
      return new Response(JSON.stringify({ notes }), { headers: { "Content-Type": "application/json" } });
    }

    // Graph JSON API
    const graphMatch = url.pathname.match(/^\/api\/graph\/([^/]+)$/);
    if (graphMatch) {
      const cnpj = graphMatch[1];
      try {
        const [empresaResult, sociosResult] = await Promise.all([
          queryEmpresa(cnpj),
          querySocios(cnpj),
        ]);
        trackBytes(empresaResult.bytesProcessed + sociosResult.bytesProcessed);

        const nodes: Array<{ id: string; label: string; type: string }> = [];
        const links: Array<{ source: string; target: string }> = [];

        const companyLabel = empresaResult.row?.razao_social ?? cnpj;
        nodes.push({ id: cnpj, label: companyLabel, type: "empresa" });

        for (const s of sociosResult.rows) {
          const socioId = s.documento || `${cnpj}:${s.nome}`;
          if (socioId && !nodes.find((n) => n.id === socioId)) {
            nodes.push({ id: socioId, label: s.nome || socioId, type: "socio" });
          }
          links.push({ source: cnpj, target: socioId });
        }

        return new Response(JSON.stringify({ nodes, links }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        const e = classifyError(err);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Table page
    if (url.pathname !== "/table") {
      return new Response("Not found", { status: 404 });
    }

    const ano = parseInt(url.searchParams.get("ano") ?? String(DEFAULT_YEAR), 10);
    const limit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const search = (url.searchParams.get("search") ?? "").trim();

    const params: QueryParams = {
      ano: isNaN(ano) ? DEFAULT_YEAR : ano,
      limit: [25, 50, 100].includes(limit) ? limit : DEFAULT_LIMIT,
      offset: isNaN(offset) || offset < 0 ? 0 : offset,
      search,
    };

    let rows: Company[] | null = null;
    let error: { kind: "auth" | "billing" | "other"; message: string } | null = null;

    try {
      const result = await queryCompanies(params);
      rows = result.rows;
      trackBytes(result.bytesProcessed);
    } catch (err) {
      error = classifyError(err);
    }

    const html = renderPage(params, rows, error, usage);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Server running at http://localhost:${PORT}`);
