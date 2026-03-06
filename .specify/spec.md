# Datative — Suspicious Pattern Detection
## Feature Specification

---

## Overview

Given a company CNPJ, detect suspicious procurement patterns using data already available in `basedosdados.br_cgu_licitacao_contrato`. Results appear as risk flags on the company detail page. No external APIs required.

**In scope:** 3 patterns, all from a single BigQuery dataset.
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

---

### US2 — P1: Contract Concentration
**As** a researcher analyzing public procurement,
**I want** to see if a supplier captures an unusually high share of a single agency's budget in a given year,
**So that** I can identify possible favoritism or lack of competition.

**Acceptance scenarios:**
- Given a CNPJ holding ≥ 40% of an agency's total contract spend for the year, and the agency's total exceeds R$ 50.000 → flag shown with agency name, supplier share %, and both spend figures
- Given concentration below 40% in all agencies → no flag
- Given agency total below R$ 50.000 → excluded from analysis (avoid noise from micro-units)

---

### US3 — P1: Inexigibility Recurrence
**As** a transparency advocate reviewing procurement records,
**I want** to see how often a supplier wins non-competitive ("inexigibilidade") contracts from the same managing unit,
**So that** I can identify possible abuse of the sole-source exemption.

**Acceptance scenarios:**
- Given a CNPJ with ≥ 3 contracts where `fundamento_legal` contains "inexigibilidade" (case-insensitive), all from the same `id_unidade_gestora` → flag shown with unit name, count, total value, and date range
- Given inexigibilidade contracts spread across different units → no flag
- Given fewer than 3 occurrences per unit → no flag

---

## Data Source

All patterns use a single table:

| Table | Key Columns |
|---|---|
| `basedosdados.br_cgu_licitacao_contrato.contrato_compra` | `cpf_cnpj_contratado`, `id_orgao_superior`, `nome_orgao_superior`, `id_unidade_gestora`, `nome_unidade_gestora`, `objeto`, `fundamento_legal`, `modalidade`, `valor_inicial_compra`, `valor_final_compra`, `data_assinatura_contrato`, `ano`, `mes` |

Partition filters `ano` and `mes` are mandatory on every query.

---

## Success Criteria

- All 3 flags computed in parallel and cached per CNPJ for 5 days
- One failing pattern never blocks the others (use `Promise.allSettled`)
- Each flag shown in a "Alertas de Risco" section on the CNPJ detail page in Portuguese
- Zero full-table scans — every query filters by `ano`
- Thresholds are named constants, not magic numbers
