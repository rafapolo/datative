# Task: Sanctioned Still Receiving (sancionado_recebendo_contratos)
**Status:** TODO
**Priority:** P2
**User Story:** US5
**Pattern ID:** `sanctioned_still_receiving`

---

## What to Build

A detection function that identifies companies with formal sanctions (court-ordered contract bans via improbidade, or registry entries in CEIS/CNEP) that continued winning public contracts during the sanction period.

---

## Data Sources — Two Tiers

### Tier 1: basedosdados (no API key required)

| Table | Key Columns Used |
|---|---|
| `br_cnj_improbidade_administrativa.condenacao` | `id_pessoa`, `tipo_pessoa`, `proibicao_contratar_poder_publico` (bool), `inicio_proibicao_contratar_poder_publico` (date), `fim_proibicao_contratar_poder_publico` (date) |
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `data_assinatura_contrato`, `valor_final_compra`, `nome_unidade_gestora` |

**Join challenge:** `condenacao` identifies persons by `id_pessoa` — confirm whether this field stores CNPJ for legal entities. Field `tipo_pessoa` distinguishes natural vs. legal persons.

### Tier 2: Portal da Transparência API (enrichment, requires free API key)

```
GET /api-de-dados/ceis?cnpjSancionado={cnpj}        # CEIS registry
GET /api-de-dados/cnep?cnpjSancionado={cnpj}         # CNEP registry
```

Both return: sanction start date, end date, sanction type, issuing authority.

---

## Detection Logic

**Tier 1 (improbidade):**
```sql
SELECT c.inicio_proibicao_contratar_poder_publico AS ban_start,
       c.fim_proibicao_contratar_poder_publico AS ban_end,
       COUNT(cc.id_contrato) AS contracts_during_ban,
       SUM(cc.valor_final_compra) AS value_during_ban
FROM br_cnj_improbidade_administrativa.condenacao c
JOIN br_cgu_licitacao_contrato.contrato_compra cc
  ON cc.cpf_cnpj_contratado = @cnpj   -- TODO: confirm id_pessoa = CNPJ for legal entities
WHERE c.proibicao_contratar_poder_publico = TRUE
  AND cc.data_assinatura_contrato BETWEEN c.ban_start AND c.ban_end
```

**Tier 2 (CEIS/CNEP):** same logic applied to API-returned date ranges.

Flag when: contracts_during_ban > 0 in either tier.

---

## Output Shape

```typescript
interface SanctionedReceivingFlag {
  pattern: 'sanctioned_still_receiving';
  sanctionSource: 'improbidade' | 'ceis' | 'cnep';
  banStart: string;    // ISO date
  banEnd: string;      // ISO date
  contractsDuringBan: number;
  valueDuringBan: number;  // BRL
}
```

---

## UI Specification

- Flag label (PT-BR): **"Sancionado com Contratos no Período de Vedação"**
- Show: sanction source, ban period, contracts received during ban, total value
- Risk indicator: **red** (high severity — this is a direct enforcement failure)

---

## Acceptance Criteria

- [ ] Tier 1 (improbidade) works without any external API key
- [ ] Tier 2 (CEIS/CNEP) is additive — both can trigger independently
- [ ] Join between `condenacao` and `contrato_compra` confirmed to use correct CNPJ field (document finding in code comment)
- [ ] Sanction date overlap logic handles NULL `fim_proibicao` (open-ended bans) as "ban still active"
- [ ] Result cached under key `sanctioned_receiving_{cnpj}` for 5 days
- [ ] API failure on CEIS/CNEP does not suppress improbidade result
