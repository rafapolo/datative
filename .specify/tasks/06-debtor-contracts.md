# Task: Debtor Contracts (devedor_com_contratos)
**Status:** TODO
**Priority:** P3
**User Story:** US6
**Pattern ID:** `debtor_contracts`

---

## What to Build

A detection function that cross-references the PGFN active federal tax debt registry with public procurement contracts, flagging companies that won contracts while in open tax default.

---

## Data Source

**PGFN Open Data** — quarterly CSV published by Procuradoria-Geral da Fazenda Nacional:
- URL pattern: `https://www.pgfn.fazenda.gov.br/dadosabertos/PGFN/CND/` (confirm current URL)
- Files split by state (UF), updated quarterly
- Key columns: `CNPJ_CPF_DO_DEVEDOR`, `SITUACAO`, `DATA_INSCRICAO`, `TIPO_DEVEDOR`, `VALOR_CONSOLIDADO`, `NOME_DEVEDOR`

**BigQuery (contracts):**
- `br_cgu_licitacao_contrato.contrato_compra` — `cpf_cnpj_contratado`, `data_assinatura_contrato`, `valor_final_compra`

---

## Architecture Decision

PGFN data is too large to query per-request. Two options:

**Option A (recommended for MVP):** Use the Portal da Transparência API:
```
GET https://api.portaldatransparencia.gov.br/api-de-dados/divida-ativa/empresa-devedora?cnpj={cnpj}
Header: chave-api-dados: {API_KEY}
```
Returns: debt inscriptions with `situacao`, `dataInscricao`, `valorConsolidado`.

**Option B (future):** Ingest PGFN CSVs into a separate cache table. Requires infrastructure work — defer to later milestone.

---

## Detection Logic

1. Query Portal da Transparência for debt inscriptions with `situacao = "ATIVA"`
2. Query BigQuery for contracts signed while any inscription was active
3. Flag if overlap exists

---

## Configurable Constants

```typescript
const PGFN_DEBT_STATUSES_ACTIVE = ['ATIVA NAO PRIORIZADA PARA AJUIZAMENTO', 'ATIVA'];
```

---

## Output Shape

```typescript
interface DebtorContractsFlag {
  pattern: 'debtor_contracts';
  activeDebtCount: number;
  totalDebtValue: number;      // BRL
  contractsDuringDebt: number;
  valueContractsDuringDebt: number;  // BRL
  source: 'portal_transparencia';
}
```

---

## UI Specification

- Flag label (PT-BR): **"Devedor da União com Contratos Públicos"**
- Show: number of active debt inscriptions, total debt value, contracts awarded during debt period
- Risk indicator: orange (medium-high — may have been regularized during bid process)

---

## Acceptance Criteria

- [ ] Requires `TRANSPARENCIA_API_KEY` env var; if missing → skip pattern with warning
- [ ] API timeout: 5s — non-blocking
- [ ] Handles CNPJ-not-found gracefully (API returns empty array → no flag)
- [ ] Result cached under key `debtor_contracts_{cnpj}` for 5 days
- [ ] Documents the Portal da Transparência API endpoint used in code comment
