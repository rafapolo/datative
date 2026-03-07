# Task: Contract Concentration
**Status:** DONE
**Priority:** P1
**User Story:** US2
**Pattern ID:** `contract_concentration`
**Cache key:** `patterns_concentration_{cnpj}_{year}`

---

## Query

Two aggregations in a single query using conditional sums:

```sql
SELECT
  id_orgao_superior,
  nome_orgao_superior,
  SUM(CASE WHEN STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), @cnpj)
           THEN valor_final_compra ELSE 0 END) AS supplier_spend,
  SUM(valor_final_compra)                      AS agency_total
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE ano = @ano
  AND id_orgao_superior IN (
    SELECT DISTINCT id_orgao_superior
    FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
    WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), @cnpj) AND ano = @ano
  )
GROUP BY id_orgao_superior, nome_orgao_superior
HAVING agency_total >= @min_agency_spend
   AND supplier_spend >= @min_supplier_spend      -- excludes trivially small supplier spend
   AND supplier_spend / NULLIF(agency_total, 0) >= @threshold
```

Parameters: `cnpj`, `ano`, `threshold = CONCENTRATION_THRESHOLD`, `min_agency_spend = CONCENTRATION_MIN_SPEND`, `min_supplier_spend = CONCENTRATION_MIN_SUPPLIER_SPEND`

---

## Output → `ConcentrationFlag[]`

One flag per agency that exceeds the concentration threshold.

---

## UI

- Section title (PT-BR): **"Alta Concentração de Contratos"**
- Show per flag: agency name, supplier share as percentage, supplier spend vs. agency total
- Severity: orange for 40–60%, red for >60%

---

## Acceptance Criteria

- [x] Returns flag when supplier holds ≥ 40% of agency spend AND agency total ≥ R$ 50.000 AND supplier spend ≥ R$ 10.000
- [x] Returns empty when no agency exceeds threshold
- [x] Inner subquery limits scan to relevant agencies — no full-table scan on the outer query
- [x] Partition filter `ano` present on both inner and outer queries
- [x] `NULLIF` division guard prevents division by zero
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
