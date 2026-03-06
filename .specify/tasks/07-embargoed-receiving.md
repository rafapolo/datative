# Task: Embargoed Receiving (embargado_recebendo_contratos)
**Status:** BLOCKED — needs schema verification
**Priority:** P3
**User Story:** US7
**Pattern ID:** `embargoed_receiving`

---

## What to Build

A detection function that identifies companies with active IBAMA environmental embargoes while simultaneously receiving public procurement contracts.

---

## Data Sources

| Source | Table / Endpoint | Status |
|---|---|---|
| IBAMA embargoes | `basedosdados.br_ibama_autua_embargo.*` | **NEEDS VERIFICATION** — dataset exists on basedosdados.org (ID: b4c69d95-d132-4ab3-b828-7761913333fb) but access permissions unknown |
| Contracts | `br_cgu_licitacao_contrato.contrato_compra` | ✅ Available |

---

## Pre-Implementation Required Step

Before writing any code:
1. Run `./scripts/dump-schema.sh` and check for `br_ibama_autua_embargo` in the output
2. If accessible, document the key columns (expected: `cnpj`, `data_embargo`, `data_levantamento`, `tipo_infracao`, `area_embargada_ha`, `municipio`, `sigla_uf`)
3. If not accessible → pivot to IBAMA open data file: `https://dadosabertos.ibama.gov.br/dataset/embargos-ambientais`

---

## Detection Logic (pending schema verification)

```sql
SELECT e.data_embargo, e.data_levantamento, e.tipo_infracao,
       COUNT(cc.id_contrato) AS contracts_during_embargo,
       SUM(cc.valor_final_compra) AS value_during_embargo
FROM br_ibama_autua_embargo.embargos e  -- table name TBD
JOIN br_cgu_licitacao_contrato.contrato_compra cc
  ON cc.cpf_cnpj_contratado = @cnpj    -- CNPJ join column TBD
WHERE e.cnpj = @cnpj                   -- column name TBD
  AND cc.data_assinatura_contrato >= e.data_embargo
  AND (cc.data_assinatura_contrato <= e.data_levantamento OR e.data_levantamento IS NULL)
```

---

## Output Shape

```typescript
interface EmbargoedReceivingFlag {
  pattern: 'embargoed_receiving';
  embargoType: string;
  embargoStart: string;
  embargoEnd: string | null;   // null = still active
  contractsDuringEmbargo: number;
  valueDuringEmbargo: number;  // BRL
  embargoedAreaHa: number | null;
}
```

---

## UI Specification

- Flag label (PT-BR): **"Embargado pelo IBAMA com Contratos Públicos"**
- Show: embargo type, embargo period, contracts during embargo, total value
- Risk indicator: **red** (environmental non-compliance + public funds)

---

## Acceptance Criteria

- [ ] Schema dump confirms `br_ibama_autua_embargo` table accessibility BEFORE implementation begins
- [ ] If BigQuery table inaccessible → fallback to IBAMA open data CSV (document URL in code)
- [ ] NULL `data_levantamento` treated as "embargo still active today"
- [ ] Result cached under key `embargoed_receiving_{cnpj}` for 5 days
- [ ] All column names verified against actual schema — no assumptions
