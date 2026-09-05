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

**Request flow:** `GET /` → parse CNPJ → `queryEmpresa()` + `querySocios()` → SSH DuckDB → render graph page

**Data source:** `basedosdados.duckdb` on a remote host (`polo@beelink`), queried by piping SQL over SSH into the remote `duckdb` CLI (`duckdb-ssh.ts`). This is the same DuckDB catalog the sibling `../rodado` project mirrors and extends (233 datasets / 1029 tables as of 2026-09) — `../rodado/docs/context/bridges.yaml` is the canonical source for which tables share a CNPJ/CPF join key (`bridges.yaml`'s `identity` category) and how dirty each one's column is (punctuation, missing leading zeros). Each dataset/table is a view in that catalog over local parquet files on beelink. Table/column catalog mirrored in `schemas.json`.

**Key files:**
- `index.ts`: HTTP server (`Bun.serve`), HTML renderers, query functions
- `duckdb-ssh.ts`: `execRemoteSQL()` — spawns `ssh` (multiplexed via `ControlMaster`) piping SQL into `duckdb -readonly -json` on beelink, parses JSON stdout
- `parquet-store.ts`: builds SQL (`SELECT`/`WHERE`/`LIMIT`) against `"dataset"."table"` views, executes via `duckdb-ssh.ts`; `queryParquetDataset()` async generator
- `cnpj-index.ts`: CNPJ-aware lookup (`queryByCnpj`) across any dataset
- `cnpj-datasets.ts`: dataset configs — 40+ datasets with CNPJ columns + graph node types
- `cache.ts`: disk-backed cache (`.cache/`, 5-day TTL) in front of every remote query
- `schemas.json`: table catalog — 544 tables with column schemas (path field is a legacy S3 remnant, unused for querying; entries added by hand for `../rodado`-only tables use a `rodado://` placeholder path)
- `graph-client.ts`: browser bundle (Sigma 3 + graphology); rebuild with:
  `bun build graph-client.ts --outfile public/graph.js --target browser`

**Stack:** TypeScript (strict) · Bun runtime · DuckDB via SSH CLI · Sigma 3 · server-rendered HTML · Portuguese UI

## SSH DuckDB Notes

Queries run by piping SQL over SSH into the remote `duckdb` CLI (see `duckdb-ssh.ts`):

```
ssh -o ControlMaster=auto -o ControlPath=... -o ControlPersist=10m polo@beelink \
  '~/.local/bin/duckdb -readonly -json ~/rodado/basedosdados.duckdb'
```

The default path used to point at `~/baseldosdados-data/basedosdados.duckdb`, a leftover from the S3-era layout that no longer exists on beelink at all — every query was failing until this was repointed at `~/rodado/basedosdados.duckdb` (2026-09-05), the same file `../rodado` mirrors and queries.

SQL is written to the process's stdin (avoids shell-escaping the query) and the JSON array on stdout is parsed as the row set. `ControlMaster`/`ControlPersist` reuse one multiplexed SSH connection across all queries so only the remote `duckdb` process spawn is paid per query, not a fresh handshake.

**`-readonly` is required**: without it, each `duckdb <file>` invocation takes an exclusive lock on `basedosdados.duckdb`, so any two concurrent queries (e.g. the `Promise.all` in `/api/graph/:cnpj`) fail with a lock-conflict error.

Env overrides: `DUCKDB_SSH_USER`, `DUCKDB_SSH_HOST`, `DUCKDB_REMOTE_PATH`, `DUCKDB_REMOTE_BIN`, `DUCKDB_SSH_CONTROL_PATH`. Requires SSH key-based (`BatchMode`) access to the host — see `~/.ssh/config` for the `beelink` alias.

**Clustered-by-cnpj layout (critical for lookup speed):** the `br_me_cnpj` tables are the point-lookup hot path (`WHERE cnpj_basico = X`). The original parquet was flat, unsorted files with one row group each, so a point lookup scanned ~87% of every file (empresas lookup ≈ 7.5s). They are now rewritten **partitioned by `substr(cnpj_basico,1,2)`** (100 buckets) under `<table>_part/cnpj_p=NN/`. Because each partition file holds a disjoint `cnpj_basico` range, DuckDB's row-group min/max stats prune a plain `WHERE cnpj_basico = X` down to the single matching file — **no `cnpj_p` predicate needed in queries** (empresas lookup ≈ 0.3s, ~25× faster).

The views hide the partition column so the app schema is unchanged:
```sql
CREATE OR REPLACE VIEW br_me_cnpj.empresas AS
  SELECT * EXCLUDE (cnpj_p)
  FROM read_parquet('.../br_me_cnpj/empresas_part/**/*.parquet', hive_partitioning=true);
```
To rebuild a table's clustered layout (out-of-core, no global sort — cheap partitioned write):
```sql
COPY (SELECT *, substr(cnpj_basico,1,2) AS cnpj_p FROM read_parquet('.../<table>/*.parquet'))
TO '.../<table>_part' (FORMAT parquet, PARTITION_BY (cnpj_p), COMPRESSION zstd, OVERWRITE_OR_IGNORE);
```
Use `COMPRESSION zstd` (default SNAPPY bloated empresas 46GB→67GB; ZSTD keeps size ~parity).

**`empresas` is deduped to one row per cnpj_basico.** The raw table was ~2.4B rows but only ~64M distinct cnpj (~38× monthly-snapshot duplication). It is now `empresas_dedup/` (partitioned by `cnpj_p`): one row per cnpj holding the **latest** snapshot's scalar fields (via `arg_max(col, ano*100+mes)`) plus an `anos BIGINT[]` array of every year the company appeared. 46G → ~1.2G; lookup ~0.006s, browse ~0.5s, `razao_social LIKE` search ~1.6s (all were 2–26s before). The view hides `cnpj_p`; the app sees the original columns + `anos`.

Because there's no per-snapshot `ano` column to filter anymore, the `/table` year browse uses `list_contains("anos", Y)` ("companies present in year Y", returning their latest row) — see `queryCompanies` in `index.ts`. `socios`/`estabelecimentos`/`simples` are **not** deduped (kept full-history clustered) — deduping `socios` would drop former partners from the graph, and `estabelecimentos` holds the `situacao_cadastral` status timeline.

The build hit OOM as a single `GROUP BY` over 2.4B rows (the `list(DISTINCT …)` aggregate can't spill); the working recipe is a **per-partition loop** (`~/dedup_empresas_loop.sh` on beelink) — dedup each `cnpj_p=NN` bucket separately (~24M rows, trivial memory), writing `empresas_dedup/cnpj_p=NN/data.parquet`.

**Graph hot path batches its two queries:** `/api/graph/:cnpj` uses `queryGraphData()`, which fetches empresa + socios in **one** remote duckdb process via `execRemoteSQLMulti()` (one SSH spawn / one DB open) instead of two, honoring the same per-entity caches.

**br_me_cnpj join key:** `cnpj_basico` (8-digit root) links all tables:

| Table | Key columns |
|-------|------------|
| `empresas` | `cnpj_basico`, `razao_social`, `capital_social`, `porte`, `ano`, `mes` |
| `estabelecimentos` | `cnpj_basico`, `cnpj` (full 14-digit), `municipio`, `cnae_fiscal_principal`, `ano`, `mes` |
| `socios` | `cnpj_basico`, `nome`, `documento`, `ano`, `mes` |
| `simples` | `cnpj_basico`, `opcao_simples`, `opcao_mei` |

**Full CNPJ** = `cnpj_basico` (8) + `cnpj_ordem` (4) + `cnpj_dv` (2). For cross-dataset joins on `cpf_cnpj_*` columns, filter by string length to exclude CPFs (11 digits).

Key joinable datasets: `br_cgu_licitacao_contrato`, `br_cgu_cartao_pagamento`, `br_tse_eleicoes`, `br_me_exportadoras_importadoras`, `br_ms_cnes`, `br_rf_arrecadacao`.

## Dirty CNPJ/CPF columns — `CnpjColumn.normalize`

Not every mirrored table stores CNPJ as a clean 14-digit string. `../rodado/docs/context/bridges.yaml` documents each source's format under its `identity` bridges; several need cleanup before a prefix match against `cnpjRoot` is correct:
- **Punctuated**: `"12.345.678/0001-90"` (PGFN dívida ativa, TCU inidôneos, CVM fundos)
- **Numeric, drops leading zeros**: `br_brasilio_holdings.holdings.cnpj`/`cnpj_socia` are `BIGINT`
- **Missing leading zeros in an otherwise-clean string**: some `br_mjsp_ckan.procon.NumeroCNPJ` rows

Set `normalize: true` on the `CnpjColumn` entry in `cnpj-datasets.ts` for these. `buildCnpjRawWhere` in `cnpj-index.ts` then applies `regexp_replace(CAST(col AS VARCHAR), '[^0-9]', '', 'g')` before matching, and for `type: "full"` columns also `lpad(..., 14, '0')` — guarded by a `<> ''` check, since `lpad('', 14, '0')` is 14 zeros and would otherwise spuriously match CNPJ roots like Banco do Brasil's `"00000000"` against blank source values (found live via smoke test against `br_cvm_fundos.fundos.CNPJ_ADMIN`, mostly blank).

**`br_brasilio_holdings.holdings`** (company-owns-company edges, not a company-to-record join like the rest) is wired as two dataset entries reading the same table from opposite columns: `brasilio_participacoes` (searched company's `cnpj` column → shows who owns it) and `brasilio_subsidiarias` (searched company's `cnpj_socia` column → shows what it owns). Both use `nodeType: "empresa"` so ownership chains render with the same styling as the primary company node — note the resulting node id is the raw (possibly zero-stripped) numeric CNPJ, so it won't always dedupe against a same-company node reached elsewhere in the graph via a properly zero-padded id.

**Deferred:** `global_icij_offshoreleaks.entities` (ICIJ Offshore Leaks) is in `bridges.yaml`'s identity bridges but joins by fuzzy name match against `razao_social`, not a CNPJ column — it doesn't fit the `CnpjColumn`/prefix-match model and needs its own matching path. Not wired in yet.

When adding a table found only in `../rodado` (not yet in `schemas.json`), fetch its schema directly rather than trusting `information_schema.columns` (a query across all 233 datasets there currently throws `Invalid Input Error: Invalid unicode` on some unrelated table's metadata) — use `DESCRIBE SELECT * FROM dataset.table LIMIT 0;` per table instead, then append a matching entry to `schemas.json`'s `tables` map (`tableExists()`/`getTableColumns()` in `parquet-store.ts` gate every query on that file).
