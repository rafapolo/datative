# Risk-pattern analyses (rescued from `.specify/`)

`.specify/` described a BigQuery-era, live-per-CNPJ-query fraud-detection feature
(single-file `index.ts` monolith, file-cache, `Promise.allSettled` runner) that
predates the SSH/DuckDB migration and the later static-site rewrite — see
`CLAUDE.md`. None of that plumbing exists anymore, so the spec/constitution/task
docs were removed as stale.

The files in this directory keep the one part still worth having: the actual
**analytical definitions** of 8 procurement red flags — what each one detects,
which `basedosdados` tables/columns it needs, and the thresholds with their
legal/methodological justification. If this feature is ever revived, it would
need to be reimplemented as part of the offline static generator
(`scripts/generate-static-entities.ts`) rather than as live per-request queries,
and the SQL below (written for BigQuery) would need translating to the DuckDB
dialect used by `scripts/lib/duckdb-ssh.ts` (e.g. `COUNTIF` → `count(*) filter
(where ...)`, `DATE_DIFF`/`FORMAT_DATE` → DuckDB date functions).

| # | Pattern | Priority |
|---|---|---|
| 01 | Split Contracts Below Threshold | P1 |
| 02 | Contract Concentration | P1 |
| 03 | Inexigibility Recurrence | P1 |
| 04 | Single Bidder | P1 |
| 05 | Always Winner | P1 |
| 06 | Contract Amendment Inflation | P1 |
| 07 | Newborn Company | P2 |
| 08 | Sudden Contract Surge | P2 |

Shared data sources: `br_cgu_licitacao_contrato.{contrato_compra, licitacao,
licitacao_participante, contrato_termo_aditivo}`, `br_me_cnpj.empresas`.
