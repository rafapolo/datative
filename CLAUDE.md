# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev    # development with hot-reload
bun run start  # production
```

**Prerequisites:**
```bash
export GCP_PROJECT_ID="your-gcp-project-id"
gcloud auth application-default login
```

No build step — Bun JIT-compiles TypeScript directly. No test or lint setup exists.

## Schema Dump

```bash
./scripts/dump-schema.sh   # crawls basedosdados BigQuery project, writes basedosdados-schema.json + .md
```

Requires `bq` CLI and Python 3. Skips datasets/tables with permission errors.

Output files `basedosdados-schema.json` and `basedosdados-schema.md` are the authoritative local reference for all accessible tables and columns in the `basedosdados` GCP project.

## Architecture

Single-file monolith: **`index.ts`** (~325 lines, no framework).

**Request flow:** `GET /` → parse query params → `queryCompanies()` → BigQuery → render HTML string → response

**Data source:** `basedosdados.br_me_cnpj` — Brazilian Federal Revenue (Receita Federal) dataset via Base dos Dados.

**Key sections in `index.ts`:**
- Lines 13–20: BigQuery client setup (uses `GCP_PROJECT_ID` + Application Default Credentials)
- Lines 41–86: `queryCompanies(params)` — builds parameterized SQL with optional `LIKE` search, year filter, pagination
- Lines 88–111: Error classification (`BillingError`, `AuthError`) from message content
- Lines 113–286: HTML rendering — server-side string templating, BRL formatting, XSS escaping
- Lines 289–325: `Bun.serve()` HTTP handler

**Current query (empresas only):**
```sql
SELECT ... FROM `basedosdados.br_me_cnpj.empresas`
WHERE ano = @ano [AND UPPER(razao_social) LIKE UPPER(@search)]
ORDER BY capital_social DESC NULLS LAST
LIMIT @limit OFFSET @offset
```

**Stack:** TypeScript (strict) · Bun runtime · `@google-cloud/bigquery` ^8.1.1 · server-rendered HTML · Portuguese-language UI

## BigQuery / basedosdados Notes

**Billing project:** configured via `gcloud` (set `GCP_PROJECT_ID` env var). Queries are billed to your project even though data lives in `basedosdados`.

**`bq` CLI quirk:** `bq ls basedosdados:` works (colon suffix, flags before argument); `bq ls --project_id=basedosdados` returns empty — no project-level list permission.

**br_me_cnpj join key:** `cnpj_basico` (8-digit root) links all 5 tables:

| Table | Key columns | Partitioned by |
|-------|------------|----------------|
| `empresas` | `cnpj_basico`, `razao_social`, `capital_social`, `porte` | `ano`, `mes` |
| `estabelecimentos` | `cnpj_basico`, `cnpj` (full 14-digit), `municipio`, `cnae_fiscal_principal` | `ano`, `mes` |
| `socios` | `cnpj_basico`, `nome_socio`, `cnpj_cpf_do_socio` | `ano`, `mes` |
| `simples` | `cnpj_basico`, `opcao_pelo_simples`, `opcao_pelo_mei` | — |
| `dicionario` | lookup/decode table | — |

Always filter `WHERE ano = <year> AND mes = <month>` on partitioned tables to avoid full scans.

**Full CNPJ** = `cnpj_basico` (8) + `cnpj_ordem` (4) + `cnpj_dv` (2). `estabelecimentos.cnpj` has the full 14-digit value. For cross-dataset joins using `cpf_cnpj_*` columns, filter `LENGTH(REGEXP_REPLACE(col, r'\D', '')) = 14` to exclude CPFs.

**41 tables** across `basedosdados` have CNPJ columns — see `basedosdados-schema.json` for the full list. Key joinable datasets: `br_cgu_licitacao_contrato`, `br_cgu_cartao_pagamento`, `br_tse_eleicoes`, `br_me_exportadoras_importadoras`, `br_ms_cnes`, `br_rf_arrecadacao`.
