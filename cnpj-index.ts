import { queryParquetDataset, getTableColumns, tableExists } from "./parquet-store";

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

export function matchesCnpj(
  value: string | null | undefined,
  cnpjRoot: string,
  colType: "basico" | "full" | "mixed"
): boolean {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, "");
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

export function buildCnpjFilter(
  cnpj: string,
  cnpjColumns: CnpjColumn[]
): Record<string, string> {
  const cnpjRoot = extractCnpjRoot(cnpj);
  const filters: Record<string, string> = {};

  for (const col of cnpjColumns) {
    if (col.type === "basico") {
      filters[col.name] = cnpjRoot;
    }
  }

  return filters;
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

  let count = 0;

  for await (const row of queryParquetDataset(dataset, table, {
    columns: allColumns,
  })) {
    if (count >= limit) break;

    let matches = false;
    for (const col of cnpjColumns) {
      const val = row[col.name];
      if (val !== undefined && val !== null) {
        const valStr = String(val).replace(/\D/g, "");
        if (valStr.length >= 8 && valStr.slice(0, 8) === cnpjRoot) {
          if (col.type === "mixed") {
            const docLen = valStr.length;
            if (docLen === 11) {
              const searchDigits = cnpj.replace(/\D/g, "");
              if (searchDigits.length === 11 && valStr === searchDigits) {
                matches = true;
                break;
              }
            } else if (docLen === 14) {
              matches = true;
              break;
            }
          } else {
            matches = true;
            break;
          }
        }
      }
    }

    if (matches || cnpjColumns.length === 0) {
      count++;
      yield row;
    }
  }
}

export async function getTotalCount(
  datasetInfo: DatasetInfo,
  cnpj: string
): Promise<number> {
  let count = 0;
  for await (const _ of queryByCnpj(datasetInfo, cnpj, 1000)) {
    count++;
  }
  return count;
}
