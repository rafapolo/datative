# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev    # development with hot-reload
bun run start  # production
bun test       # run tests
bun run typecheck  # TypeScript check
```

No build step — Bun JIT-compiles TypeScript directly.

## Architecture

**`index.ts`** (~1350 lines) — HTTP server, HTML rendering, all API handlers.

**Request flow:** `GET /` → parse CNPJ → `queryEmpresa()` + `querySocios()` → DuckDB S3 → render graph page

**Data source:** Parquet files in Hetzner S3 (`hel1`), read via DuckDB `httpfs`. Table catalog in `schemas.json`.

**Key files:**
- `index.ts`: HTTP server (`Bun.serve`), HTML renderers, query functions
- `parquet-store.ts`: DuckDB singleton + `queryParquetDataset()` async generator
- `cnpj-index.ts`: CNPJ-aware lookup (`queryByCnpj`) across any dataset
- `cnpj-datasets.ts`: dataset configs — 20+ datasets with CNPJ columns + graph node types
- `cache.ts`: in-memory cache
- `schemas.json`: table catalog — 533 datasets with S3 paths and column schemas
- `graph-client.ts`: browser bundle (Sigma 3 + graphology); rebuild with:
  `bun build graph-client.ts --outfile public/graph.js --target browser`

**Stack:** TypeScript (strict) · Bun runtime · DuckDB (`@duckdb/node-api`) · Sigma 3 · server-rendered HTML · Portuguese UI

## DuckDB / S3 Notes

DuckDB is initialized as a singleton with `httpfs` extension pointed at the Hetzner S3 endpoint. Config:

```
SET s3_endpoint='hel1.your-objectstorage.com';
SET s3_url_style='path';
SET s3_use_ssl=true;
```

**Known quirk:** `DuckDBInstance.create(":memory:", { threads: "4" })` — the `threads` override is required due to a DuckDB 1.5.x integer overflow bug on ARM when auto-detecting CPU count.

**br_me_cnpj join key:** `cnpj_basico` (8-digit root) links all tables:

| Table | Key columns | Partitioned by |
|-------|------------|----------------|
| `empresas` | `cnpj_basico`, `razao_social`, `capital_social`, `porte` | `ano`, `mes` |
| `estabelecimentos` | `cnpj_basico`, `cnpj` (full 14-digit), `municipio`, `cnae_fiscal_principal` | `ano`, `mes` |
| `socios` | `cnpj_basico`, `nome`, `documento` | `ano`, `mes` |
| `simples` | `cnpj_basico`, `opcao_pelo_simples`, `opcao_pelo_mei` | — |

`hive_partitioning=true` in `read_parquet()` enables automatic partition pruning via WHERE on `ano`/`mes`.

**Full CNPJ** = `cnpj_basico` (8) + `cnpj_ordem` (4) + `cnpj_dv` (2). For cross-dataset joins on `cpf_cnpj_*` columns, filter by string length to exclude CPFs (11 digits).

Key joinable datasets: `br_cgu_licitacao_contrato`, `br_cgu_cartao_pagamento`, `br_tse_eleicoes`, `br_me_exportadoras_importadoras`, `br_ms_cnes`, `br_rf_arrecadacao`.
