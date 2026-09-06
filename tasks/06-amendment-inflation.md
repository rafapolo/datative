# Analysis: Contract Amendment Inflation
**Priority:** P1
**Pattern ID:** `amendment_inflation`

---

## Why it's suspicious

Brazilian law (Lei 14.133/2021, art. 125; formerly Lei 8.666/93, art. 65 §1º)
caps contract amendments at **25% above the original value**. When a
contract's final value significantly exceeds its original value — especially
via multiple *termos aditivos* — it signals superfaturamento (overbilling),
fraudulent renegotiation, or that the winning bid was intentionally
underpriced to win the auction (low-ball then inflate). This is a primary TCU
audit red flag, confirmed in Acórdão 1.924/2018 and CGU's 2025 Superfaturamento
Guide.

---

## Data Source

| Table | Key Columns | Partition Filter |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | `id_contrato`, `cpf_cnpj_contratado`, `valor_inicial_compra`, `valor_final_compra`, `nome_unidade_gestora`, `objeto`, `data_assinatura_contrato` | `ano`, `mes` |
| `br_cgu_licitacao_contrato.contrato_termo_aditivo` | `id_contrato`, `id_termo_aditivo`, `objeto` | none |

---

## Query (BigQuery-flavored; needs DuckDB translation)

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

Thresholds: `inflation_threshold = 1.25` (legal ceiling),
`min_original_value = 10_000` (BRL — ignore trivially small contracts).

`aditivo_count` matters as context: a contract at 130% with 0 amendments is
more suspicious than one with 5 amendments (incremental price revision).

---

## Acceptance scenarios

- Given a CNPJ with contracts where
  `valor_final_compra / valor_inicial_compra >= 1.25` AND
  `valor_inicial_compra > R$ 10.000` → flag with count of inflated contracts,
  total excess value, and worst inflation ratio seen
- Given all contracts within 25% of original value → no flag
- Given `valor_inicial_compra = 0` → contract excluded (division guard)
- `ano`, `mes` filters on `contrato_compra`
