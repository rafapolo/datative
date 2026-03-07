# Task: Sudden Contract Surge
**Status:** DONE
**Priority:** P2
**Pattern ID:** `sudden_surge`
**Cache key:** `patterns_sudden_surge_{cnpj}_{year}`

---

## Why it's suspicious

A supplier that was modest for years and then explosively dominates public procurement overnight is a primary investigative red flag. The O Globo investigation of construtora LCM (March 2026) showed R$ 8.3 billion in contracts in the Lula government — 25% above the Bolsonaro period, nearly 2× the second-ranked competitor — with police investigating suspected cartel and superfaturamento. Sudden surges often coincide with political transitions, new agency management, or the maturation of a corrupt arrangement.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `id_orgao_superior`, `nome_orgao_superior`, `ano` | `ano`, `mes` |

No joins needed — single table, cross-year aggregation.

---

## Query

```sql
SELECT
  ano,
  SUM(valor_final_compra)    AS annual_value,
  COUNT(*)                   AS contract_count,
  COUNT(DISTINCT id_orgao_superior) AS agency_count
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), @cnpj)
  AND ano BETWEEN @ano - 4 AND @ano   -- 5-year window
GROUP BY ano
ORDER BY ano
```

Then in application code, compute year-over-year ratios and flag when:
```
surge_ratio = value[year_N] / value[year_N-1] >= SURGE_RATIO_THRESHOLD
AND year_N - year_N_minus_1 === 1      -- MUST be consecutive calendar years; gap years are excluded
AND value[year_N] >= SURGE_MIN_ABSOLUTE_VALUE
AND value[year_N-1] > 0  -- had prior activity (not a first-year company)
```

**Consecutive-year guard is critical:** The result set may have gaps (company dormant in some years). Comparing any two adjacent rows in sorted order would give a false positive for a company dormant from 2019 to 2023. Only flag when `year_N === year_N_minus_1 + 1`.

---

## Configurable Constants

```typescript
const SURGE_RATIO_THRESHOLD    = 5.0;       // 5× year-over-year growth
const SURGE_MIN_ABSOLUTE_VALUE = 1_000_000; // BRL — at least R$1M in surge year
const SURGE_LOOKBACK_YEARS     = 4;         // years of history to fetch
```

---

## Output Shape

```typescript
interface SuddenSurgeFlag {
  pattern: 'sudden_surge';
  surgeYear: number;
  priorYearValue: number;    // BRL
  surgeYearValue: number;    // BRL
  surgeRatio: number;        // e.g. 7.2 = 7× growth
  surgeYearAgencies: number; // how many different agencies in surge year
  history: Array<{ ano: number; value: number; contracts: number }>;
}
```

---

## UI

- Label (PT-BR): **"Crescimento Explosivo de Contratos Públicos"**
- Show: surge year, prior year value, surge year value, growth multiplier (e.g. "7× em relação ao ano anterior"), sparkline-style year-by-year breakdown
- Severity: orange for 5–9×, red for 10×+

---

## Acceptance Criteria

- [x] Requires prior-year value > 0 — does not flag companies in their first year of contracting (covered by `newborn_company`)
- [x] Consecutive-year guard: `year_N - year_N_minus_1 === 1` — dormant years in between do not produce a false YoY comparison
- [x] Uses `@ano` as the reference year (current query year); looks back `SURGE_LOOKBACK_YEARS`
- [x] `history` array returned for all years in window so UI can render trend
- [x] Minimum absolute value threshold prevents flagging companies that went from R$ 1k to R$ 10k (technically 10×, but irrelevant)
- [x] `surgeYearAgencies` surfaced — a surge concentrated in one agency is more suspicious than one spread across many
- [x] Not partition-filtered below year level — `WHERE ano BETWEEN X AND Y` is the entire filter
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
