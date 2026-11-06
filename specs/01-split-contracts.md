# Analysis: Split Contracts Below Threshold
**Priority:** P1
**Pattern ID:** `split_contracts_below_threshold`

---

## Why it's suspicious

Repeatedly winning small contracts from the same agency just below the
competitive-bidding threshold in the same month is a classic *fracionamento de
licitação* (contract-splitting) signature — structuring purchases to dodge the
tendering requirement that would kick in above the threshold.

---

## Query

```sql
SELECT
  id_orgao_superior,
  nome_orgao_superior,
  strftime(data_assinatura_contrato, '%Y-%m') AS mes,
  COUNT(*)                      AS contrato_count,
  SUM(valor_inicial_compra)     AS combined_value,
  MAX(valor_inicial_compra)     AS max_single_value
FROM br_cgu_licitacao_contrato.contrato_compra
WHERE cpf_cnpj_contratado = $cnpj
  AND ano = $ano
  AND valor_inicial_compra < $threshold
GROUP BY id_orgao_superior, nome_orgao_superior, mes
HAVING COUNT(*) >= $min_count
   AND SUM(valor_inicial_compra) > $threshold
```

Parameters: `cnpj`, `ano`, `threshold = 17_600` (BRL), `min_count = 3`

One flag per (agency, month) cluster that meets the condition.

---

## Acceptance scenarios

- Given a CNPJ with ≥ 3 contracts from the same `id_orgao_superior`, all below
  R$ 17.600, in the same calendar month, with combined value exceeding
  R$ 17.600 → flag with agency, month, count, and combined value
- Given contracts spread across different months or agencies → no flag
- Given contracts above R$ 17.600 individually → no flag
- Must filter by `ano` — no full-table scan
