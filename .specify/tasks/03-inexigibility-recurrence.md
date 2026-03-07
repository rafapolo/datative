# Task: Inexigibility Recurrence
**Status:** DONE
**Priority:** P1
**User Story:** US3
**Pattern ID:** `inexigibility_recurrence`
**Cache key:** `patterns_inexigibility_{cnpj}_{year}`

---

## Query

```sql
SELECT
  id_unidade_gestora,
  nome_unidade_gestora,
  COUNT(*)                      AS contrato_count,
  SUM(valor_inicial_compra)     AS total_value,
  MIN(data_assinatura_contrato) AS first_date,
  MAX(data_assinatura_contrato) AS last_date
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), @cnpj)
  AND ano = @ano
  AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
  AND valor_inicial_compra >= @min_value  -- excludes micro-value contracts (< R$1k) unlikely to represent real abuse
GROUP BY id_unidade_gestora, nome_unidade_gestora
HAVING COUNT(*) >= @min_count
```

Parameters: `cnpj`, `ano`, `min_count = INEXIGIBILITY_MIN_COUNT`, `min_value = INEXIGIBILITY_MIN_VALUE`

---

## Output → `InexigibilityFlag[]`

One flag per managing unit where the supplier has ≥ 3 inexigibilidade contracts.

---

## UI

- Section title (PT-BR): **"Recorrência de Inexigibilidade"**
- Show per flag: managing unit name, contract count, total value, date range
- Severity: yellow for 3–5, orange for 6–9, red for 10+

---

## Acceptance Criteria

- [x] Detects all `fundamento_legal` variants via case-insensitive `LIKE '%INEXIGIBILIDADE%'`
- [x] Returns flag when ≥ 3 inexigibilidade contracts from same managing unit (grouped by ID, not just name)
- [x] Micro-value contracts excluded (`valor_inicial_compra < R$ 1.000`) — de minimis purchases are not meaningful abuse indicators
- [x] Returns empty when spread across units or fewer than 3 per unit
- [x] Partition filter `ano` present; no full-table scan
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
