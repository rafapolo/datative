# Analysis: Inexigibility Recurrence
**Priority:** P1
**Pattern ID:** `inexigibility_recurrence`

---

## Why it's suspicious

Frequently winning non-competitive ("inexigibilidade") contracts from the same
managing unit suggests possible abuse of the sole-source exemption.

---

## Query (BigQuery-flavored; needs DuckDB translation)

```sql
SELECT
  id_unidade_gestora,
  nome_unidade_gestora,
  COUNT(*)                      AS contrato_count,
  SUM(valor_inicial_compra)     AS total_value,
  MIN(data_assinatura_contrato) AS first_date,
  MAX(data_assinatura_contrato) AS last_date
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE cpf_cnpj_contratado = @cnpj
  AND ano = @ano
  AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
GROUP BY id_unidade_gestora, nome_unidade_gestora
HAVING COUNT(*) >= @min_count
```

Parameters: `cnpj`, `ano`, `min_count = 3`

One flag per managing unit where the supplier has ≥ 3 inexigibilidade
contracts.

---

## Acceptance scenarios

- Given a CNPJ with ≥ 3 contracts where `fundamento_legal` contains
  "inexigibilidade" (case-insensitive), all from the same
  `id_unidade_gestora` → flag with unit name, count, total value, date range
- Given inexigibilidade contracts spread across different units → no flag
- Given fewer than 3 occurrences per unit → no flag
- `ano` filter present — no full-table scan
