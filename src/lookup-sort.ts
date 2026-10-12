// Newest-first ordering for the lookup panel's per-dataset row tables.
// Source tables store dates every which way (ISO, "dd/mm/yyyy", epoch ms,
// separate ano/mes integers), so each value is turned into a comparable
// number before sorting. Rows with no date go last, original order kept.

type Row = Record<string, unknown>;

const DATE_COL = /data|date|(^|_)dt(_|$)|(^|_)dat(_|$)/i;

// Returns a sortable number (yyyymmdd-ish) or null when the value isn't a date.
export function parseDateValue(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Epoch milliseconds (ANA's out_dt_* columns).
    if (v > 1e11) {
      const d = new Date(v);
      return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  if (/^\d{12,}$/.test(s)) return parseDateValue(Number(s));
  return null;
}

function yearMonthKey(row: Row, anoCol: string, mesCol?: string): number | null {
  const ano = Number(row[anoCol]);
  // BCB IF.data's ano_mes packs both as yyyymm (200006).
  if (Number.isInteger(ano) && ano >= 180001 && ano <= 220012) {
    const mes = ano % 100;
    return mes >= 1 && mes <= 12 ? Math.floor(ano / 100) * 10000 + mes * 100 : null;
  }
  if (!Number.isInteger(ano) || ano < 1800 || ano > 2200) return null;
  const mes = mesCol ? Number(row[mesCol]) : NaN;
  return ano * 10000 + (Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes * 100 : 0);
}

// Picks how to date a dataset's rows: the first date-named column whose
// non-empty values mostly parse, falling back to an ano(+mes) pair for rows
// where that column is empty. null = undated dataset.
export function rowDateKey(rows: Row[]): ((row: Row) => number | null) | null {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  const anoCol = cols.find((c) => /^ano/i.test(c));
  const mesCol = cols.find((c) => /^mes(_|$)/i.test(c));
  const byYear = anoCol ? (r: Row) => yearMonthKey(r, anoCol, mesCol) : null;
  for (const col of cols) {
    if (!DATE_COL.test(col)) continue;
    let filled = 0;
    let parsed = 0;
    for (const r of rows) {
      const v = r[col];
      if (v == null || v === "") continue;
      filled++;
      if (parseDateValue(v) != null) parsed++;
    }
    if (filled > 0 && parsed / filled >= 0.8) {
      return (r) => parseDateValue(r[col]) ?? byYear?.(r) ?? null;
    }
  }
  return byYear;
}

export function sortRowsNewestFirst<T extends Row>(rows: T[]): T[] {
  const key = rowDateKey(rows);
  if (!key) return rows;
  return rows
    .map((row, i) => ({ row, i, k: key(row) }))
    .sort((a, b) => {
      if (a.k == null && b.k == null) return a.i - b.i;
      if (a.k == null) return 1;
      if (b.k == null) return -1;
      return b.k - a.k || a.i - b.i;
    })
    .map((x) => x.row);
}
