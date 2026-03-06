# Datative — Suspicious Pattern Detection
## Feature Specification

---

## Overview

Datative currently identifies companies and their relationships via BigQuery/basedosdados. This feature adds **suspicious pattern detection**: given a company CNPJ, the system checks it against a set of known risk patterns derived from public procurement data, sanction registries, and compliance databases. Results appear as risk flags on the company detail page.

---

## User Scenarios

### US1 — P1: Contract Splitting Detection
**As** an investigative journalist viewing a company profile,
**I want** to see whether this supplier repeatedly wins small contracts from the same agency for similar purposes just below competitive bidding thresholds,
**So that** I can flag potential *fracionamento de licitação* (contract-splitting fraud).

**Acceptance scenarios:**
- Given a CNPJ with 4+ contracts from the same `id_orgao_superior`, same `objeto` pattern, all below R$ 17.600, in the same month → flag is shown with contract list and combined value
- Given a CNPJ with no such pattern → no flag shown
- Given a CNPJ with contracts spread across different agencies → no flag shown

---

### US2 — P1: Contract Concentration
**As** a researcher analyzing public procurement,
**I want** to see if a supplier captures an unusually high share of a single agency's budget in a given sector,
**So that** I can identify possible favoritism or lack of competition.

**Acceptance scenarios:**
- Given a CNPJ holding >40% of an agency's total contract spend → flag shown with agency name, supplier share %, and total agency spend
- Given multiple agencies where concentration never exceeds threshold → no flag

---

### US3 — P1: Inexigibility Recurrence
**As** a transparency advocate reviewing procurement records,
**I want** to see how often a supplier wins non-competitive ("inexigibilidade") contracts from the same agency for the same object,
**So that** I can identify possible abuse of the single-source exemption.

**Acceptance scenarios:**
- Given a CNPJ with 3+ inexigibilidade contracts from same `id_unidade_gestora` with same `objeto` → flag shown with count and total value
- Detection uses `fundamento_legal` field containing "inexigibilidade" (case-insensitive) in `br_cgu_licitacao_contrato.contrato_compra`

---

### US4 — P2: Amendment Beneficiary + Contracts
**As** an investigative journalist,
**I want** to know if a company simultaneously received legislative amendments (emendas parlamentares) AND won separate procurement contracts,
**So that** I can identify possible double-dipping or preferential treatment.

**Acceptance scenarios:**
- Given a CNPJ present in `br_cgu_emendas_parlamentares.microdados` AND with records in `br_cgu_licitacao_contrato.contrato_compra` → flag shown with amendment count, total amendment value (pago), and contract count
- Join key: `cpf_cnpj_contratado` (contracts) matched against the CNPJ column in emendas [NEEDS CLARIFICATION: emendas table links to CNPJ via beneficiary — confirm join column name]

---

### US5 — P2: Sanctioned Still Receiving
**As** a public accountability researcher,
**I want** to know if a company with an administrative conviction (proibição de contratar) continued winning contracts during the ban period,
**So that** I can surface enforcement failures.

**Acceptance scenarios:**
- Given a CNPJ in `br_cnj_improbidade_administrativa.condenacao` where `proibicao_contratar_poder_publico = true` AND has contracts with `data_assinatura_contrato` between `inicio_proibicao_contratar_poder_publico` and `fim_proibicao_contratar_poder_publico` → flag shown with ban dates and contract count/value
- Supplemental source: Portal da Transparência API (`/ceis` and `/cnep` endpoints) for broader sanction coverage — treated as enrichment, not required for flag

---

### US6 — P3: Debtor Contracts
**As** a fiscal auditor,
**I want** to know if a company with active federal tax debt (dívida ativa) continued winning public contracts while in default,
**So that** I can identify enforcement gaps.

**Acceptance scenarios:**
- Given a CNPJ found in PGFN open data (quarterly CSV, filtered by `SITUACAO = ATIVA`) AND with contracts in the same period → flag shown with debt origin and contract count
- Data source: PGFN CSV files (publicly available quarterly), cached locally after first download
- [NEEDS CLARIFICATION: confirm PGFN CSV column names for CNPJ, debt status, and inscription date]

---

### US7 — P3: Embargoed Receiving
**As** an environmental journalist,
**I want** to see if a company with an active IBAMA environmental embargo received public contracts or loans during the embargo period,
**So that** I can identify regulatory capture or enforcement failure.

**Acceptance scenarios:**
- Given a CNPJ in `br_ibama_autua_embargo` (basedosdados) with an active embargo AND with contracts during the embargo window → flag shown with embargo type, area, and contract value
- [NEEDS CLARIFICATION: confirm basedosdados access permissions for `br_ibama_autua_embargo` table; run schema dump to verify columns]

---

## Key Entities

| Entity | Source | Join Key |
|---|---|---|
| Company | `br_me_cnpj.empresas` | `cnpj_basico` |
| Contract | `br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado` (14-digit CNPJ) |
| Bidding | `br_cgu_licitacao_contrato.licitacao` | `id_licitacao` |
| Amendment | `br_cgu_emendas_parlamentares.microdados` | CNPJ beneficiary [TBD] |
| Improbidade | `br_cnj_improbidade_administrativa.condenacao` | `id_pessoa` / CNPJ |
| IBAMA Embargo | `br_ibama_autua_embargo` (basedosdados) | CNPJ |
| PGFN Debt | PGFN quarterly CSV (external) | CNPJ |
| CEIS/CNEP | Portal da Transparência API (external) | CNPJ |

---

## Success Criteria

- A user viewing a CNPJ detail page sees all applicable risk flags within the existing page load time budget (< 10s, given BigQuery latency)
- Each flag includes: pattern name (in Portuguese), key evidence (counts, values, dates), and the data source
- Flags are cached per CNPJ for 5 days — no re-query within TTL
- Zero false positives from hardcoded thresholds that ignore monetary correction — thresholds are configurable constants
- No external API failure (PGFN, Portal da Transparência) blocks the display of BigQuery-sourced flags
