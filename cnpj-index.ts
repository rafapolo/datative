import { queryParquetDataset, getTableColumns, tableExists, countParquetRows } from "./parquet-store";

export interface CnpjColumn {
  name: string;
  type: "basico" | "full" | "mixed";
}

export interface DatasetInfo {
  dataset: string;
  table: string;
  cnpjColumns: CnpjColumn[];
  displayFields: string[];
  yearField?: string;
}

const INDEX_CACHE_PATH = new URL("./cnpj-index-cache.json", import.meta.url).pathname;

interface CnpjIndexCache {
  [tableKey: string]: {
    cnpj_basico_files: Record<string, string[]>;
    lastUpdated: string;
  };
}

const indexCache: CnpjIndexCache = {};

export function extractCnpjRoot(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length >= 8) {
    return digits.slice(0, 8);
  }
  return digits;
}

export function extractCnpjRoots(documents: string[]): Set<string> {
  const roots = new Set<string>();
  for (const doc of documents) {
    const root = extractCnpjRoot(doc);
    if (root.length === 8) {
      roots.add(root);
    }
  }
  return roots;
}

export function isMaskedDocument(value: string): boolean {
  return value.includes("*");
}

export function matchesCnpj(
  value: string | null | undefined,
  cnpjRoot: string,
  colType: "basico" | "full" | "mixed"
): boolean {
  if (!value) return false;
  const str = String(value);
  if (isMaskedDocument(str)) return false;
  const digits = str.replace(/\D/g, "");
  if (!digits) return false;

  if (colType === "basico") {
    return digits === cnpjRoot;
  }
  if (colType === "full") {
    return digits.slice(0, 8) === cnpjRoot;
  }
  if (colType === "mixed") {
    if (digits.length === 11) {
      return digits === cnpjRoot;
    }
    if (digits.length === 14) {
      return digits.slice(0, 8) === cnpjRoot;
    }
  }
  return false;
}

// Masked CPF format: ***XXXXXX** (6 visible digits, never a full 11-digit CPF).
// Full CNPJs (14 digits) are never masked.
// Masked/null docs are scoped to companyId to prevent false graph merges
// when different people share the same placeholder (e.g. ***000000**).
export function socioNodeId(documento: string | null, companyId: string, nome: string): string {
  if (!documento) return `${companyId}:name:${nome}`;
  if (isMaskedDocument(documento)) return `${companyId}:masked:${documento}:${nome}`;
  return documento; // full CNPJ → global deduplication across companies
}

function buildCnpjRawWhere(cnpjColumns: CnpjColumn[], cnpjRoot: string): string {
  const parts: string[] = [];
  for (const col of cnpjColumns) {
    const q = `"${col.name}"`;
    if (col.type === "basico") {
      parts.push(`${q} = '${cnpjRoot}'`);
    } else if (col.type === "full") {
      // digits-only 14-char string; prefix LIKE lets DuckDB use parquet min/max stats
      parts.push(`${q} LIKE '${cnpjRoot}%'`);
    } else if (col.type === "mixed") {
      // CPF (11 digits) or CNPJ (14 digits), stored as digits-only; match only CNPJs
      parts.push(`(length(${q}) = 14 AND ${q} LIKE '${cnpjRoot}%')`);
    }
  }
  return parts.length ? `(${parts.join(" OR ")})` : "TRUE";
}

export async function* queryByCnpj(
  datasetInfo: DatasetInfo,
  cnpj: string,
  limit: number = 40
): AsyncGenerator<Record<string, unknown>> {
  const { dataset, table, cnpjColumns, displayFields, yearField } = datasetInfo;

  if (!tableExists(dataset, table)) {
    throw new Error(`Table not found: ${dataset}.${table}`);
  }

  const cnpjRoot = extractCnpjRoot(cnpj);
  const allColumns = [...new Set([...displayFields, ...cnpjColumns.map((c) => c.name)])];
  if (yearField && !allColumns.includes(yearField)) {
    allColumns.push(yearField);
  }

  const rawWhere = buildCnpjRawWhere(cnpjColumns, cnpjRoot);
  let count = 0;
  for await (const row of queryParquetDataset(dataset, table, {
    columns: allColumns,
    rawWhere,
    limit,
  })) {
    if (count >= limit) break;
    count++;
    yield row;
  }
}

export async function getTotalCount(
  datasetInfo: DatasetInfo,
  cnpj: string
): Promise<number> {
  const { dataset, table, cnpjColumns } = datasetInfo;
  const cnpjRoot = extractCnpjRoot(cnpj);
  const rawWhere = buildCnpjRawWhere(cnpjColumns, cnpjRoot);
  return countParquetRows(dataset, table, { rawWhere });
}
