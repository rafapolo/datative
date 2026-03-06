# Datative — Constitution
Version: 1.0.0

## Core Principles

### 1. Data Integrity Before Features
All queries must use parameterized BigQuery statements. Never interpolate user input or external identifiers directly into SQL. Every column name used dynamically must be validated against an explicit allowlist.

### 2. Transparency Over Estimation
Never display synthetic, interpolated, or estimated data. If real data is unavailable (billing error, auth failure, missing table), display a clear error state rather than a partial result.

### 3. Partition Hygiene (NON-NEGOTIABLE)
All queries against partitioned BigQuery tables (`empresas`, `estabelecimentos`, `socios`, `contrato_compra`, `licitacao`) must filter by `ano` and `mes` to avoid full-table scans. Queries without partition filters must be explicitly justified in code comments.

### 4. Single-File Monolith
The application is intentionally a single-file TypeScript monolith (`index.ts`). New patterns are added as functions within that file. No new files, modules, or frameworks unless the file exceeds 2000 lines — at which point a single split is allowed.

### 5. No Build Step
Bun JIT-compiles TypeScript directly. No transpilation, bundling, or generated artifacts. No `dist/` or `build/` directories.

### 6. Portuguese-Language UI
All user-facing text, labels, and error messages must be in Portuguese. Column names and code identifiers remain in English or follow the original basedosdados naming convention.

### 7. Cache Before Re-Query
Any BigQuery result that requires cross-table joins (e.g., pattern detection on a CNPJ) must be cached using the existing file cache system. Cache TTL: 5 days. Pattern results are expensive — never re-run a pattern query for the same CNPJ within TTL.

## Additional Constraints

- External API calls (Portal da Transparência, PGFN) must have explicit timeouts and graceful degradation — a slow external API must not block the BigQuery result.
- Risk scores are informational only — never display them as legal determinations.
- All monetary values are displayed in BRL format (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).

## Ratified
2026-03-06
