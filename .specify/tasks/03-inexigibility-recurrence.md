# Task: Inexigibility Recurrence (recorrencia_inexigibilidade)
**Status:** TODO
**Priority:** P1
**User Story:** US3
**Pattern ID:** `inexigibility_recurrence`

---

## What to Build

A detection function that identifies suppliers repeatedly winning non-competitive ("inexigibilidade") contracts from the same managing unit for similar work — abusing the sole-source exemption.

---

## Data Sources

| Table | Key Columns Used | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `id_unidade_gestora`, `nome_unidade_gestora`, `fundamento_legal`, `objeto`, `valor_inicial_compra`, `data_assinatura_contrato` | `ano`, `mes` |

No external API required.

---

## Detection Logic

```sql
SELECT id_unidade_gestora, nome_unidade_gestora,
       COUNT(*) AS contrato_count,
       SUM(valor_inicial_compra) AS total_value,
       MIN(data_assinatura_contrato) AS first_date,
       MAX(data_assinatura_contrato) AS last_date
FROM contrato_compra
WHERE cpf_cnpj_contratado = @cnpj
  AND ano = @ano
  AND UPPER(fundamento_legal) LIKE '%INEXIGIBILIDADE%'
GROUP BY id_unidade_gestora, nome_unidade_gestora
HAVING COUNT(*) >= @min_count  -- configurable, default 3
```

---

## Configurable Constants

```typescript
const INEXIGIBILITY_MIN_COUNT = 3;  // minimum occurrences per agency to trigger
```

---

## Output Shape

```typescript
interface InexigibilityFlag {
  pattern: 'inexigibility_recurrence';
  agencyUnit: string;
  agencyUnitId: string;
  contractCount: number;
  totalValue: number;      // BRL
  firstDate: string;       // ISO date
  lastDate: string;        // ISO date
}
```

---

## UI Specification

- Flag label (PT-BR): **"Recorrência de Inexigibilidade"**
- Show: managing unit name, number of sole-source contracts, total value, date range
- Risk indicator: yellow for 3–5, orange for 6–9, red for 10+

---

## Acceptance Criteria

- [ ] Detects inexigibilidade via case-insensitive `LIKE '%INEXIGIBILIDADE%'` on `fundamento_legal`
- [ ] Returns flag when ≥ 3 inexigibilidade contracts from same managing unit
- [ ] Returns empty when contracts are spread across different units
- [ ] Result cached under key `inexigibility_{cnpj}_{year}` for 5 days
- [ ] Covers both "inexigibilidade de licitação" and "inexigibilidade" variants in `fundamento_legal`
