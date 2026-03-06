# Task: Split Contracts Below Threshold (fracionamento_licitacao)
**Status:** TODO
**Priority:** P1
**User Story:** US1
**Pattern ID:** `split_contracts_below_threshold`

---

## What to Build

A detection function that, given a `cnpj_basico`, queries `br_cgu_licitacao_contrato.contrato_compra` and identifies clusters of contracts from the same agency for similar objects, all below the *dispensa de licitação* threshold, within the same calendar month.

---

## Data Sources

| Table | Key Columns Used | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `id_orgao_superior`, `nome_orgao_superior`, `objeto`, `valor_inicial_compra`, `data_assinatura_contrato`, `modalidade` | `ano`, `mes` |

No external API required.

---

## Detection Logic

```
GROUP BY cpf_cnpj_contratado, id_orgao_superior, FORMAT_DATE('%Y-%m', data_assinatura_contrato)
HAVING COUNT(*) >= 3
   AND MAX(valor_inicial_compra) < SPLIT_THRESHOLD   -- configurable constant, default R$ 17.600
   AND SUM(valor_inicial_compra) > SPLIT_THRESHOLD   -- combined value exceeds threshold
```

Object similarity: cluster by `id_orgao_superior` only in first version. Object text similarity is a future refinement (P3+).

---

## Configurable Constants (define at top of index.ts)

```typescript
const SPLIT_THRESHOLD = 17_600;  // BRL, dispensa threshold as of 2024 (Lei 14.133/2021)
const SPLIT_MIN_COUNT = 3;       // minimum contracts in same month/agency to trigger
```

---

## Output Shape

```typescript
interface SplitContractFlag {
  pattern: 'split_contracts_below_threshold';
  agencyName: string;
  month: string;           // e.g. "2023-08"
  contractCount: number;
  combinedValue: number;   // BRL
  maxSingleValue: number;  // BRL
}
```

---

## UI Specification

- Flag label (PT-BR): **"Possível Fracionamento de Licitação"**
- Show: agency name, month, number of contracts, combined value
- Link each contract to existing contract detail view if available
- Risk indicator: orange (medium) for 3-4 contracts, red (high) for 5+

---

## Acceptance Criteria

- [ ] Returns flag when CNPJ has ≥ 3 contracts from same agency in same month all below R$ 17.600 with combined value above threshold
- [ ] Returns empty when contracts span different months or agencies
- [ ] Result is cached under key `split_contracts_{cnpj}` for 5 days
- [ ] Threshold constant is documented in CLAUDE.md
- [ ] Query uses `ano`/`mes` partition filters
