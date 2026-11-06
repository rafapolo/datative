# Analysis: Always Winner
**Priority:** P1
**Pattern ID:** `always_winner`

---

## Why it's suspicious

In competitive markets, suppliers win 10–30% of bids they enter. A win rate
above 60–70% across many tenders — especially with multiple agencies —
suggests insider advantage, bid-rigging, specifications tailored to this
vendor, or collusion. Referenced in "Forecasting Bid-Rigging in Brazil"
(Cadernos de Finanças Públicas, 2024) as one of the strongest single-variable
predictors of non-competitive behavior.

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
  FROM br_cgu_licitacao_contrato.licitacao_participante p
  JOIN br_cgu_licitacao_contrato.licitacao l USING (id_licitacao)
  WHERE p.cpf_cnpj_participante = $cnpj
    AND l.ano = $ano
)
SELECT
  COUNT(*)                                          AS total_participacoes,
  count(*) FILTER (WHERE vencedor)                  AS total_vitorias,
  count(*) FILTER (WHERE vencedor)::DOUBLE / COUNT(*) AS win_rate,
  SUM(l.valor_licitacao)                             AS total_value_competed
FROM participacoes p
JOIN br_cgu_licitacao_contrato.licitacao l USING (id_licitacao)
HAVING COUNT(*) >= $min_participations
   AND count(*) FILTER (WHERE vencedor)::DOUBLE / COUNT(*) >= $win_rate_threshold
```

Thresholds: `win_rate_threshold = 0.60`, `min_participations = 5` (avoid
small-sample noise).

---

## Acceptance scenarios

- Given a CNPJ with ≥ 5 participations in `licitacao_participante` AND win
  rate ≥ 60% → flag with win rate %, wins vs total participations, and total
  value competed
- Given fewer than 5 participations → no flag (insufficient sample)
- Given win rate below 60% → no flag
- Guard win-rate division against divide-by-zero
- Includes both competitive and single-bidder wins — does NOT deduplicate
  against [[04-single-bidder]]; both can trigger independently
- `ano` filter on `licitacao` join
