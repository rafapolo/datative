# Task: Newborn Company
**Status:** TODO
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
| `br_me_cnpj.empresas` | `cnpj_basico`, `data_inicio_atividade`, `porte`, `razao_social` | `ano`, `mes` |
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `data_assinatura_contrato`, `nome_unidade_gestora` | `ano`, `mes` |

---

## Query

```sql
WITH empresa AS (
  SELECT cnpj_basico, data_inicio_atividade, porte
  FROM `basedosdados.br_me_cnpj.empresas`
  WHERE cnpj_basico = @cnpj_basico
    AND ano = @ano AND mes = @mes   -- latest available partition
  LIMIT 1
),
primeiro_contrato AS (
  SELECT
    MIN(data_assinatura_contrato)  AS first_contract_date,
    COUNT(*)                       AS contract_count,
    SUM(valor_final_compra)        AS total_value
  FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
  WHERE SUBSTR(cpf_cnpj_contratado, 1, 8) = @cnpj_basico
)
SELECT
  e.data_inicio_atividade,
  e.porte,
  p.first_contract_date,
  DATE_DIFF(p.first_contract_date, e.data_inicio_atividade, DAY) AS days_to_first_contract,
  p.contract_count,
  p.total_value
FROM empresa e, primeiro_contrato p
WHERE DATE_DIFF(p.first_contract_date, e.data_inicio_atividade, DAY) <= @max_days
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

- [ ] `cnpj_basico` is the 8-digit root (first 8 chars of 14-digit CNPJ) — join is `SUBSTR(cpf_cnpj_contratado, 1, 8)`
- [ ] Uses latest available `empresas` partition; documents which `ano`/`mes` was used in flag output
- [ ] Skips if `data_inicio_atividade` is NULL (some older records incomplete)
- [ ] Skips contracts below R$ 50.000 — avoid flagging MEIs on small legitimate purchases
- [ ] Not time-bounded to current year — checks full contract history since founding
- [ ] Integrated into `runPatterns()` via `Promise.allSettled`
