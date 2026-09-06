# Analysis: Newborn Company
**Priority:** P2
**Pattern ID:** `newborn_company`

---

## Why it's suspicious

Shell companies are frequently created specifically for a procurement scheme —
they have no operational history, no real employees, and exist only to route
public money. The TSE identified 2,502 campaign suppliers incorporated in
election year (2022) with party-affiliated partners (CNN Brasil, 2022). O
Globo's LCM investigation (2026) found competitors registered at housing
projects whose partners were enrolled in social welfare programs — textbook
fronts. A company winning significant government contracts within months of
its founding is a strong shell company indicator.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_me_cnpj.empresas` | `cnpj_basico`, `data_inicio_atividade`, `porte`, `razao_social` | `ano`, `mes` |
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `data_assinatura_contrato`, `nome_unidade_gestora` | `ano`, `mes` |

---

## Query

```sql
WITH empresa AS (
  SELECT cnpj_basico, data_inicio_atividade, porte
  FROM br_me_cnpj.empresas
  WHERE cnpj_basico = $cnpj_basico
    AND ano = $ano AND mes = $mes   -- latest available partition
  LIMIT 1
),
primeiro_contrato AS (
  SELECT
    MIN(data_assinatura_contrato)  AS first_contract_date,
    COUNT(*)                       AS contract_count,
    SUM(valor_final_compra)        AS total_value
  FROM br_cgu_licitacao_contrato.contrato_compra
  WHERE SUBSTR(cpf_cnpj_contratado, 1, 8) = $cnpj_basico
)
SELECT
  e.data_inicio_atividade,
  e.porte,
  p.first_contract_date,
  date_diff('day', e.data_inicio_atividade, p.first_contract_date) AS days_to_first_contract,
  p.contract_count,
  p.total_value
FROM empresa e, primeiro_contrato p
WHERE date_diff('day', e.data_inicio_atividade, p.first_contract_date) <= $max_days
  AND p.total_value >= $min_contract_value
```

Thresholds: `max_days = 180` (6 months founding→first contract),
`min_contract_value = 50_000` (BRL — ignore tiny contracts, avoid flagging
MEIs on small legitimate purchases).

---

## Acceptance scenarios

- Given a CNPJ where `data_inicio_atividade` in `br_me_cnpj.empresas` is
  within 180 days of the first `data_assinatura_contrato`, AND total contract
  value ≥ R$ 50.000 → flag with company age at first contract, size category,
  and total value won
- Given founding date NULL → no flag (insufficient data)
- Given only small contracts (< R$ 50.000) → no flag
- `cnpj_basico` is the 8-digit root (first 8 chars of the 14-digit CNPJ); join
  is `SUBSTR(cpf_cnpj_contratado, 1, 8)`
- Use latest available `empresas` partition; document which `ano`/`mes` was
  used in the flag output
- Not time-bounded to current year — checks full contract history since
  founding
