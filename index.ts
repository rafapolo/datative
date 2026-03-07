import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { CNPJ_DATASETS, RELATED_DATASETS, buildCnpjWhere } from "./cnpj-datasets";
import { getCache, setCache } from "./cache";

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
// Split threshold: Lei 8.666/93 art.23 §1º II-a (dispensa de licitação para serviços até R$17.600)
const SPLIT_THRESHOLD_BRL          = 17_600;
const SPLIT_MIN_COUNT              = 3;
// Concentration: 40% share = prima facie dominance
const CONCENTRATION_THRESHOLD      = 0.40;
const CONCENTRATION_MIN_SPEND      = 50_000;  // BRL — filter micro-units
// Inexigibility: 3+ sole-source contracts from same managing unit = recurrent pattern
const INEXIGIBILITY_MIN_COUNT      = 3;
// Single bidder: Open Contracting Partnership "73 Red Flags" (2024), Flag #1
const SINGLE_BIDDER_MIN_OCCURRENCES = 2;
// Win rate: 60%+ across ≥5 tenders anomalous in competitive markets (Cadernos de Finanças Públicas, 2024)
const WIN_RATE_THRESHOLD            = 0.60;
const WIN_RATE_MIN_SAMPLE           = 5;
// Amendment inflation: Lei 14.133/2021 art.125 §1º — legal ceiling = 25% above original
const AMENDMENT_INFLATION_THRESHOLD = 1.25;
const AMENDMENT_MIN_ORIGINAL_VALUE  = 10_000; // BRL
// Newborn company: 6 months = typical minimum for legitimate operational readiness
const NEWBORN_MAX_DAYS_TO_CONTRACT  = 180;
const NEWBORN_MIN_CONTRACT_VALUE    = 50_000; // BRL
// Sudden surge: 5× year-over-year growth + R$1M minimum
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
  if (cached !== null) return { row: cached, bytesProcessed: 0 };

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
  if (cached) return cached;

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
    GROUP BY id_orgao_superior, nome_orgao_superior, mes
    HAVING COUNT(*) >= @min_count
       AND SUM(valor_inicial_compra) > @threshold
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, threshold: SPLIT_THRESHOLD_BRL, min_count: SPLIT_MIN_COUNT },
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
  if (cached) return cached;

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
                    THEN valor_final_compra ELSE 0 END)
           / NULLIF(SUM(valor_final_compra), 0) >= @threshold
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, threshold: CONCENTRATION_THRESHOLD, min_agency_spend: CONCENTRATION_MIN_SPEND },
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
  if (cached) return cached;

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
    GROUP BY id_unidade_gestora, nome_unidade_gestora
    HAVING COUNT(*) >= @min_count
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, min_count: INEXIGIBILITY_MIN_COUNT },
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

  const sql = `
    WITH participacoes AS (
      SELECT p.id_licitacao, p.vencedor, l.valor_licitacao
      FROM \`basedosdados.br_cgu_licitacao_contrato.licitacao_participante\` p
      JOIN \`basedosdados.br_cgu_licitacao_contrato.licitacao\` l USING (id_licitacao)
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
      SELECT id_contrato, COUNT(*) AS aditivo_count
      FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_termo_aditivo\`
      GROUP BY id_contrato
    )
    SELECT
      c.nome_unidade_gestora,
      c.valor_inicial_compra,
      c.valor_final_compra,
      c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) AS inflation_ratio,
      COALESCE(a.aditivo_count, 0) AS aditivo_count
    FROM \`basedosdados.br_cgu_licitacao_contrato.contrato_compra\` c
    LEFT JOIN aditivos a USING (id_contrato)
    WHERE STARTS_WITH(REGEXP_REPLACE(c.cpf_cnpj_contratado, r'\\D', ''), @cnpj)
      AND c.ano = @ano
      AND c.valor_inicial_compra >= @min_original
      AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) >= @threshold
    ORDER BY inflation_ratio DESC
  `;
  const [job] = await bq.createQueryJob({
    query: sql,
    params: { cnpj, ano, min_original: AMENDMENT_MIN_ORIGINAL_VALUE, threshold: AMENDMENT_INFLATION_THRESHOLD },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  if (rows.length === 0) { setCache(cacheKey, null); return null; }
  const typed = rows as Array<Record<string, unknown>>;
  const totalOriginal = typed.reduce((s, r) => s + Number(r.valor_inicial_compra ?? 0), 0);
  const totalFinal = typed.reduce((s, r) => s + Number(r.valor_final_compra ?? 0), 0);
  const maxRatio = Math.max(...typed.map((r) => Number(r.inflation_ratio ?? 0)));
  const flag: AmendmentInflationFlag = {
    pattern: "amendment_inflation",
    contractCount: rows.length,
    maxInflationRatio: maxRatio,
    totalOriginalValue: totalOriginal,
    totalFinalValue: totalFinal,
    excessValue: totalFinal - totalOriginal,
    worstAgency: String(typed[0].nome_unidade_gestora ?? ""),
  };
  setCache(cacheKey, flag);
  return flag;
}

async function patternNewbornCompany(cnpj: string): Promise<NewbornCompanyFlag | null> {
  const cacheKey = `patterns_newborn_company_${cnpj}`;
  const cached = getCache<NewbornCompanyFlag | null>(cacheKey);
  if (cached !== undefined) return cached ?? null;

  const sql = `
    WITH empresa AS (
      SELECT cnpj_basico, data_inicio_atividade, porte
      FROM \`basedosdados.br_me_cnpj.empresas\`
      WHERE cnpj_basico = @cnpj
        AND ano = @empresa_ano AND mes = @empresa_mes
      LIMIT 1
    ),
    contratos AS (
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
    params: { cnpj, empresa_ano: DEFAULT_YEAR, empresa_mes: 12, min_value: NEWBORN_MIN_CONTRACT_VALUE, max_days: NEWBORN_MAX_DAYS_TO_CONTRACT },
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
  const cacheKey = `patterns_sudden_surge_${cnpj}`;
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
    if (prev.value > 0 && curr.value >= SURGE_MIN_ABSOLUTE_VALUE && curr.value / prev.value >= SURGE_RATIO_THRESHOLD) {
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
  if (cached) return cached;

  const settled = await Promise.allSettled([
    patternSplitContracts(cnpj, ano),
    patternConcentration(cnpj, ano),
    patternInexigibility(cnpj, ano),
    patternSingleBidder(cnpj, ano),
    patternAlwaysWinner(cnpj, ano),
    patternAmendmentInflation(cnpj, ano),
    patternNewbornCompany(cnpj),
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
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Vencedor Único em Licitações</div>
          <div class="alerta-meta">
            <span>${flag.occurrences} licitações sem concorrência · ${brl.format(flag.totalValue)}</span>
            <span>${flag.agencies.slice(0, 3).map(escHtml).join(", ")}${flag.agencies.length > 3 ? ` +${flag.agencies.length - 3}` : ""}</span>
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
        return `<div class="alerta-card ${sev}">
          <div class="alerta-title">Superfaturamento via Aditivos Contratuais</div>
          <div class="alerta-meta">
            <span>${flag.contractCount} contratos acima do limite legal · excesso ${brl.format(flag.excessValue)}</span>
            <span>Maior índice: +${maxPct}% · ${escHtml(flag.worstAgency)}</span>
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
  const companyRows = cnpjsInteresse
    .map(
      (c) =>
        `<a href="/?cnpj=${escHtml(c.cnpj_basico)}" class="ci-row">` +
        `<span class="ci-cnpj">${escHtml(c.cnpj_basico)}</span>` +
        `<span class="ci-name">${escHtml(c.razao_social)}</span>` +
        `<span class="ci-porte">${escHtml(c.porte)}</span>` +
        `</a>`
    )
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
        <span class="ci-panel-label">[ cnpjs de interesse ]</span>
        <span class="ci-panel-count">${cnpjsInteresse.length} empresas</span>
      </div>
      <div class="ci-scroll">
        ${companyRows}
      </div>
    </aside>
  </div>
  <footer>
    <span class="footer-copy">DATATIVE · CNPJ GRAPH · BASE DOS DADOS</span>
    <span class="footer-status"><span class="status-dot"></span> SISTEMA ATIVO</span>
  </footer>
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
  </div>
  <footer>
    <span id="status">Carregando…</span>
    <div class="footer-meta">
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
      const cnpj = patternsMatch[1];
      try {
        const result = await runPatterns(cnpj, DEFAULT_YEAR);
        const html = renderAlertasHtml(result);
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
