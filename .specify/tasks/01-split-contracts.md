# Task: Split Contracts Below Threshold
**Status:** DONE
**Priority:** P1
**User Story:** US1
**Pattern ID:** `split_contracts_below_threshold`
**Cache key:** `patterns_split_{cnpj}_{year}`

---

## Query

```sql
SELECT
  id_orgao_superior,
  nome_orgao_superior,
  FORMAT_DATE('%Y-%m', data_assinatura_contrato) AS mes,
  COUNT(*)                      AS contrato_count,
  SUM(valor_inicial_compra)     AS combined_value,
  MAX(valor_inicial_compra)     AS max_single_value
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), @cnpj)
  AND ano = @ano
  AND valor_inicial_compra > 0
  AND valor_inicial_compra < @threshold
  AND data_assinatura_contrato IS NOT NULL   -- NULL dates would group into a spurious mes=NULL bucket
GROUP BY id_orgao_superior, nome_orgao_superior, mes
HAVING COUNT(*) >= @min_count
   AND SUM(valor_inicial_compra) > @threshold
```

Parameters: `cnpj`, `ano`, `threshold = SPLIT_THRESHOLD_BRL`, `min_count = SPLIT_MIN_COUNT`

---

## Output → `SplitContractFlag[]`

One flag per (agency, month) cluster that meets the condition.

---

## UI

- Section title (PT-BR): **"Possível Fracionamento de Licitação"**
- Show per flag: agency name, month, number of contracts, combined value
- Severity: orange for 3–4 contracts, red for 5+

---

## Acceptance Criteria

- [x] Returns flag when ≥ 3 contracts from same agency in same month all below threshold with combined value above threshold
- [x] Returns empty when contracts span different months or agencies
- [x] NULL `data_assinatura_contrato` excluded — would otherwise produce a spurious `mes=NULL` bucket
- [x] Partition filters `ano` present; no full-table scan
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
