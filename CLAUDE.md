# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev             # development with hot-reload (static server, no SSH)
bun run start           # production
bun run build:graph     # rebuild public/graph.js from src/graph-client.ts
bun run generate:static # regenerate static/ from beelink (the only thing that talks to live data)
bun test                # run tests
bun run typecheck       # TypeScript check
```

No build step for the server — Bun JIT-compiles TypeScript directly. `public/graph.js` is the one artifact that needs an explicit rebuild.

## Repo layout

- `src/`: the running app — pure static file server + browser graph client. No SSH/DuckDB dependency.
- `scripts/`: offline generation only. `generate-static-entities.ts` (the top-N static precompute) and `benchmark.ts`; `lib/` holds the SSH/DuckDB query layer (`duckdb-ssh.ts`, `parquet-store.ts`, `cnpj-index.ts`, `cache.ts`) used only by these scripts, never imported by `src/`.
- `data/schemas.json`: table catalog (dataset.table → columns), read by `scripts/lib/parquet-store.ts`.
- `static/`: output of `generate-static-entities.ts` — `entities/<id>.json` (one `{nodes,links}` network per entity) + `entities-index.json` (manifest). This is what `src/index.ts` actually serves.
- `tests/`: `bun test` suite.
- `public/graph.js`: built browser bundle.

## Architecture

**The app is a fully static site.** `src/index.ts` (~350 lines) never queries live data — every route either serves a hardcoded HTML shell or reads a file under `static/`. All live querying happens offline, in `scripts/generate-static-entities.ts`, run manually/periodically against beelink.

**Request flow (live app):** `GET /` → render landing page from `static/entities-index.json` → click an entity → `GET /?cnpj=<id>` renders the graph shell → browser fetches `GET /api/graph/:id` → server does `readFileSync(static/entities/<id>.json)` and returns it verbatim. No route exists for an arbitrary/uncomputed CNPJ — `/api/graph/:id` 404s if the file isn't there.

**Key files:**
- `src/index.ts`: `Bun.serve` — landing page, graph page shell, `/api/graph/:id` (reads `static/`), favicon, `graph.js` static serving. That's the entire route table.
- `src/graph-client.ts` + `src/node-shape-programs.ts`: browser bundle (Sigma 3 + graphology) that renders whatever `{nodes,links}` JSON it's given. Rebuild with `bun run build:graph`.
- `src/cnpj-datasets.ts`: dataset configs (id, label, color, table, CNPJ/CPF columns, node type, `relatedLookups`) — 40+ entries. Shared by the client (node coloring/panel metadata via `window.__DATASET_COLORS`/`window.__DATASET_META`, both injected by `src/index.ts`) and by the generator (which tables to scan/join). No SSH dependency itself — pure config.

**Lookup panel is rebuilt from the precomputed JSON, not a live endpoint.** The old `/api/lookup/*` routes (per-dataset row tables + "+ Grafo" add-on-demand) are gone along with the SSH backend; `graph-client.ts`'s `init()` now groups `data.nodes` by `datasetId` and builds the panel's `LookupResult[]` directly from each node's stored `row` (the raw SQL row the generator selected), using `window.__DATASET_META` to also list zero-hit datasets. Clicking a dataset's hub node in the graph calls `focusLookupSection(datasetId)` to expand/scroll to that section — mirrors the old header-click accordion, just triggered from the graph side too. `expandNode`/`expandRelatedDatasets`/`fetchLookupDataset`/the "+ Grafo" button were deleted (dead code once there was no live endpoint left to call).

**Stack:** TypeScript (strict) · Bun runtime · Sigma 3 · server-rendered HTML shell + static JSON · Portuguese UI.

## Static top-N generator — `scripts/generate-static-entities.ts`

`bun run generate:static` (flags: `--top=100`, `--per-dataset-limit=15`, `--concurrency=6`, `--query-timeout-ms=60000`, `--max-distinct=1000000`, `--force`) is the **only** thing in this repo that talks to beelink. Two passes:

1. **Rank** — for every CNPJ/CPF column in every `CNPJ_DATASETS` entry, run `SELECT DISTINCT <entity-key>` against beelink and accumulate, per entity, the set of distinct tables it appears in at least once. Rank by that **count of distinct datasets** (breadth), not raw row/edge count — a mega-corp dominating one dataset (e.g. huge PGFN dívida ativa volume) ranks below an entity spread across several different datasets, which makes a more varied, more interesting graph even with fewer total edges. This was a deliberate correction mid-project away from raw-degree ranking.
2. **Build** — for each of the top N entities, fetch its base edges (empresa+sócios, or sócio→companies for a person) plus every cross-dataset hit, and write `static/entities/<id>.json` in the same `{nodes,links}` shape the old `/api/graph/:cnpj` endpoint used to return, plus a summary row in `static/entities-index.json`.

**Two cardinality traps hit and fixed while building this** (both apply to any future change to the ranking pass):
- **Exclude `br_me_cnpj.empresas`/`socios`/`estabelecimentos` from the ranking scan.** These are Receita's own full-history, undeduped base tables — every company appears in them trivially (no ranking signal), and each holds tens of millions of distinct values. They're still queried per-entity (cheap, targeted `WHERE cnpj_basico = X`) when building each top pick's actual network — just never full-scanned for ranking.
- **A `COUNT(DISTINCT ...)` pre-check gates the full `SELECT DISTINCT` fetch** (skip above `--max-distinct`, default 1,000,000). Found live: `br_pgfn_dividaativa.divida` (tens of millions of CPF/CNPJ debtors) hung the process for minutes even with a query timeout in place — **a timeout can't help here**, because the SSH child had already closed and returned its full payload; the hang was a single synchronous `JSON.parse` call blocking the whole (single-threaded) event loop, which a `setTimeout` can never preempt. The only fix is to not fetch the giant payload in the first place.

Entities in `--per-dataset-limit`-bounded cross-dataset lookups have no such cardinality problem (targeted point lookups, not full-table scans), so those still run against the big tables when building an individual entity's network.

## SSH DuckDB (offline generator only — `scripts/lib/`)

Queries run by piping SQL over SSH into the remote `duckdb` CLI (`scripts/lib/duckdb-ssh.ts`):

```
ssh -o ControlMaster=auto -o ControlPath=... -o ControlPersist=10m polo@beelink \
  '~/.local/bin/duckdb -readonly -json ~/rodado/basedosdados.duckdb'
```

This is the same DuckDB catalog the sibling `../rodado` project mirrors and extends (233 datasets / 1029 tables as of 2026-09) — `../rodado/docs/context/bridges.yaml` is the canonical source for which tables share a CNPJ/CPF join key (`bridges.yaml`'s `identity` category) and how dirty each one's column is (punctuation, missing leading zeros).

The default path used to point at `~/baseldosdados-data/basedosdados.duckdb`, a leftover from an old S3-era layout that no longer exists on beelink at all — every query was failing until this was repointed at `~/rodado/basedosdados.duckdb` (2026-09-05), the same file `../rodado` mirrors and queries.

SQL is written to the process's stdin (avoids shell-escaping the query) and the JSON array on stdout is parsed as the row set. `ControlMaster`/`ControlPersist` reuse one multiplexed SSH connection across all queries so only the remote `duckdb` process spawn is paid per query, not a fresh handshake.

**`-readonly` is required**: without it, each `duckdb <file>` invocation takes an exclusive lock on the database, so any two concurrent queries fail with a lock-conflict error.

Env overrides: `DUCKDB_SSH_USER`, `DUCKDB_SSH_HOST`, `DUCKDB_REMOTE_PATH`, `DUCKDB_REMOTE_BIN`, `DUCKDB_SSH_CONTROL_PATH`. Requires SSH key-based (`BatchMode`) access to the host — see `~/.ssh/config` for the `beelink` alias.

**br_me_cnpj join key:** `cnpj_basico` (8-digit root) links all tables:

| Table | Key columns |
|-------|------------|
| `empresas` | `cnpj_basico`, `razao_social`, `capital_social`, `porte`, `ano`, `mes` |
| `estabelecimentos` | `cnpj_basico`, `cnpj` (full 14-digit), `municipio`, `cnae_fiscal_principal`, `ano`, `mes` |
| `socios` | `cnpj_basico`, `nome`, `documento`, `ano`, `mes` |
| `simples` | `cnpj_basico`, `opcao_simples`, `opcao_mei` |

**Full CNPJ** = `cnpj_basico` (8) + `cnpj_ordem` (4) + `cnpj_dv` (2). For cross-dataset joins on `cpf_cnpj_*` columns, filter/branch by string length to distinguish CPFs (11 digits) from CNPJs (14 digits).

## Dirty CNPJ/CPF columns — `CnpjColumn.normalize`

Not every mirrored table stores CNPJ as a clean 14-digit string. `../rodado/docs/context/bridges.yaml` documents each source's format under its `identity` bridges; several need cleanup before a prefix match against `cnpjRoot` is correct:
- **Punctuated**: `"12.345.678/0001-90"` (PGFN dívida ativa, TCU inidôneos, CVM fundos)
- **Numeric, drops leading zeros**: `br_brasilio_holdings.holdings.cnpj`/`cnpj_socia` are `BIGINT`
- **Missing leading zeros in an otherwise-clean string**: some `br_mjsp_ckan.procon.NumeroCNPJ` rows

Set `normalize: true` on the `CnpjColumn` entry in `src/cnpj-datasets.ts` for these. `buildCnpjRawWhere` in `scripts/lib/cnpj-index.ts` then applies `regexp_replace(CAST(col AS VARCHAR), '[^0-9]', '', 'g')` before matching, and for `type: "full"` columns also `lpad(..., 14, '0')` — guarded by a `<> ''` check, since `lpad('', 14, '0')` is 14 zeros and would otherwise spuriously match CNPJ roots like Banco do Brasil's `"00000000"` against blank source values.

**`br_brasilio_holdings.holdings`** (company-owns-company edges, not a company-to-record join like the rest) is wired as two dataset entries reading the same table from opposite columns: `brasilio_participacoes` (searched company's `cnpj` column → shows who owns it) and `brasilio_subsidiarias` (searched company's `cnpj_socia` column → shows what it owns). Both use `nodeType: "empresa"` so ownership chains render with the same styling as the primary company node — note the resulting node id is the raw (possibly zero-stripped) numeric CNPJ, so it won't always dedupe against a same-company node reached elsewhere in the graph via a properly zero-padded id.

**Deferred:** `global_icij_offshoreleaks.entities` (ICIJ Offshore Leaks) is in `bridges.yaml`'s identity bridges but joins by fuzzy name match against `razao_social`, not a CNPJ column — it doesn't fit the `CnpjColumn`/prefix-match model and needs its own matching path. Not wired in yet.

When adding a table found only in `../rodado` (not yet in `data/schemas.json`), fetch its schema directly rather than trusting `information_schema.columns` (a query across all 233 datasets there currently throws `Invalid Input Error: Invalid unicode` on some unrelated table's metadata) — use `DESCRIBE SELECT * FROM dataset.table LIMIT 0;` per table instead, then append a matching entry to `data/schemas.json`'s `tables` map (`tableExists()`/`getTableColumns()` in `scripts/lib/parquet-store.ts` gate every query on that file).
