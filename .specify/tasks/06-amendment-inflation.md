# Task: Contract Amendment Inflation
**Status:** TODO
**Priority:** P1
**Pattern ID:** `amendment_inflation`
**Cache key:** `patterns_amendment_inflation_{cnpj}_{year}`

---

## Why it's suspicious

Brazilian law (Lei 14.133/2021, art. 125; formerly Lei 8.666/93, art. 65 §1º) caps contract amendments at **25% above the original value**. When a contract's final value significantly exceeds its original value — especially via multiple *termos aditivos* — it signals superfaturamento (overbilling), fraudulent renegotiation, or that the winning bid was intentionally underpriced to win the auction (low-ball then inflate). This is a primary TCU audit red flag, confirmed in Acórdão 1.924/2018 and CGU's 2025 Superfaturamento Guide.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `id_contrato`, `cpf_cnpj_contratado`, `valor_inicial_compra`, `valor_final_compra`, `nome_unidade_gestora`, `objeto`, `data_assinatura_contrato` | `ano`, `mes` |
| `br_cgu_licitacao_contrato.contrato_termo_aditivo` | `id_contrato`, `id_termo_aditivo`, `objeto` | none |

---

## Query

```sql
WITH aditivos AS (
  SELECT id_contrato, COUNT(*) AS aditivo_count
  FROM `basedosdados.br_cgu_licitacao_contrato.contrato_termo_aditivo`
  GROUP BY id_contrato
)
SELECT
  c.id_contrato,
  c.nome_unidade_gestora,
  c.objeto,
  c.valor_inicial_compra,
  c.valor_final_compra,
  c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) AS inflation_ratio,
  c.data_assinatura_contrato,
  COALESCE(a.aditivo_count, 0)                             AS aditivo_count
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra` c
LEFT JOIN aditivos a USING (id_contrato)
WHERE c.cpf_cnpj_contratado = @cnpj
  AND c.ano = @ano
  AND c.valor_inicial_compra > 0
  AND c.valor_final_compra / NULLIF(c.valor_inicial_compra, 0) >= @inflation_threshold
ORDER BY inflation_ratio DESC
```

---

## Configurable Constants

```typescript
const AMENDMENT_INFLATION_THRESHOLD = 1.25; // 25% above original = legal ceiling (Lei 14.133/2021)
const AMENDMENT_MIN_ORIGINAL_VALUE  = 10_000; // BRL — ignore trivially small contracts
```

---

## Output Shape

```typescript
interface AmendmentInflationFlag {
  pattern: 'amendment_inflation';
  contractCount: number;         // contracts exceeding threshold
  maxInflationRatio: number;     // worst offender ratio (e.g. 2.4 = 140% above original)
  totalOriginalValue: number;    // BRL
  totalFinalValue: number;       // BRL
  excessValue: number;           // totalFinalValue - totalOriginalValue
  worstAgency: string;           // agency with the highest inflated contract
}
```

---

## UI

- Label (PT-BR): **"Superfaturamento via Aditivos Contratuais"**
- Show: number of inflated contracts, excess value (R$ above original), worst ratio seen
- Severity: orange for ratio 1.25–1.99, red for ≥ 2.0 (double the original price)

---

## Acceptance Criteria

- [ ] Guards against division by zero with `NULLIF(valor_inicial_compra, 0)`
- [ ] Skips contracts with `valor_inicial_compra < R$ 10.000` to avoid noise
- [ ] Counts `aditivo_count` from join — a contract at 130% with 0 amendments is more suspicious than one with 5 amendments (price revision)
- [ ] `excessValue` surfaced in UI so users understand the BRL impact
- [ ] Partition filters `ano`, `mes` on `contrato_compra`
- [ ] Integrated into `runPatterns()` via `Promise.allSettled`
