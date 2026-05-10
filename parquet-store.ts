import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { readFileSync } from "fs";
import { resolve } from "path";

const SCHEMAS_PATH = resolve(import.meta.dir, "schemas.json");

function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]`, ...args);
}

interface TableSchema {
  path: string;
  file_count: number;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

interface SchemasData {
  tables: Record<string, TableSchema>;
}

export interface ReadOptions {
  columns?: string[];
  filters?: Record<string, string | number | null>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  rawWhere?: string;
}

const S3_BUCKET = process.env.HETZNER_S3_BUCKET ?? "baseldosdados";
const S3_ENDPOINT = process.env.HETZNER_S3_ENDPOINT ?? "https://hel1.your-objectstorage.com";
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "";

function loadSchemas(): SchemasData {
  try {
    return JSON.parse(readFileSync(SCHEMAS_PATH, "utf-8")) as SchemasData;
  } catch {
    return { tables: {} };
  }
}

const schemas = loadSchemas();

function tableKey(dataset: string, table: string): string {
  return `${dataset}.${table}`;
}

function getGlobPath(key: string): string | undefined {
  const schema = schemas.tables[key];
  if (!schema) return undefined;
  const base = schema.path
    .replace(/^s3:\/\/[^/]+\//, `s3://${S3_BUCKET}/`)
    .replace(/\/$/, "");
  return `${base}/**/*.parquet`;
}

// --- DuckDB connection pool ---

// threads: "4" workaround for DuckDB 1.5.x ARM integer overflow on CPU detection
const POOL_SIZE = 4;

let _instancePromise: Promise<DuckDBInstance> | null = null;
const _connPool: Array<{ conn: DuckDBConnection; busy: boolean }> = [];
const _waiters: Array<(conn: DuckDBConnection) => void> = [];
let _totalCreated = 0;

function getInstance(): Promise<DuckDBInstance> {
  if (!_instancePromise) {
    _instancePromise = DuckDBInstance.create(":memory:", { threads: "4" }).catch((err) => {
      _instancePromise = null;
      throw err;
    });
  }
  return _instancePromise;
}

async function createConn(): Promise<DuckDBConnection> {
  const instance = await getInstance();
  const conn = await instance.connect();
  const host = S3_ENDPOINT.replace(/^https?:\/\//, "");
  await conn.run("INSTALL httpfs; LOAD httpfs;");
  await conn.run(`
    SET s3_endpoint='${host}';
    SET s3_access_key_id='${S3_ACCESS_KEY_ID}';
    SET s3_secret_access_key='${S3_SECRET_ACCESS_KEY}';
    SET s3_use_ssl=true;
    SET s3_url_style='path';
    SET s3_max_connections=50;
  `);
  return conn;
}

async function acquireConn(): Promise<DuckDBConnection> {
  const free = _connPool.find((p) => !p.busy);
  if (free) {
    free.busy = true;
    return free.conn;
  }
  if (_totalCreated < POOL_SIZE) {
    _totalCreated++;
    const conn = await createConn();
    _connPool.push({ conn, busy: true });
    return conn;
  }
  return new Promise<DuckDBConnection>((resolve) => _waiters.push(resolve));
}

function releaseConn(conn: DuckDBConnection): void {
  const next = _waiters.shift();
  if (next) {
    next(conn);
    return;
  }
  const entry = _connPool.find((p) => p.conn === conn);
  if (entry) entry.busy = false;
}

export async function warmUp(): Promise<void> {
  const conns = await Promise.all(Array.from({ length: POOL_SIZE }, () => acquireConn()));
  conns.forEach(releaseConn);
  log("DuckDB pool ready", { size: POOL_SIZE });
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "bigint") out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

function buildWhere(filters?: Record<string, string | number | null>, rawWhere?: string): string {
  const parts: string[] = [];
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (val === null) {
        parts.push(`"${col}" IS NULL`);
      } else if (typeof val === "number") {
        parts.push(`"${col}" = ${val}`);
      } else {
        parts.push(`"${col}" = '${String(val).replace(/'/g, "''")}'`);
      }
    }
  }
  if (rawWhere) parts.push(rawWhere);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

// --- Pure helpers (kept for parquet-store.test.ts) ---

export function normalizeComparableValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function rowMatchesFilters(
  row: Record<string, unknown>,
  filters?: Record<string, string | number | null>
): boolean {
  if (!filters) return true;
  for (const [key, expected] of Object.entries(filters)) {
    const actual = normalizeComparableValue(row[key]);
    if (actual !== normalizeComparableValue(expected)) return false;
  }
  return true;
}

export function projectRow(
  row: Record<string, unknown>,
  columns?: string[]
): Record<string, unknown> {
  if (!columns || columns.length === 0) return row;
  const projected: Record<string, unknown> = {};
  for (const column of columns) projected[column] = row[column];
  return projected;
}

// --- Query API ---

export async function* queryParquetDataset(
  dataset: string,
  table: string,
  options: ReadOptions = {}
): AsyncGenerator<Record<string, unknown>> {
  const key = tableKey(dataset, table);
  const globPath = getGlobPath(key);
  if (!globPath) throw new Error(`Table not found in schemas: ${key}`);

  const select = options.columns?.length
    ? options.columns.map((c) => `"${c}"`).join(", ")
    : "*";
  const where = buildWhere(options.filters, options.rawWhere);
  const order = options.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options.limit !== undefined ? `LIMIT ${options.limit}` : "";
  const offset = options.offset !== undefined ? `OFFSET ${options.offset}` : "";
  const sql = `SELECT ${select} FROM read_parquet('${globPath}', hive_partitioning=true) ${where} ${order} ${limit} ${offset}`;

  log("DuckDB query", { dataset, table, where: where || "none" });
  const t0 = Date.now();
  const conn = await acquireConn();
  try {
    const reader = await conn.runAndReadAll(sql);
    log("DuckDB done", { ms: Date.now() - t0 });
    for (const row of reader.getRowObjectsJS()) {
      yield normalizeRow(row as Record<string, unknown>);
    }
  } finally {
    releaseConn(conn);
  }
}

export async function countParquetRows(
  dataset: string,
  table: string,
  options: Pick<ReadOptions, "filters" | "rawWhere"> = {}
): Promise<number> {
  const key = tableKey(dataset, table);
  const globPath = getGlobPath(key);
  if (!globPath) throw new Error(`Table not found in schemas: ${key}`);

  const where = buildWhere(options.filters, options.rawWhere);
  const sql = `SELECT COUNT(*) AS n FROM read_parquet('${globPath}', hive_partitioning=true) ${where}`;
  const conn = await acquireConn();
  try {
    const reader = await conn.runAndReadAll(sql);
    const rows = reader.getRowObjectsJS();
    return Number((rows[0] as Record<string, unknown>)?.n ?? 0);
  } finally {
    releaseConn(conn);
  }
}

export async function readParquetDataset(
  dataset: string,
  table: string,
  options: ReadOptions = {}
): Promise<AsyncIterable<Record<string, unknown>>> {
  return queryParquetDataset(dataset, table, options);
}

export function getTableColumns(dataset: string, table: string): string[] | undefined {
  return schemas.tables[tableKey(dataset, table)]?.columns.map((c) => c.name);
}

export function tableExists(dataset: string, table: string): boolean {
  return tableKey(dataset, table) in schemas.tables;
}

export async function countParquetFiles(dataset: string, table: string): Promise<number> {
  return schemas.tables[tableKey(dataset, table)]?.file_count ?? 0;
}

// DuckDB does not expose per-request byte counts; stubbed for UI compatibility.
export function getBytesReceived(): number { return 0; }
export function resetBytesReceived(): void {}
