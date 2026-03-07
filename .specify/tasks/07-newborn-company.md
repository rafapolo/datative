# Task: Newborn Company
**Status:** DONE
**Priority:** P2
**Pattern ID:** `newborn_company`
**Cache key:** `patterns_newborn_company_{cnpj}`

---

## Why it's suspicious

Shell companies are frequently created specifically for a procurement scheme — they have no operational history, no real employees, and exist only to route public money. The TSE identified 2,502 campaign suppliers incorporated in election year (2022) with party-affiliated partners (CNN Brasil, 2022). O Globo's LCM investigation (2026) found competitors registered at housing projects whose partners were enrolled in social welfare programs — textbook fronts. A company winning significant government contracts within months of its founding is a strong shell company indicator.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_me_cnpj.empresas` | `cnpj_basico`, `porte`, `razao_social` | `ano`, `mes` |
| `br_me_cnpj.estabelecimentos` | `cnpj_basico`, **`data_inicio_atividade`** | `ano`, `mes` — **`data_inicio_atividade` lives here, NOT in `empresas`; JOIN on `cnpj_basico` with `ano=N AND mes=12`** |
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `data_assinatura_contrato`, `nome_unidade_gestora` | `ano`, `mes` |

---

## Query

```sql
WITH empresa AS (
  -- data_inicio_atividade is in estabelecimentos, NOT empresas — JOIN required
  SELECT e.cnpj_basico, MIN(est.data_inicio_atividade) AS data_inicio_atividade, e.porte
  FROM `basedosdados.br_me_cnpj.empresas` e
  JOIN `basedosdados.br_me_cnpj.estabelecimentos` est
    ON est.cnpj_basico = e.cnpj_basico AND est.ano = @ano AND est.mes = 12
  WHERE e.cnpj_basico = @cnpj_basico
    AND e.ano = @ano AND e.mes = 12
  GROUP BY e.cnpj_basico, e.porte
),
primeiro_contrato AS (
  -- intentionally no `ano` filter — must find the very first contract ever across all years
  SELECT
    MIN(data_assinatura_contrato)  AS first_contract_date,
    COUNT(*)                       AS contract_count,
    SUM(valor_final_compra)        AS total_value
  FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
  WHERE SUBSTR(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', ''), 1, 8) = @cnpj_basico
    AND LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', '')) = 14  -- exclude CPFs
    AND valor_final_compra >= @min_contract_value
)
SELECT
  e.data_inicio_atividade,
  e.porte,
  p.first_contract_date,
  DATE_DIFF(p.first_contract_date, e.data_inicio_atividade, DAY) AS days_to_first_contract,
  p.contract_count,
  p.total_value
FROM empresa e, primeiro_contrato p
WHERE e.data_inicio_atividade IS NOT NULL
  AND p.first_contract_date IS NOT NULL
  AND DATE_DIFF(p.first_contract_date, e.data_inicio_atividade, DAY) BETWEEN 0 AND @max_days
  AND p.total_value >= @min_contract_value
```

---

## Configurable Constants

```typescript
const NEWBORN_MAX_DAYS_TO_CONTRACT = 180; // 6 months from founding to first contract
const NEWBORN_MIN_CONTRACT_VALUE   = 50_000; // BRL — ignore tiny contracts
```

---

## Output Shape

```typescript
interface NewbornCompanyFlag {
  pattern: 'newborn_company';
  foundingDate: string;         // ISO date — data_inicio_atividade
  firstContractDate: string;    // ISO date
  daysToFirstContract: number;
  companySize: string;          // porte field (MEI, ME, EPP, etc.)
  totalContractValue: number;   // BRL — all contracts since founding
}
```

---

## UI

- Label (PT-BR): **"Empresa Recém-Constituída com Contratos Públicos"**
- Show: company age at first contract (in days/months), total contract value won, company size category
- Severity: red for < 30 days, orange for 30–90 days, yellow for 90–180 days

---

## Acceptance Criteria

- [x] `cnpj_basico` is the 8-digit root — `SUBSTR(REGEXP_REPLACE(col, r'\D', ''), 1, 8)` with `LENGTH = 14` CPF exclusion
- [x] `data_inicio_atividade` fetched from `br_me_cnpj.estabelecimentos` (not `empresas`) via JOIN; `MIN()` picks earliest establishment date across all branches
- [x] Uses `ano=N AND mes=12` partition on both `empresas` and `estabelecimentos`
- [x] Skips if `data_inicio_atividade` is NULL
- [x] `DATE_DIFF BETWEEN 0 AND @max_days` — excludes negative (contract before founding, data error) and > 180 days
- [x] Skips contracts below R$ 50.000 — avoid flagging MEIs on small legitimate purchases
- [x] `primeiro_contrato` CTE intentionally omits `ano` filter — must find the very first contract ever (known necessary exception to full-scan rule)
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
