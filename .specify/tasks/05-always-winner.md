# Task: Always Winner
**Status:** DONE
**Priority:** P1
**Pattern ID:** `always_winner`
**Cache key:** `patterns_always_winner_{cnpj}_{year}`

---

## Why it's suspicious

In competitive markets, suppliers win 10–30% of bids they enter. A win rate above 60–70% across many tenders — especially with multiple agencies — suggests insider advantage, bid-rigging, specifications tailored to this vendor, or collusion. Referenced in "Forecasting Bid-Rigging in Brazil" (Cadernos de Finanças Públicas, 2024) as one of the strongest single-variable predictors of non-competitive behavior.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.licitacao_participante` | `id_licitacao`, `cpf_cnpj_participante`, `vencedor` | none |
| `br_cgu_licitacao_contrato.licitacao` | `id_licitacao`, `ano` | `ano` |

---

## Query

```sql
WITH participacoes AS (
  SELECT
    p.id_licitacao,
    p.vencedor
  FROM `basedosdados.br_cgu_licitacao_contrato.licitacao_participante` p
  JOIN `basedosdados.br_cgu_licitacao_contrato.licitacao` l USING (id_licitacao)
  WHERE STARTS_WITH(REGEXP_REPLACE(p.cpf_cnpj_participante, r'\D', ''), @cnpj)
    AND l.ano = @ano
)
SELECT
  COUNT(*)                    AS total_participacoes,
  COUNTIF(vencedor = TRUE)    AS total_vitorias,
  COUNTIF(vencedor = TRUE) / COUNT(*) AS win_rate,
  SUM(l.valor_licitacao)      AS total_value_competed
FROM participacoes p
JOIN `basedosdados.br_cgu_licitacao_contrato.licitacao` l USING (id_licitacao)
HAVING COUNT(*) >= @min_participations
   AND COUNTIF(vencedor = TRUE) / COUNT(*) >= @win_rate_threshold
```

---

## Configurable Constants

```typescript
const WIN_RATE_THRESHOLD    = 0.80; // 80% win rate (per-CNPJ); batch uses dynamic Q3 ≈ 1.0 (bimodal distribution)
const WIN_RATE_MIN_SAMPLE   = 10;   // minimum competitive participations (≥2 bidders) to avoid small-sample noise
```

---

## Output Shape

```typescript
interface AlwaysWinnerFlag {
  pattern: 'always_winner';
  totalParticipations: number;
  totalWins: number;
  winRate: number;           // 0.0–1.0
  totalValueCompeted: number; // BRL — total value of all tenders entered
}
```

---

## UI

- Label (PT-BR): **"Taxa de Vitória Anômala em Licitações"**
- Show: win rate as percentage, wins vs participations (e.g. "12 de 14 licitações"), total value competed
- Severity: yellow for 60–74%, orange for 75–89%, red for 90%+

---

## Acceptance Criteria

- [x] Minimum 10 **competitive** participations (auctions with ≥2 bidders) required — no flag for small samples
- [x] Only counts competitive auctions (≥2 total bidders) — solo-bidder tenders excluded to prevent double-flagging with US4
- [x] `win_rate` computed with `NULLIF` division guard (avoid division by zero)
- [x] Partition filter `ano` on `licitacao` join
- [x] Integrated into `runPatterns()` via `Promise.allSettled`
- Note: batch uses dynamic Q3 threshold (≈100% in practice — bimodal dataset); per-CNPJ uses fixed 0.80. Documented divergence.
