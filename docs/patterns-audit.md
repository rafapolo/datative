# Pattern Audit — Robustness & False Positive Analysis

Deep audit of all 8 risk patterns. For each pattern: legal basis, threshold rationale, known false positive scenarios, data quality notes, and differences between the per-CNPJ (interactive) and batch (scan-all) implementations.

---

## US1 — Split Contracts Below Threshold (`split_contracts_below_threshold`)

### Legal basis
**Fracionamento de licitação** is prohibited by:
- Lei 8.666/1993, art. 23, §5º: "É vedada a utilização da modalidade 'convite' ou 'tomada de preços' [...] para parcelas de uma mesma obra ou serviço."
- Lei 14.133/2021, art. 145: directly prohibits splitting to evade the mandatory bidding requirement.

### Threshold: R$ 17.600
- Source: **Decreto 9.412/2018**, which updated Lei 8.666/93 thresholds for *compras e outros serviços* (art. 23, I, "a").
- **Important:** Lei 14.133/2021 art. 75, I raised this to **R$ 50.000** for goods/services. Decreto 11.871/2024 further updated to R$ 57.912.
- For 2023 data: many contracts still ran under Lei 8.666/93 (both laws co-existed). The conservative R$17.600 threshold catches splitting under the old regime; raising to R$50.000 for 2024+ data is appropriate.

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
✅ Identical logic. Both group by `(id_orgao_superior, month)`, same thresholds, same NULL guard.

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
✅ Equivalent logic, different SQL styles. Both count solo-bid wins for the target CNPJ.

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

### Improvements not yet applied
- Add a filter for `modalidade_licitacao` to apply different thresholds for construction vs goods/services (50% ceiling under Lei 14.133/2021 art.125 §1º vs 25% for goods/services). This requires verifying that `contrato_compra` exposes a reliable construction indicator column.

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
Both per-CNPJ and batch use `prev_v > 0` guard to exclude zero→nonzero transitions (handled by US7 newborn_company instead). The batch uses `LAG` window function; per-CNPJ iterates over the history array client-side. Results are equivalent.

The per-CNPJ implementation reports only the **first** qualifying surge year (breaks on first hit). If a company surged twice, only the earlier event is shown. This is conservative — the most distant surge is more likely to still be relevant context.

### Per-CNPJ vs batch consistency
✅ Equivalent. Batch uses SQL `LAG`; per-CNPJ uses JS loop. Both find the first qualifying year.

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
| US1 Split | Medium — multi-item purchasing | Decreto 9.412/2018 | Added NULL date guard to prevent spurious null-month bucket |
| US2 Concentration | Medium — specialized markets | CGU 2022 methodology | Added min supplier spend to all 3 implementations |
| US3 Inexigibility | High — legitimate exclusive suppliers | TCU Acórdão 1.793/2011 | Fixed grouping by ID; added min value to all 3 implementations |
| US4 Single Bidder | Medium — specialized/remote markets | OCP 2024 Flag #1 | No change |
| US5 Always Winner | **Was HIGH** (no competitive filter) → Now Medium | OCDE 2021 | Fixed: competitive auctions only; raised thresholds |
| US6 Amendment | Medium — inflation clauses, construction ceiling | Lei 14.133/2021 art.125 | Added 10× cap on inflation_ratio to exclude data errors |
| US7 Newborn | High — spinoffs, restructurings | CGU 2021 guide | No change |
| US8 Surge | Medium — framework agreements, budget cycles | UNODC 2013 | No change |
