# DATATIVE — Investigation Recommendation System
## Product Constitution

---

## Mission

DATATIVE is an **investigation recommendation system** for Brazilian public procurement. It helps journalists, researchers, and civil society decide *where to look next* by combining automated statistical analysis with community intelligence.

The system answers the question: **"Which companies are worth investigating, and why?"**

---

## Core Principle

> A recommendation is not a verdict. Every signal — automated or community-sourced — is a starting point for investigation, not a conclusion.

DATATIVE surfaces companies that are statistically anomalous in public procurement data AND/OR flagged by the investigative community. It explains *why* each company appears in the feed (specific pattern names visible on every card), so investigators can immediately understand the nature of the potential risk before opening a case.

---

## What DATATIVE Does

1. **Detects** — runs 8 SQL-based risk patterns against federal procurement data (CGU, Receita Federal) for every CNPJ that has public contracts
2. **Explains** — shows the specific reason(s) why a company is flagged (e.g., "Fracionamento · Sempre vence") directly on the landing feed and on the company page
3. **Ranks** — merges automated signals (flag count) with community votes (▲ suspeito / ▼ sem evidência, Reddit-style) into a prioritized investigation queue
4. **Crowdsources** — lets investigators add text notes to any CNPJ, creating a shared investigative thread visible to all users
5. **Deep-dives** — on the company graph page, shows corporate network (owners, subsidiaries), related datasets (contracts, donations, exports), and the full alert breakdown

**In scope:** 8 patterns across 3 BigQuery datasets. Community voting. Investigation notes.
**Out of scope:** sanction registries (CEIS/CNEP), PGFN debt, IBAMA embargoes — all require external APIs or inaccessible tables.

---

## User Scenarios

### US1 — P1: Split Contracts Below Threshold
**As** an investigative journalist viewing a company profile,
**I want** to see whether this supplier repeatedly wins small contracts from the same agency just below competitive bidding thresholds in the same month,
**So that** I can flag potential *fracionamento de licitação* (contract-splitting fraud).

**Acceptance scenarios:**
- Given a CNPJ with ≥ 3 contracts from the same `id_orgao_superior`, all below R$ 17.600, in the same calendar month, with combined value exceeding R$ 17.600 → flag shown with agency, month, count, and combined value
- Given contracts spread across different months or agencies → no flag
- Given contracts above R$ 17.600 individually → no flag
- Given `data_assinatura_contrato` is NULL → contract excluded (cannot be assigned to a month; grouping NULLs together would produce false flags)

---

### US2 — P1: Contract Concentration
**As** a researcher analyzing public procurement,
**I want** to see if a supplier captures an unusually high share of a single agency's budget in a given year,
**So that** I can identify possible favoritism or lack of competition.

**Acceptance scenarios:**
- Given a CNPJ holding ≥ 40% of an agency's total contract spend for the year, the agency's total exceeds R$ 50.000, AND the supplier's own spend at that agency exceeds R$ 10.000 → flag shown with agency name, supplier share %, and both spend figures
- Given concentration below 40% in all agencies → no flag
- Given agency total below R$ 50.000 → excluded from analysis (avoid noise from micro-units)
- Given supplier spend at the agency below R$ 10.000 → excluded (avoids flagging e.g. R$21k/R$50k = 42% where both values are trivially small)

---

### US3 — P1: Inexigibility Recurrence
**As** a transparency advocate reviewing procurement records,
**I want** to see how often a supplier wins non-competitive ("inexigibilidade") contracts from the same managing unit,
**So that** I can identify possible abuse of the sole-source exemption.

**Acceptance scenarios:**
- Given a CNPJ with ≥ 3 contracts where `fundamento_legal` contains "inexigibilidade" (case-insensitive), all from the same `id_unidade_gestora`, each with `valor_inicial_compra ≥ R$ 1.000` → flag shown with unit name, unit ID, count, and total value
- Given inexigibilidade contracts spread across different units → no flag
- Given fewer than 3 occurrences per unit → no flag
- Given only micro-value contracts (< R$ 1.000 each) → excluded (de minimis purchases are not meaningful abuse indicators)

---

### US4 — P1: Single Bidder
**As** an investigative journalist,
**I want** to see if this supplier frequently wins tenders where they were the only participant,
**So that** I can identify possible insider access, tailored specifications, or deliberate exclusion of competitors.

**Acceptance scenarios:**
- Given a CNPJ with ≥ 2 tenders in `licitacao_participante` where `total_participantes = 1` AND this CNPJ won → flag shown with occurrence count, combined tender value, and agencies involved
- Given a CNPJ with only 1 such occurrence → no flag (could be coincidence)
- Given a CNPJ with solo-bidder tenders in a single specialized niche → flag still shown (context is for the journalist to assess)

---

### US5 — P1: Always Winner
**As** a researcher analyzing bidding behavior,
**I want** to see if this supplier wins an unusually high share of the bids it enters,
**So that** I can identify possible bid-rigging, insider advantage, or specifications tailored to this vendor.

**Acceptance scenarios:**
- Given a CNPJ with ≥ 10 participations in **competitive** auctions (where total bidders ≥ 2) AND win rate ≥ Q3 of the distribution across all qualifying bidders → flag shown with win rate %, wins vs total, and total value competed
- Given fewer than 10 competitive participations → no flag (insufficient sample)
- Given win rate below Q3 → no flag

**Implementation note:** The win rate distribution in `br_cgu_licitacao_contrato` is strongly bimodal — ~33% of qualifying companies have a perfect 100% win rate, making Q3 = 100% regardless of sample size. The Q3 threshold is therefore intentionally strict, flagging only companies with a perfect competitive win record. The dynamic threshold is printed at runtime. The 60% hardcoded floor was removed in favour of the data-driven Q3.

---

### US6 — P1: Contract Amendment Inflation
**As** a fiscal auditor reviewing a company's contracts,
**I want** to see if its contracts were amended to values far above the originally signed price,
**So that** I can identify superfaturamento or low-ball-then-inflate schemes.

**Acceptance scenarios:**
- Given a CNPJ with contracts where `valor_final_compra / valor_inicial_compra >= 1.25` (legal ceiling under Lei 14.133/2021) AND `valor_inicial_compra > R$ 10.000` → flag shown with count of inflated contracts, total excess value, and worst inflation ratio seen
- Given all contracts within 25% of original value → no flag
- Given `valor_inicial_compra = 0` → contract excluded (division guard)
- Given `valor_final_compra / valor_inicial_compra > 10.0` → contract excluded (data quality guard — ratios above 10× indicate data entry errors, not real procurement fraud)

---

### US7 — P2: Newborn Company
**As** an investigative journalist,
**I want** to see if this company won significant public contracts very shortly after being incorporated,
**So that** I can identify possible shell companies created specifically for a procurement scheme.

**Acceptance scenarios:**
- Given a CNPJ where `data_inicio_atividade` (from `br_me_cnpj.estabelecimentos`, joined via `cnpj_basico`) is within 180 days of the first `data_assinatura_contrato`, AND total contract value ≥ R$ 50.000 → flag shown with company age at first contract, size category, and total value won
- Given founding date NULL → no flag (insufficient data)
- Given only small contracts (< R$ 50.000) → no flag

---

### US8 — P2: Sudden Contract Surge
**As** a researcher tracking procurement trends,
**I want** to see if this supplier's annual government revenue spiked dramatically in a recent year,
**So that** I can identify possible capture of public budgets following political or management changes.

**Acceptance scenarios:**
- Given a CNPJ where `value[year_N] / value[year_N-1] >= 5.0` AND `value[year_N] >= R$ 1.000.000` AND `value[year_N-1] > 0` → flag shown with surge year, growth multiplier, prior-year value, surge-year value, and agency count
- Given no prior-year activity → no flag (use `newborn_company` instead)
- Given surge below 5× or absolute value below R$ 1M → no flag
- Given `year_N-1` has no data (gap year — company was dormant) → no flag; `year_N-1` must be the calendar year immediately preceding `year_N`, otherwise the growth spans multiple dormant years and is not a YoY surge

---

## Data Sources

| Table | Used by | Key Columns |
|---|---|---|
| `br_cgu_licitacao_contrato.contrato_compra` | US1–3, US6–8 | `cpf_cnpj_contratado`, `valor_inicial_compra`, `valor_final_compra`, `id_orgao_superior`, `id_unidade_gestora`, `fundamento_legal`, `data_assinatura_contrato`, `ano`, `mes` |
| `br_cgu_licitacao_contrato.licitacao_participante` | US4–5 | `id_licitacao`, `cpf_cnpj_participante`, `vencedor` |
| `br_cgu_licitacao_contrato.licitacao` | US4–5 | `id_licitacao`, `id_orgao_superior`, `valor_licitacao`, `ano` |
| `br_cgu_licitacao_contrato.contrato_termo_aditivo` | US6 | `id_contrato`, `id_termo_aditivo` |
| `br_me_cnpj.empresas` | US7 | `cnpj_basico`, `porte`, `ano`, `mes` |
| `br_me_cnpj.estabelecimentos` | US7 | `cnpj_basico`, `data_inicio_atividade`, `ano`, `mes` — **`data_inicio_atividade` lives here, not in `empresas`; requires JOIN on `cnpj_basico` with partition filter `ano=N AND mes=12`** |

---

## Success Criteria

- All 8 flags computed in parallel and cached per CNPJ for 5 days
- One failing pattern never blocks the others (`Promise.allSettled`)
- Each flag shown in a "Alertas de Risco" section on the CNPJ detail page in Portuguese
- Zero full-table scans — every query filters by `ano`
- All thresholds are named constants with comments citing legal basis or source
- No external API dependency for any of the 8 patterns

---

## Signal Architecture

DATATIVE merges two complementary signals into a single ranked feed:

| Signal | Source | Strength | Limitation |
|--------|--------|----------|------------|
| **Automated flags** | SQL patterns on BigQuery | Objective, reproducible, runs at scale | Cannot assess sector context or intent |
| **Community votes** | ▲/▼ per IP, changeable | Captures journalistic leads and local knowledge | Subjective, can be gamed |

**Feed ranking:** score (▲ − ▼) DESC → flag_count DESC → seed list. Companies that are both statistically anomalous and community-flagged rise highest.

**Reason transparency:** every card in the feed shows the specific pattern chips (e.g. `Fracionamento · Sempre vence`) so investigators understand the signal before clicking through. No black boxes.

---

## Implementation Notes (post-build learnings)

### Batch scanner (`scripts/scan-all.ts`)
Rewrites all 8 patterns as `GROUP BY cnpj_basico` queries that process every company in a single pass. Results for 2023: **15,182 distinct CNPJs**, 34,819 contracts. Runtime: ~12s total (~8 BigQuery jobs) vs ~10 hours for a per-CNPJ loop. Run via:
```
GCP_PROJECT_ID=xxx bun run scripts/scan-all.ts --ano 2023 [--out results.json]
```

### `data_inicio_atividade` schema bug
Column does **not** exist in `br_me_cnpj.empresas`. It lives in `br_me_cnpj.estabelecimentos`. The newborn check (US7) requires joining both tables:
```sql
JOIN `br_me_cnpj.estabelecimentos` est
  ON est.cnpj_basico = e.cnpj_basico AND est.ano = @ano AND est.mes = 12
```

### Win rate distribution (US5)
The `licitacao_participante` table has a strongly bimodal win rate distribution: median ≈ 24%, but ~33% of companies with ≥10 competitive participations have a perfect 100% win rate. Q3 = 1.0 across all sample-size cuts. The dynamic Q3 threshold therefore flags only perfect-win companies (100%), which is stricter than the original hardcoded 60%.

### CNPJ matching pattern
All cross-dataset CNPJ joins use:
```sql
STARTS_WITH(REGEXP_REPLACE(col, r'\D', ''), @cnpj)   -- per-CNPJ queries
SUBSTR(REGEXP_REPLACE(col, r'\D', ''), 1, 8)          -- batch GROUP BY queries
```
Filter `LENGTH(REGEXP_REPLACE(col, r'\D', '')) = 14` to exclude CPFs (11 digits).
