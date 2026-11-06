# Analysis: Contract Concentration
**Priority:** P1
**Pattern ID:** `contract_concentration`

---

## Why it's suspicious

A supplier capturing an unusually high share of a single agency's budget in a
given year suggests possible favoritism or lack of competition.

---

## Query

Two aggregations in a single query using conditional sums:

```sql
SELECT
  id_orgao_superior,
  nome_orgao_superior,
  SUM(CASE WHEN cpf_cnpj_contratado = $cnpj THEN valor_final_compra ELSE 0 END) AS supplier_spend,
  SUM(valor_final_compra)                                                         AS agency_total
FROM br_cgu_licitacao_contrato.contrato_compra
WHERE ano = $ano
  AND id_orgao_superior IN (
    -- pre-filter to agencies where this CNPJ has at least one contract
    SELECT DISTINCT id_orgao_superior
    FROM br_cgu_licitacao_contrato.contrato_compra
    WHERE cpf_cnpj_contratado = $cnpj AND ano = $ano
  )
GROUP BY id_orgao_superior, nome_orgao_superior
HAVING agency_total >= $min_agency_spend
   AND supplier_spend / agency_total >= $threshold
```

Parameters: `cnpj`, `ano`, `threshold = 0.40`, `min_agency_spend = 50_000` (BRL)

One flag per agency that exceeds the concentration threshold.

---

## Acceptance scenarios

- Given a CNPJ holding ≥ 40% of an agency's total contract spend for the year,
  and the agency's total exceeds R$ 50.000 → flag with agency name, supplier
  share %, and both spend figures
- Given concentration below 40% in all agencies → no flag
- Given agency total below R$ 50.000 → excluded from analysis (avoid noise
  from micro-units)
- Inner subquery limits scan to relevant agencies; `ano` filter on both inner
  and outer queries — no full-table scan
