# Task: Single Bidder
**Status:** DONE
**Priority:** P1
**Pattern ID:** `single_bidder`
**Cache key:** `patterns_single_bidder_{cnpj}_{year}`

---

## Why it's suspicious

Competitive bidding with only one participant defeats the purpose of the process. The Open Contracting Partnership lists this as Flag #1 in their 73 red flags guide (2024). A supplier that repeatedly "wins" tenders where no one else showed up may be benefiting from insider information, tailored specifications, or deliberate exclusion of competitors.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.licitacao_participante` | `id_licitacao`, `cpf_cnpj_participante`, `vencedor` | none (join via licitacao) |
| `br_cgu_licitacao_contrato.licitacao` | `id_licitacao`, `id_orgao_superior`, `nome_orgao_superior`, `objeto`, `valor_licitacao`, `ano` | `ano` |

---

## Query

```sql
WITH participantes AS (
  SELECT
    id_licitacao,
    COUNT(*)                                          AS total_participantes,
    COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante, r'\D', ''), @cnpj))            AS cnpj_participated,
    COUNTIF(STARTS_WITH(REGEXP_REPLACE(cpf_cnpj_participante, r'\D', ''), @cnpj) AND vencedor) AS cnpj_won
  FROM `basedosdados.br_cgu_licitacao_contrato.licitacao_participante`
  GROUP BY id_licitacao
)
SELECT
  l.id_orgao_superior,
  l.nome_orgao_superior,
  l.objeto,
  l.valor_licitacao,
  l.data_abertura,
  p.total_participantes
FROM participantes p
JOIN `basedosdados.br_cgu_licitacao_contrato.licitacao` l USING (id_licitacao)
WHERE l.ano = @ano
  AND p.cnpj_participated = 1   -- this CNPJ was in the tender
  AND p.cnpj_won = 1            -- and won
  AND p.total_participantes = 1 -- and was the only participant
```

---

## Configurable Constants

```typescript
const SINGLE_BIDDER_MIN_OCCURRENCES = 2; // flag only if repeated, not a one-off
```

---

## Output Shape

```typescript
interface SingleBidderFlag {
  pattern: 'single_bidder';
  occurrences: number;          // how many single-bidder wins
  totalValue: number;           // BRL — combined value of sole-source tenders
  agencies: string[];           // distinct agencies involved
  sampleObjects: string[];      // first 3 objeto descriptions
}
```

---

## UI

- Label (PT-BR): **"Vencedor Único em Licitações"**
- Show: number of tenders where supplier was the only bidder, combined value, agencies
- Severity: yellow for 2–4, orange for 5–9, red for 10+

---

## Acceptance Criteria

- [x] Only flags tenders where `total_participantes = 1` AND this CNPJ won
- [x] Requires at least 2 occurrences to suppress noise
- [x] Partition filter `ano` on `licitacao` table
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
- Note: batch scanner excludes CPF participants (`LENGTH = 14`) before counting bidders; per-CNPJ counts all participants. Minor divergence — documented in patterns-audit.md.
