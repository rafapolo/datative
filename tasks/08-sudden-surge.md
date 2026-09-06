# Analysis: Sudden Contract Surge
**Priority:** P2
**Pattern ID:** `sudden_surge`

---

## Why it's suspicious

A supplier that was modest for years and then explosively dominates public
procurement overnight is a primary investigative red flag. The O Globo
investigation of construtora LCM (March 2026) showed R$ 8.3 billion in
contracts in the Lula government — 25% above the Bolsonaro period, nearly 2×
the second-ranked competitor — with police investigating suspected cartel and
superfaturamento. Sudden surges often coincide with political transitions,
new agency management, or the maturation of a corrupt arrangement.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `id_orgao_superior`, `nome_orgao_superior`, `ano` | `ano`, `mes` |

No joins needed — single table, cross-year aggregation.

---

## Query (BigQuery-flavored; needs DuckDB translation)

```sql
SELECT
  ano,
  SUM(valor_final_compra)    AS annual_value,
  COUNT(*)                   AS contract_count,
  COUNT(DISTINCT id_orgao_superior) AS agency_count
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE cpf_cnpj_contratado = @cnpj
  AND ano BETWEEN @ano - 4 AND @ano   -- 5-year window
GROUP BY ano
ORDER BY ano
```

Then, in application code, compute year-over-year ratios and flag when:

```
surge_ratio = value[year_N] / value[year_N-1] >= SURGE_RATIO_THRESHOLD
AND value[year_N] >= SURGE_MIN_ABSOLUTE_VALUE
AND value[year_N-1] > 0  -- had prior activity (not a first-year company)
```

Thresholds: `SURGE_RATIO_THRESHOLD = 5.0`, `SURGE_MIN_ABSOLUTE_VALUE =
1_000_000` (BRL), `SURGE_LOOKBACK_YEARS = 4`.

---

## Acceptance scenarios

- Given a CNPJ where `value[year_N] / value[year_N-1] >= 5.0` AND
  `value[year_N] >= R$ 1.000.000` AND `value[year_N-1] > 0` → flag with surge
  year, growth multiplier, prior-year value, surge-year value, and agency
  count
- Given no prior-year activity → no flag (use [[07-newborn-company]] instead)
- Given surge below 5× or absolute value below R$ 1M → no flag
- Return the full per-year history array so the UI can render a trend
- Agency count in surge year matters: a surge concentrated in one agency is
  more suspicious than one spread across many
- Not partition-filtered below year level — `WHERE ano BETWEEN X AND Y` is
  the entire filter
