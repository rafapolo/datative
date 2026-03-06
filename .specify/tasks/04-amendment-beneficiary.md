# Task: Amendment Beneficiary + Contracts (beneficiario_emenda_com_contratos)
**Status:** TODO
**Priority:** P2
**User Story:** US4
**Pattern ID:** `amendment_beneficiary_contracts`

---

## What to Build

A detection function that identifies companies simultaneously benefiting from legislative amendments (emendas parlamentares) AND winning regular procurement contracts — suggesting possible preferential access to public funds via two parallel channels.

---

## Data Sources

| Table | Key Columns Used | Partition Filter |
|---|---|---|
| `br_cgu_emendas_parlamentares.microdados` | `id_emenda`, `nome_autor_emenda`, `valor_pago`, `ano_emenda`, `nome_funcao` | `ano_emenda` |
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `valor_final_compra`, `data_assinatura_contrato` | `ano`, `mes` |

**Open question:** The emendas table does not appear to have a direct CNPJ column for the beneficiary company. Confirm join mechanism before implementation — options:
1. Join via `nome_programa` / `id_acao` to the `br_me_cnpj` CNAE if a cross-reference table exists
2. Cross-reference via `br_cgu_convenio` (if emendas route through convenios)
3. Portal da Transparência API `/emendas` endpoint returns `cnpjFavorecido`

**Recommended:** Use Portal da Transparência API `/api-de-dados/emendas?cnpjFavorecido={cnpj}` as primary source for this pattern. Requires free API key from portaldatransparencia.gov.br.

---

## Detection Logic

**Via Portal da Transparência API (recommended):**
```
GET https://api.portaldatransparencia.gov.br/api-de-dados/emendas?cnpjFavorecido={cnpj}&pagina=1
Header: chave-api-dados: {API_KEY}
```

Flag when: amendment count > 0 AND contract count > 0

**BigQuery side:**
```sql
SELECT COUNT(*) AS contract_count, SUM(valor_final_compra) AS total_contracts
FROM br_cgu_licitacao_contrato.contrato_compra
WHERE cpf_cnpj_contratado = @cnpj AND ano = @ano
```

---

## Configurable Constants

```typescript
const TRANSPARENCIA_API_KEY = process.env.TRANSPARENCIA_API_KEY ?? '';
const TRANSPARENCIA_API_TIMEOUT_MS = 5_000;  // graceful degradation if slow
```

---

## Output Shape

```typescript
interface AmendmentBeneficiaryFlag {
  pattern: 'amendment_beneficiary_contracts';
  amendmentCount: number;
  totalAmendmentValue: number;  // BRL (valor_pago)
  contractCount: number;
  totalContractValue: number;   // BRL
  source: 'portal_transparencia' | 'bigquery';
}
```

---

## UI Specification

- Flag label (PT-BR): **"Beneficiário de Emenda com Contratos Públicos"**
- Show: number of amendments received, total amendment value (paid), number of procurement contracts, total contract value
- Risk indicator: yellow (informational — dual receipt is not illegal, but notable)

---

## Acceptance Criteria

- [ ] Portal da Transparência API call has 5s timeout; if timeout → skip amendment side, show partial result
- [ ] Flag only shown when BOTH amendment AND contract evidence exist
- [ ] API key sourced from `TRANSPARENCIA_API_KEY` env var; if missing → pattern skipped gracefully with log warning
- [ ] Result cached under key `amendment_beneficiary_{cnpj}_{year}` for 5 days
- [ ] No blocking: if API is unavailable, BigQuery patterns still render
