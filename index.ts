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
  if (KEY_FILE) opts.keyFilename = KEY_FILE;
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
  <title>Investiga — CNPJ Browser</title>
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
    <h1>Investiga</h1>
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
  <title>Investiga</title>
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
    <span class="nav-brand">INV_</span>
    <div class="nav-links">
      <a href="/table">BASE DE DADOS →</a>
    </div>
  </nav>
  <div class="layout">
    <main>
      <p class="eyebrow">// sistema de investigação · br</p>
      <h1 class="wordmark">
        <span style="animation-delay:.04s">I</span><span style="animation-delay:.09s">N</span><span style="animation-delay:.14s">V</span><span style="animation-delay:.19s">E</span><span style="animation-delay:.24s">S</span><span style="animation-delay:.29s">T</span><span style="animation-delay:.34s">I</span><span style="animation-delay:.39s">G</span><span style="animation-delay:.44s">A</span>
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
    <span class="footer-copy">INVESTIGA · CNPJ GRAPH · BASE DOS DADOS</span>
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
  <title>INV_ ${escHtml(cnpj)}</title>
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
    #layout-select, #query-limit-select {
      margin-left: auto;
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
    #query-limit-select {
      margin-left: 0;
      min-width: 56px;
      text-align: center;
    }
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
      gap: 0;
      flex-shrink: 0;
    }
    footer span {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      letter-spacing: 0.05em;
    }
    footer span + span::before { content: " · "; color: #1e1e38; }
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
  </style>
</head>
<body>
  <div class="gold-bar"></div>
  <header>
    <span class="h-brand">INV_</span>
    <span class="h-divider"></span>
    <nav class="breadcrumb">
      <a href="/">INÍCIO</a>
      <span class="bc-sep">›</span>
      <a href="/?cnpj=${escHtml(cnpj)}">${escHtml(cnpj)}</a>
      <span class="bc-sep">›</span>
      <span class="bc-current" id="bc-label">GRAFO</span>
    </nav>
    <select id="layout-select">
      <option value="radial">Radial</option>
      <option value="forceatlas2">Force Atlas 2</option>
    </select>
    <select id="query-limit-select">
      <option value="10">10</option>
      <option value="20">20</option>
      <option value="30">30</option>
      <option value="40">40</option>
    </select>
    <span id="status">Carregando…</span>
  </header>
  <div id="graph-container">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span class="loading-text">consultando bigquery</span>
    </div>
  </div>
  <footer>
    <span>BQ ${escHtml(usageData.month)}</span>
    <span>${gbUsed} GB</span>
    <span>${pct}% do 1 TB free</span>
    <span>${gbLeft} GB restantes</span>
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
