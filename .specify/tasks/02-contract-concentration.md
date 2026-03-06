# Task: Contract Concentration (concentracao_contratos)
**Status:** TODO
**Priority:** P1
**User Story:** US2
**Pattern ID:** `contract_concentration`

---

## What to Build

A detection function that, given a `cnpj_basico`, identifies any government agency where this supplier captures more than a configurable share of total procurement spend.

---

## Data Sources

| Table | Key Columns Used | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `id_orgao_superior`, `nome_orgao_superior`, `valor_final_compra`, `data_assinatura_contrato` | `ano`, `mes` |

No external API required.

---

## Detection Logic

Two-step query:

**Step 1** — Supplier spend per agency:
```sql
SELECT id_orgao_superior, nome_orgao_superior,
       SUM(valor_final_compra) AS supplier_spend
FROM contrato_compra
WHERE cpf_cnpj_contratado = @cnpj AND ano = @ano
GROUP BY id_orgao_superior, nome_orgao_superior
```

**Step 2** — Total agency spend (subquery or separate query):
```sql
SELECT id_orgao_superior, SUM(valor_final_compra) AS agency_total
FROM contrato_compra
WHERE ano = @ano
GROUP BY id_orgao_superior
```

Flag when: `supplier_spend / agency_total >= CONCENTRATION_THRESHOLD`

---

## Configurable Constants

```typescript
const CONCENTRATION_THRESHOLD = 0.40;  // 40% of agency budget
const CONCENTRATION_MIN_AGENCY_SPEND = 50_000;  // BRL — ignore tiny agencies
```

---

## Output Shape

```typescript
interface ConcentrationFlag {
  pattern: 'contract_concentration';
  agencyName: string;
  agencyId: string;
  supplierShare: number;    // 0.0–1.0
  supplierSpend: number;    // BRL
  agencyTotalSpend: number; // BRL
  year: number;
}
```

---

## UI Specification

- Flag label (PT-BR): **"Alta Concentração de Contratos"**
- Show: agency name, supplier % share (formatted as percentage), supplier spend vs. agency total
- Risk indicator: orange for 40–60%, red for >60%

---

## Acceptance Criteria

- [ ] Returns flag when supplier holds ≥ 40% of any agency's spend for the queried year
- [ ] Ignores agencies with total spend < R$ 50.000 to avoid noise from micro-units
- [ ] Returns empty when no agency exceeds threshold
- [ ] Result cached under key `concentration_{cnpj}_{year}` for 5 days
- [ ] Uses `ano` partition filter; no full-table scan
