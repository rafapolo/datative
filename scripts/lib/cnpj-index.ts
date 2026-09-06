import { queryParquetDataset, getTableColumns, tableExists, countParquetRows } from "./parquet-store";

export interface CnpjColumn {
  name: string;
  type: "basico" | "full" | "mixed";
  /** Column holds punctuation (dots/slash/dash) and/or a numeric type that drops
   * leading zeros — strip non-digits and zero-pad before matching. */
  normalize?: boolean;
}

export interface DatasetInfo {
  dataset: string;
  table: string;
  cnpjColumns: CnpjColumn[];
  displayFields: string[];
  yearField?: string;
}

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
    const raw = `"${col.name}"`;
    // Some mirrored/scraped sources store CNPJ punctuated ("12.345.678/0001-90")
    // or as a numeric type that drops leading zeros — strip to digits-only first.
    const stripped = col.normalize
      ? `regexp_replace(CAST(${raw} AS VARCHAR), '[^0-9]', '', 'g')`
      : raw;
    if (col.type === "basico") {
      parts.push(`(${stripped} = '${cnpjRoot}')`);
    } else if (col.type === "full") {
      // prefix LIKE lets DuckDB use parquet min/max stats on the un-normalized column.
      // Guard against blank/NULL source values: lpad('', 14, '0') is all zeros and
      // would otherwise spuriously match an all-zero-ish root (e.g. "00000000").
      const padded = col.normalize ? `lpad(${stripped}, 14, '0')` : stripped;
      const notBlank = col.normalize ? `${stripped} <> '' AND ` : "";
      parts.push(`(${notBlank}${padded} LIKE '${cnpjRoot}%')`);
    } else if (col.type === "mixed") {
      // CPF (11 digits) or CNPJ (14 digits); match only CNPJs. Length must be
      // checked on the un-padded digit count, before any zero-padding, or a
      // stripped 11-digit CPF would be miscounted as a 14-digit CNPJ.
      parts.push(`(length(${stripped}) = 14 AND ${stripped} LIKE '${cnpjRoot}%')`);
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
