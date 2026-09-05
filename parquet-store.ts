import { readFileSync } from "fs";
import { resolve } from "path";
import { execRemoteSQL, warmUpSSH } from "./duckdb-ssh";

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

// Tables live as views (one per dataset.table) inside the remote DuckDB
// catalog on beelink, so the schema/table names double as the SQL reference.
function getTableRef(key: string): string | undefined {
  if (!(key in schemas.tables)) return undefined;
  const [dataset, table] = key.split(".");
  return `"${dataset}"."${table}"`;
}

export async function warmUp(): Promise<void> {
  await warmUpSSH();
  log("SSH DuckDB connection ready", { host: process.env.DUCKDB_SSH_HOST ?? "beelink" });
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

export function buildSelectSQL(dataset: string, table: string, options: ReadOptions = {}): string {
  const key = tableKey(dataset, table);
  const tableRef = getTableRef(key);
  if (!tableRef) throw new Error(`Table not found in schemas: ${key}`);

  const select = options.columns?.length
    ? options.columns.map((c) => `"${c}"`).join(", ")
    : "*";
  const where = buildWhere(options.filters, options.rawWhere);
  const order = options.orderBy ? `ORDER BY ${options.orderBy}` : "";
  const limit = options.limit !== undefined ? `LIMIT ${options.limit}` : "";
  const offset = options.offset !== undefined ? `OFFSET ${options.offset}` : "";
  return `SELECT ${select} FROM ${tableRef} ${where} ${order} ${limit} ${offset};`;
}

export async function* queryParquetDataset(
  dataset: string,
  table: string,
  options: ReadOptions = {}
): AsyncGenerator<Record<string, unknown>> {
  const sql = buildSelectSQL(dataset, table, options);
  log("DuckDB query (ssh)", { dataset, table });
  const t0 = Date.now();
  const rows = await execRemoteSQL(sql);
  log("DuckDB done", { ms: Date.now() - t0, rows: rows.length });
  for (const row of rows) {
    yield row;
  }
}

export async function countParquetRows(
  dataset: string,
  table: string,
  options: Pick<ReadOptions, "filters" | "rawWhere"> = {}
): Promise<number> {
  const key = tableKey(dataset, table);
  const tableRef = getTableRef(key);
  if (!tableRef) throw new Error(`Table not found in schemas: ${key}`);

  const where = buildWhere(options.filters, options.rawWhere);
  const sql = `SELECT COUNT(*) AS n FROM ${tableRef} ${where};`;
  const rows = await execRemoteSQL(sql);
  return Number((rows[0] as Record<string, unknown>)?.n ?? 0);
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
