# Pattern Audit — Robustness & False Positive Analysis

Deep audit of all 8 risk patterns. For each pattern: legal basis, threshold rationale, known false positive scenarios, data quality notes, and differences between the per-CNPJ (interactive) and batch (scan-all) implementations.

---

## US1 — Split Contracts Below Threshold (`split_contracts_below_threshold`)

### Legal basis
**Fracionamento de licitação** is prohibited by:
- Lei 8.666/1993, art. 23, §5º: "É vedada a utilização da modalidade 'convite' ou 'tomada de preços' [...] para parcelas de uma mesma obra ou serviço."
- Lei 14.133/2021, art. 145: directly prohibits splitting to evade the mandatory bidding requirement.

### Threshold: year-dependent

| Period | Threshold | Legal basis |
|---|---|---|
| ≤ 2023 | R$ 17.600 | Decreto 9.412/2018 / Lei 8.666/93 art. 23, I, "a" |
| 2024+ | R$ 57.912 | Decreto 11.871/2024 / Lei 14.133/2021 art. 75, I |

For 2023 data many contracts still ran under Lei 8.666/93 (both laws co-existed). From 2024 the threshold is R$57.912. Using a static R$17.600 for 2024+ data would miss the main fraud window (R$17k–R$57k per contract). **Fixed (iteration 7):** all three implementations compute the threshold from the query year.

### False positive scenarios
1. **Legitimate multi-item purchasing**: A supplier providing diverse small items (office supplies, food for canteen) legitimately generates many small contracts below threshold from the same agency. The `combined_value > threshold` guard reduces but doesn't eliminate this.
2. **Recurring service contracts**: Monthly service fees (e.g., R$1.500/month cleaning) generate 12 contracts/year — correctly NOT flagged (combined = R$18.000 > threshold, count ≥ 3 in first 3 months).
3. **Different sub-units**: The grouping uses `id_orgao_superior` (ministry level). A ministry with many sub-units contracting independently may not be splitting; they may have independent needs.

### Improvements applied
- None structural. Filter `valor_inicial_compra > 0` prevents division issues.

### Known data quality issues
- `data_assinatura_contrato` can be NULL for some older contracts. **`FORMAT_DATE` on NULL returns NULL — it does NOT exclude those rows.** Without a guard, all NULL-dated contracts from the same agency would be grouped together under a single `NULL` month bucket, potentially producing a false flag if ≥3 of them are below threshold with combined value > threshold. Fixed (iteration 5): all three implementations now include `AND data_assinatura_contrato IS NOT NULL` in the WHERE clause.
- `valor_inicial_compra` vs `valor_final_compra`: we use `valor_inicial_compra` intentionally since splitting is defined by the contract as signed, not final.

### Improvements applied (iteration 5)
- Added `AND data_assinatura_contrato IS NOT NULL` to WHERE clause in all three implementations to prevent NULL-date contracts from being grouped into a spurious `mes = NULL` bucket.

### Per-CNPJ vs batch consistency
⚠️ Minor: `index.ts` and `scan-suspicious.ts` group by `(id_orgao_superior, nome_orgao_superior, mes)`. `scan-all.ts` groups by `(cnpj_basico, nome_orgao_superior, mes)` — no `id_orgao_superior`. Two ministries with the same name would be merged in the batch (theoretical; no such collision exists at `orgao_superior` level). All three implementations have the same NULL guard and thresholds.

---

## US2 — Contract Concentration (`contract_concentration`)

### Legal basis
No specific legal prohibition, but **TCU** and **CGU** audit methodology treat >40% share of a single agency's budget as a prima facie risk indicator requiring justification.
- Reference: CGU "Manual de Orientações para Análise de Risco em Compras Públicas" (2022), section 4.2.

### Thresholds
- **40% share**: empirical; above this, competition is functionally absent for that agency.
- **R$ 50.000 minimum agency total**: excludes micro-units (small local offices) where one purchase naturally dominates.
- **R$ 10.000 minimum supplier spend** (new, iteration 2): excludes trivial cases like a company with R$21k of a R$50k agency = 42% but both numbers are small.

### False positive scenarios
1. **Specialized niches**: A sole provider of a specialized service (e.g., judicial translation, specific medical device) may legitimately dominate one agency's procurement. No CNAE-based filter exists.
2. **Monopolistic markets**: Some goods/services have few suppliers by nature (utilities, telecommunications infrastructure).
3. **Framework agreements**: A single framework contract can make one supplier appear to dominate even if bidding was competitive at framework establishment.

### Improvements applied
- Added `CONCENTRATION_MIN_SUPPLIER_SPEND = 10_000` to batch query and `scan-suspicious.ts` (iteration 2).
- Added `CONCENTRATION_MIN_SUPPLIER_SPEND` filter to `index.ts` `patternConcentration` HAVING clause (iteration 4 — was present in batch/scan-suspicious but missing from web UI).

### Per-CNPJ vs batch consistency
✅ Fixed (iteration 4): `index.ts` HAVING clause now includes `supplier_spend >= CONCENTRATION_MIN_SUPPLIER_SPEND`. Previously ⚠️ — the per-CNPJ web UI was missing this guard, producing more false positives than the batch scanner.
⚠️ Minor (acceptable): `index.ts` groups by `(id_orgao_superior, nome_orgao_superior)` while `scan-suspicious.ts` and `scan-all.ts` group by `nome_orgao_superior` only. If two ministries share the same name (very rare at `orgao_superior` level), `scan-suspicious` and `scan-all` would merge them. The behavior difference is negligible in practice for ministry-level data.

---

## US3 — Inexigibility Recurrence (`inexigibility_recurrence`)

### Legal basis
**Inexigibilidade de licitação** (Lei 14.133/2021 art. 74; Lei 8.666/93 art. 25) is legal when competition is technically impossible (e.g., exclusive supplier, artistic performances). Abuse occurs when agencies use inexigibilidade repeatedly for the same supplier to avoid competitive bidding.
- Reference: **TCU Acórdão 1.793/2011**: defines recurrent inexigibilidade as a risk indicator requiring documentation of technical exclusivity per contract.

### Threshold: 3 contracts per managing unit
- Below 3: could be two legitimate sole-source needs in the same year.
- At 3+: pattern suggests systematic routing of contracts to avoid bidding.

### False positive scenarios
1. **Legitimate exclusive suppliers**: Publishers (publishing rights), performing arts venues, specialized IT vendors with proprietary systems legitimately receive many inexigibilidade contracts.
2. **Long-term technical partnerships**: An agency may have a multi-year framework with an exclusive technical partner, generating many inexigibilidade contracts each year.
3. **Artistic/cultural organizations**: Museums, theaters, and orchestras commonly contract artists via inexigibilidade.

### Improvements applied (iteration 2)
- **Batch + scan-suspicious**: Now groups by `id_unidade_gestora` (ID) + `nome_unidade_gestora` (name). Previously grouped by name only, risking merger of distinct units sharing a common name.
- **Batch + scan-suspicious**: Added `valor_inicial_compra >= R$ 1.000` filter. Micro-value contracts (< R$1k) rarely represent real abuse.

### Improvements applied (iteration 4)
- **`index.ts`**: Added `AND valor_inicial_compra >= @min_value` to WHERE clause of `patternInexigibility`. The web UI was missing this filter, causing micro-value contracts to inflate the count and trigger false flags.

### Per-CNPJ vs batch consistency
✅ Fixed (iteration 4): all three implementations now filter `valor_inicial_compra >= R$ 1.000` and group by `id_unidade_gestora`.

---

## US4 — Single Bidder (`single_bidder`)

### Legal basis
Not inherently illegal, but flagged by:
- **Open Contracting Partnership "73 Red Flags" (2024)**, Flag #1: "Only one bid received."
- CGU "Programa de Fiscalização em Entes Federativos" 2023: single-bidder rate >30% is a tier-1 risk indicator.

### Threshold: 2 occurrences
- Intentionally low. Even one solo-bid win warrants investigation context. Two is the minimum pattern.

### False positive scenarios
1. **Specialized markets**: Satellite communications, nuclear materials, specialized medical devices — few vendors exist globally.
2. **Geographic isolation**: Remote municipalities with limited local suppliers naturally attract few bidders even for standard goods.
3. **Poorly timed notices**: Short bid windows or holiday periods reduce participation regardless of market structure.

### SQL robustness notes
- Per-CNPJ: uses `STARTS_WITH(REGEXP_REPLACE(...), @cnpj)` — this matches any CNPJ where the base 8 digits match, including subsidiaries/branches. This is intentional: a corporate group that operates through multiple CNPJs should still surface.
- Batch: uses `MAX(IF(vencedor, SUBSTR(...), NULL))` to extract the winner's CNPJ from the `auction_stats` CTE. If two rows have `vencedor=true` for the same auction (data quality issue), `MAX` picks lexicographically last — acceptable for batch purposes.

### Per-CNPJ vs batch consistency
⚠️ Minor inconsistency: **batch filters CPF participants** (`LENGTH(REGEXP_REPLACE(cpf_cnpj_participante, r'\D', '')) = 14`) before counting bidders, so an auction with 1 CNPJ + 1 CPF bidder has `total_bidders = 1` in the batch (flagged). **Per-CNPJ implementations** (`index.ts`, `scan-suspicious.ts`) count ALL participants with `COUNT(*)` and require `total_participantes = 1`, so the same auction has `total_participantes = 2` (not flagged).

The per-CNPJ behavior is arguably more correct — a CPF bidder IS a real participant even if individuals rarely win procurement contracts. The batch produces slightly more flags (less conservative). This is a known acceptable divergence documented for transparency.

---

## US5 — Always Winner (`always_winner`)

### Legal basis
Not illegal per se, but high win rates in competitive auctions indicate possible:
- Bid rigging (Lei 12.529/2011 art. 36, IV)
- Tailored specifications (Lei 14.133/2021 art. 9, I)
- Reference: **OCDE "Guidelines for Fighting Bid Rigging in Public Procurement" (2021)**

### Thresholds
- **≥80% win rate** (per-CNPJ, fixed) — raised from 60% to reduce false positives. Batch uses dynamic Q3 (empirically ≈100% in this dataset).
- **≥10 competitive participations** — minimum sample for statistical significance. Aligns batch and per-CNPJ.
- **Competitive auctions only (≥2 bidders)** — critical to avoid overlap with US4.

### Critical fix applied (iteration 2)
**The per-CNPJ version was NOT filtering for competitive auctions before this iteration.** A company that always won because it was always the only bidder would be flagged by both US4 (single_bidder) AND US5 (always_winner) — misleading double-counting. Fixed by adding a `competitive_auctions` CTE that filters `COUNT(1) >= 2`.

### Win rate distribution note
The `licitacao_participante` dataset is **strongly bimodal**: approximately 33% of companies with ≥10 competitive participations have a perfect 100% win rate. The distribution does not follow a normal or uniform pattern. Q3 ≈ 1.0 regardless of the minimum sample cutoff (tested at 5, 10, 20). The dynamic Q3 threshold therefore flags only **perfect-win companies** — intentionally strict. This is documented in the spec.

### Per-CNPJ vs batch consistency
✅ Fixed (iteration 2): both now filter for competitive auctions. Batch uses dynamic Q3; per-CNPJ uses fixed 0.80 threshold. The fixed threshold produces a slightly broader result set on the interactive page, which is acceptable — the batch feed should be conservative; per-CNPJ investigation mode can be more sensitive.

---

## US6 — Amendment Inflation (`amendment_inflation`)

### Legal basis
**Lei 14.133/2021 art. 125 §1º**: amendments may not increase the contract value by more than 25% of the original (for goods/services) or 50% (for construction). Inflation ≥ 1.25× means the contract **reached or exceeded its legal ceiling**.

### Threshold: 1.25× (25% above original)
- Exactly the legal maximum. Contracts at 1.25× are at the legal limit; contracts above are potentially illegal unless specific circumstances apply (art. 125 §2º exceptions).

### False positive scenarios
1. **Lawful exceptional amendments**: Art. 125 §2º allows exceeding 25% for "additional work indispensable to the object's completion" — requires specific administrative justification.
2. **Construction contracts**: Legal ceiling is 50% (not 25%). Our threshold of 1.25× flags construction contracts that are within the legal limit.
3. **Value adjustment clauses**: Contracts with inflation adjustment clauses (INPC/IPCA) can legitimately reach or exceed 1.25× over multi-year terms without any amendment.
4. **Data entry errors**: Some `valor_final_compra` values are clearly data quality issues (e.g., 100× original).

### Improvements applied (iteration 3)
- **Cap `inflation_ratio` at 10×** (`AMENDMENT_MAX_INFLATION_RATIO = 10.0`): ratios above this threshold are almost certainly data entry errors (e.g., `valor_final_compra` entered in a different unit) and would distort `total_excess` reporting. Applied to all three implementations via `AND ... <= @max_ratio` filter in SQL. Applied in `index.ts`, `scan-all.ts`, `scan-suspicious.ts`.

### Schema verification: construction vs goods/services threshold
Lei 14.133/2021 art.125 §1º allows 50% amendments for engineering works vs 25% for goods/services. Applying the stricter 25% to everything is **conservative and safe** — it may over-flag construction contracts but will never under-flag goods contracts.

**Column verified (schema dump):** `contrato_compra` has `id_modalidade_licitacao` (code) and `modalidade_licitacao` (name). However, this column encodes **bidding modality** (Concorrência, Pregão Eletrônico, Tomada de Preços, etc.) — not contract category (obras vs bens/serviços). Modalidade "Concorrência" is used for both large construction and large goods contracts; "Pregão Eletrônico" is almost exclusively goods/services. There is no `tipo_contrato` or `categoria` column in the accessible schema.

**Conclusion:** Differentiating construction from goods/services would require text parsing of the `objeto` field for keywords like "obra", "construção", "reforma", "engenharia" — an inherently fragile approach. **This improvement is deferred.** Current 25% threshold is conservative and correct for the majority of contracts (goods/services); it may produce some false positives for large engineering works, which analysts should evaluate in context.

### Per-CNPJ vs batch consistency
✅ Identical logic.

---

## US7 — Newborn Company (`newborn_company`)

### Legal basis
No specific prohibition, but:
- **Lei 14.133/2021 art. 68, I**: suppliers must demonstrate technical and economic qualification. Newly incorporated companies rarely can.
- CGU "Guia Prático de Análise de Empresas de Fachada" (2021): age < 6 months at contract signing is a tier-1 indicator of possible shell company.

### Thresholds
- **180 days** (6 months): practical minimum for legitimate operational readiness.
- **R$ 50.000 minimum contract value**: excludes training contracts and small acquisitions where new companies are common and low-risk.

### False positive scenarios
1. **Spinoffs and restructurings**: A newly incorporated CNPJ may be a restructured entity of an existing business with full operational capacity.
2. **Holding company structures**: A holding created to receive a specific contract may have the technical capacity of its parent, not its founding date.
3. **Startups in innovation programs**: Government startup accelerator programs (e.g., FAPESP TT, EMBRAPII) specifically contract very new companies.
4. **`data_inicio_atividade` from establishments**: The founding date comes from `br_me_cnpj.estabelecimentos`, not `empresas`. Branches opened after the headquarter can make an established company appear "newborn" in a specific municipality.

### Data quality note
`data_inicio_atividade` lives in `br_me_cnpj.estabelecimentos`, NOT `empresas`. The query uses `MIN(est.data_inicio_atividade)` across all establishments for the same `cnpj_basico` — this correctly picks the earliest known opening date, reducing the false positive of branches.

### Per-CNPJ vs batch consistency
✅ Equivalent. Both use `MIN(data_inicio_atividade)` across establishments with `ano=2023 AND mes=12`.

⚠️ **Known necessary full-table scan**: The `first_contract` CTE in `batchNewborn` (`scan-all.ts`) intentionally omits an `ano` filter on `contrato_compra`:
```sql
FROM `basedosdados.br_cgu_licitacao_contrato.contrato_compra`
WHERE LENGTH(REGEXP_REPLACE(cpf_cnpj_contratado, r'\D', '')) = 14
  AND valor_final_compra >= <MIN_VALUE>
GROUP BY cnpj_basico
```
This is a deliberate exception to the "zero full-table scans" rule from the spec. The pattern asks: *"did this company win its very first contract within 180 days of founding?"* Restricting to `ano = ANO` would miss the true first contract if it occurred in an earlier year — producing a false negative. The `founding` CTE correctly filters `e.ano = ANO AND est.ano = ANO AND est.mes = 12`. Only `first_contract` scans all years, but the `LENGTH = 14` CPF exclusion and `valor_final_compra >= R$ 50k` filter significantly reduce bytes scanned.

---

## US8 — Sudden Surge (`sudden_surge`)

### Legal basis
Not illegal, but flagged by:
- **UNODC "Guidebook on anti-corruption in public procurement" (2013)**: "Sudden large increase in a company's public contract revenue" is a tier-2 risk indicator.
- TCU Acórdão 2.622/2015: large YoY procurement increases without prior procurement history warrant scrutiny.

### Thresholds
- **5× YoY growth**: chosen to exclude normal business growth (2-3×) while flagging exponential jumps.
- **R$ 1.000.000 minimum**: a 5× jump from R$200k to R$1M is meaningful; from R$10k to R$50k is noise.
- **4-year lookback**: captures context before the surge.

### False positive scenarios
1. **Post-restructuring recovery**: A company that was inactive for 2 years then resumed full operations would appear to surge.
2. **New framework agreements**: Being added to a large framework agreement in year N can produce apparent surge with no underlying change in the company.
3. **Government budget cycles**: Some sectors receive large multi-year contracts every 4 years (e.g., IT system replacements) creating apparent surges.

### SQL robustness note
Both per-CNPJ and batch use `prev_v > 0` guard to exclude zero→nonzero transitions (handled by US7 newborn_company instead). The batch uses `LAG` window function; per-CNPJ iterates over the history array client-side.

**Consecutive-year guard (iteration 6):** The spec says `value[year_N] / value[year_N-1]`. Without a guard, `LAG` compares any adjacent rows in sorted order — if a company had data in 2019 and 2023 (dormant 2020–2022), the comparison spans 4 years and produces a false surge. Fixed by:
- `scan-all.ts`: added `LAG(ano)` alongside `LAG(v)` and `WHERE ano - prev_ano = 1`
- `index.ts`, `scan-suspicious.ts`: added `curr.ano - prev.ano === 1` to the JS loop condition

**false positive (false negative from audit):** The first false positive scenario (post-restructuring recovery) is now LESS likely to trigger since the consecutive-year guard would catch companies dormant for ≥1 year.

The per-CNPJ implementation reports only the **first** qualifying surge year (breaks on first hit). If a company surged twice, only the earlier event is shown. This is conservative.

### Per-CNPJ vs batch consistency
✅ Equivalent. Batch uses SQL `LAG`; per-CNPJ uses JS loop. Both find the first qualifying year.

---

## Infrastructure Issue: Cache Miss vs Stored Null

### Bug 1: Cache Miss vs Stored Null (fixed iteration 6)

`cache.ts` `getCache` was returning `null` for both cache misses (file not found) and legitimately stored null values (pattern found nothing). Patterns US4–US8 and the company lookup all use `null` as their "nothing found" sentinel and check `cached !== undefined` to skip re-querying. With the old `getCache` returning `null` on miss, `null !== undefined` evaluated to `true`, causing the BigQuery query to be skipped permanently — US4–US8 would never execute on a CNPJ not yet in cache.

**Fix:** `getCache` now returns `undefined` on miss or expiry; returns `T` (including `null`) on a valid cache hit. The company-lookup caller that used `!== null` was updated to `!== undefined`.

### Bug 2: Falsy cache check for array-returning patterns (fixed iteration 7)

US1, US2, US3, and `runPatterns()` in `index.ts` used `if (cached) return cached` to check for cache hits. An empty array `[]` is **falsy** in JavaScript — so a cached "no flags found" result (a real cache hit) was silently discarded, causing BigQuery to be re-queried on every subsequent call for clean CNPJs.

Affected: `patternSplitContracts`, `patternConcentration`, `patternInexigibility`, `runPatterns`.

**Fix:** changed all four to `if (cached !== undefined) return cached`. (US4–US8 already used this pattern since they cache `null` as "nothing found" — they were correct.)

---

## Cross-Pattern Issues

### Overlap between US4 and US5
- **Before iteration 2**: US5 per-CNPJ would flag solo-bid winners as "always winner", creating confusing double flags.
- **After iteration 2**: US5 filters to competitive auctions only. A pure solo-bid company gets US4 only; a company that wins competitive auctions at high rates gets US5 only; both behaviors together get both flags independently.

### Overlap between US7 and US8
- A newborn company with a sudden surge would be flagged by both US7 (age at contract) and US8 (YoY growth). This is intentional and additive — both signals reinforce each other.

### CNPJ matching strategy
All patterns use `cnpj_basico` (8-digit root) as the joining key. This means **all branches and subsidiaries** of a corporate group are attributed to the same `cnpj_basico`. This can create false positives for large corporations with many legitimate establishments (e.g., Correios, Petrobras) that naturally have contracts across many agencies.

---

## Summary Table

| Pattern | FP Risk | Legal Basis | Fixes Applied |
|---------|---------|------------|---------------|
| US1 Split | Medium — multi-item purchasing | Decreto 9.412/2018 / Decreto 11.871/2024 | NULL date guard; year-dependent threshold (R$17.600 ≤2023, R$57.912 2024+); falsy cache check fixed |
| US2 Concentration | Medium — specialized markets | CGU 2022 methodology | Added min supplier spend to all 3 implementations; **falsy cache check fixed** |
| US3 Inexigibility | High — legitimate exclusive suppliers | TCU Acórdão 1.793/2011 | Fixed grouping by ID; added min value to all 3 implementations; **falsy cache check fixed** |
| US4 Single Bidder | Medium — specialized/remote markets | OCP 2024 Flag #1 | **cache.ts bug fixed** (getCache null-vs-undefined); CPF-counting inconsistency documented |
| US5 Always Winner | **Was HIGH** (no competitive filter) → Now Medium | OCDE 2021 | Fixed: competitive auctions only; raised thresholds; **cache.ts bug fixed** |
| US6 Amendment | Medium — inflation clauses, construction ceiling | Lei 14.133/2021 art.125 | Added 10× inflation cap; **cache.ts bug fixed**; construction 50% ceiling deferred |
| US7 Newborn | High — spinoffs, restructurings | CGU 2021 guide | **cache.ts bug fixed** (was never querying BigQuery on cache miss) |
| US8 Surge | Medium — framework agreements, budget cycles | UNODC 2013 | Added consecutive-year guard; **cache.ts bug fixed** |
