# Rebuild Plan — Optimized `basedosdados.duckdb` layout on beelink

Runbook to reconstruct the fast query layout after data loss. Reproduces the
cnpj-clustered partitioning + `empresas` dedup that made lookups ~25× faster.

All paths are on beelink (`polo@beelink`), under `~/baseldosdados-data/`.
Run every `COPY`/`CREATE VIEW` inside the remote `duckdb` CLI:

```bash
ssh polo@beelink '~/.local/bin/duckdb ~/baseldosdados-data/basedosdados.duckdb'
```

> Use a **writable** (no `-readonly`) session for builds. The app itself always
> connects `-readonly`. Only one writer at a time — stop the app / any other
> writer before a rebuild.

---

## Overview of the target layout

| Table | Layout | Why |
|-------|--------|-----|
| `empresas` | `empresas_dedup/` — 1 row per `cnpj_basico`, partitioned by `cnpj_p` | 46G → ~1.2G; kills 38× monthly-snapshot duplication |
| `socios` | `socios_part/` — full history, partitioned by `cnpj_p` | keeps former partners; point-lookup pruning |
| `estabelecimentos` | `estabelecimentos_part/` — full history, partitioned by `cnpj_p` | keeps `situacao_cadastral` timeline |
| `simples` | `simples_part/` — full history, partitioned by `cnpj_p` | small; pruning |

`cnpj_p = substr(cnpj_basico,1,2)` → 100 disjoint buckets. Because each bucket
holds a disjoint `cnpj_basico` range, DuckDB row-group min/max stats prune a
plain `WHERE cnpj_basico = X` to the single matching file — **no `cnpj_p`
predicate needed in app queries.**

---

## Step 0 — Re-ingest the raw parquet (prerequisite)

The `br_me_cnpj` source is public (Receita Federal via basedosdados). Re-download
/ re-ingest the flat parquet first so each raw table lives at:

```
~/baseldosdados-data/br_me_cnpj/empresas/*.parquet
~/baseldosdados-data/br_me_cnpj/socios/*.parquet
~/baseldosdados-data/br_me_cnpj/estabelecimentos/*.parquet
~/baseldosdados-data/br_me_cnpj/simples/*.parquet
```

Everything below transforms these into the `_part` / `_dedup` layouts.

---

## Step 1 — Clustered partitioning for socios / estabelecimentos / simples

Cheap out-of-core partitioned write (no global sort). Run once per table.
**Always `COMPRESSION zstd`** — default SNAPPY bloated empresas 46G→67G and
regressed search 10s→26s.

```sql
-- socios
COPY (SELECT *, substr(cnpj_basico,1,2) AS cnpj_p
      FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/socios/*.parquet'))
TO '/home/polo/baseldosdados-data/br_me_cnpj/socios_part'
   (FORMAT parquet, PARTITION_BY (cnpj_p), COMPRESSION zstd, OVERWRITE_OR_IGNORE);

-- estabelecimentos
COPY (SELECT *, substr(cnpj_basico,1,2) AS cnpj_p
      FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/estabelecimentos/*.parquet'))
TO '/home/polo/baseldosdados-data/br_me_cnpj/estabelecimentos_part'
   (FORMAT parquet, PARTITION_BY (cnpj_p), COMPRESSION zstd, OVERWRITE_OR_IGNORE);

-- simples
COPY (SELECT *, substr(cnpj_basico,1,2) AS cnpj_p
      FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/simples/*.parquet'))
TO '/home/polo/baseldosdados-data/br_me_cnpj/simples_part'
   (FORMAT parquet, PARTITION_BY (cnpj_p), COMPRESSION zstd, OVERWRITE_OR_IGNORE);
```

---

## Step 2 — empresas: partition, then dedup (per-partition loop)

### 2a. Partition empresas (intermediate)

```sql
COPY (SELECT *, substr(cnpj_basico,1,2) AS cnpj_p
      FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/empresas/*.parquet'))
TO '/home/polo/baseldosdados-data/br_me_cnpj/empresas_part'
   (FORMAT parquet, PARTITION_BY (cnpj_p), COMPRESSION zstd, OVERWRITE_OR_IGNORE);
```

### 2b. Dedup to one row per cnpj_basico — **per-partition loop**

The raw table is ~2.4B rows but only ~64M distinct cnpj (~38× monthly-snapshot
duplication). Keep the **latest** snapshot's scalar fields via
`arg_max(col, ano*100+coalesce(mes,0))`, plus an `anos BIGINT[]` array of every
year the company appeared.

> **Do NOT do this as one global `GROUP BY` over 2.4B rows** — the
> `list(DISTINCT …)` aggregate can't spill and OOMs (killed even at 20GB).
> Process one `cnpj_p=NN` bucket at a time (~24M rows, trivial memory).

`~/dedup_empresas_loop.sh` on beelink:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=/home/polo/baseldosdados-data/br_me_cnpj
DB=/home/polo/baseldosdados-data/basedosdados.duckdb
DUCKDB=~/.local/bin/duckdb

for i in $(seq 0 99); do
  NN=$(printf "%02d" "$i")
  SRC="$BASE/empresas_part/cnpj_p=$NN"
  [ -d "$SRC" ] || continue
  echo "== bucket $NN =="
  "$DUCKDB" "$DB" <<SQL
COPY (
  SELECT
    cnpj_basico,
    arg_max(razao_social,            ano*100+coalesce(mes,0)) AS razao_social,
    arg_max(natureza_juridica,       ano*100+coalesce(mes,0)) AS natureza_juridica,
    arg_max(qualificacao_responsavel,ano*100+coalesce(mes,0)) AS qualificacao_responsavel,
    arg_max(capital_social,          ano*100+coalesce(mes,0)) AS capital_social,
    arg_max(porte,                   ano*100+coalesce(mes,0)) AS porte,
    arg_max(ente_federativo,         ano*100+coalesce(mes,0)) AS ente_federativo,
    arg_max(mes,                     ano*100+coalesce(mes,0)) AS mes,
    arg_max(data,                    ano*100+coalesce(mes,0)) AS data,
    max(ano)                                                  AS ano,
    list(DISTINCT ano ORDER BY ano)                           AS anos,
    '$NN' AS cnpj_p
  FROM read_parquet('$SRC/*.parquet', hive_partitioning=true)
  GROUP BY cnpj_basico
) TO '$BASE/empresas_dedup/cnpj_p=$NN/data.parquet'
   (FORMAT parquet, COMPRESSION zstd, OVERWRITE_OR_IGNORE);
SQL
done
echo "done"
```

Result: 46G → ~1.2G; lookup ~0.006s, browse ~0.5s, `razao_social LIKE` ~1.6s.

---

## Step 3 — Point the views at the new layouts

Views hide the partition column (`EXCLUDE (cnpj_p)`) so the app schema is
unchanged. `empresas` additionally exposes the new `anos` array.

```sql
CREATE OR REPLACE VIEW br_me_cnpj.empresas AS
  SELECT * EXCLUDE (cnpj_p)
  FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/empresas_dedup/**/*.parquet',
                    hive_partitioning=true);

CREATE OR REPLACE VIEW br_me_cnpj.socios AS
  SELECT * EXCLUDE (cnpj_p)
  FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/socios_part/**/*.parquet',
                    hive_partitioning=true);

CREATE OR REPLACE VIEW br_me_cnpj.estabelecimentos AS
  SELECT * EXCLUDE (cnpj_p)
  FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/estabelecimentos_part/**/*.parquet',
                    hive_partitioning=true);

CREATE OR REPLACE VIEW br_me_cnpj.simples AS
  SELECT * EXCLUDE (cnpj_p)
  FROM read_parquet('/home/polo/baseldosdados-data/br_me_cnpj/simples_part/**/*.parquet',
                    hive_partitioning=true);
```

---

## Step 4 — Verify (before deleting anything)

```sql
-- pruning + shape checks
SELECT cnpj_basico, razao_social, anos FROM br_me_cnpj.empresas WHERE cnpj_basico = '13347016';
SELECT count(*) FROM br_me_cnpj.socios WHERE cnpj_basico = '13347016';
SELECT count(*) FROM br_me_cnpj.estabelecimentos WHERE cnpj_basico = '13347016';

-- confirm row-group pruning actually fires (should scan ~1 file, not 100)
EXPLAIN ANALYZE SELECT * FROM br_me_cnpj.empresas WHERE cnpj_basico = '13347016';
```

From the app (local):
```bash
bun run dev   # then hit /graph?cnpj=13347016  → expect "FACEBOOK SERVICOS…", ~0.3–0.8s
```

App-side note: because dedup dropped the per-snapshot `ano` column, the `/table`
year browse filters with `list_contains("anos", Y)` (`queryCompanies` in
`index.ts`) — not `ano = Y`. Keep that.

---

## Step 5 — Reclaim disk (ONLY after Step 4 passes)

Delete **only** the raw + intermediate dirs that the views no longer read.
Explicit paths, no wildcards, one dataset:

```bash
# superseded by empresas_dedup
rm -rf /home/polo/baseldosdados-data/br_me_cnpj/empresas
rm -rf /home/polo/baseldosdados-data/br_me_cnpj/empresas_part
# superseded by *_part
rm -rf /home/polo/baseldosdados-data/br_me_cnpj/simples
rm -rf /home/polo/baseldosdados-data/br_me_cnpj/socios      # only after socios_part verified
rm -rf /home/polo/baseldosdados-data/br_me_cnpj/estabelecimentos  # only after estab_part verified
```

Do **not** touch `*_part` / `*_dedup` (the views depend on them) or any other
dataset directory. Re-verify Step 4 after reclaim.

---

## Gotchas (learned the hard way)

- **`COMPRESSION zstd`, never SNAPPY** — SNAPPY bloated empresas 46G→67G and slowed search.
- **Per-partition loop for dedup** — a single global `GROUP BY` with `list(DISTINCT)` OOMs on 2.4B rows.
- **`-readonly` for the app** — without it each `duckdb <file>` takes an exclusive lock; concurrent queries (graph `Promise.all`) fail with a lock conflict.
- **No `cnpj_p` predicate in queries** — pruning works on plain `WHERE cnpj_basico = X` via disjoint-range stats.
- **Only one writer at a time** — stop the app and any other agent/writer before running builds; reclaim only after verifying, and only the exact superseded paths.
