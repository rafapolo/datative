# Datative

Investigation recommendation system for Brazilian public procurement.

Datative detects statistically anomalous supplier behavior in federal procurement data and surfaces it in a community-ranked investigation feed, helping journalists, researchers, and civil society decide *where to look next*.

## What it does

1. **Detects** — runs 8 SQL-based risk patterns against CGU and Receita Federal data for every CNPJ with public contracts
2. **Explains** — shows specific pattern chips (e.g. `Fracionamento · Sempre vence`) on every feed card
3. **Ranks** — merges automated flag counts with community votes (▲ suspeito / ▼ sem evidência) into a prioritized queue
4. **Crowdsources** — investigators add text notes to any CNPJ, visible to all users
5. **Deep-dives** — corporate network graph (owners, subsidiaries), related datasets, full alert breakdown per CNPJ

## Risk Patterns

| ID | Pattern | Legal basis |
|----|---------|-------------|
| US1 | **Fracionamento** — ≥3 contracts below R$17.600 from same agency in same month, combined > threshold | Decreto 9.412/2018 |
| US2 | **Concentração** — supplier holds ≥40% of an agency's annual spend (agency > R$50k, supplier > R$10k) | CGU 2022 methodology |
| US3 | **Inexigibilidade recorrente** — ≥3 sole-source contracts (each ≥ R$1k) from same managing unit | TCU Acórdão 1.793/2011 |
| US4 | **Único participante** — ≥2 tenders where supplier was the only bidder and won | OCP 2024 Flag #1 |
| US5 | **Sempre vence** — ≥10 competitive bids (≥2 bidders) with win rate ≥ Q3 of distribution (~100%) | OCDE 2021 |
| US6 | **Superfaturamento** — contracts where `valor_final / valor_inicial ≥ 1.25` (legal ceiling) and original ≥ R$10k | Lei 14.133/2021 art.125 |
| US7 | **Empresa nova** — company won ≥ R$50k in contracts within 180 days of incorporation | CGU 2021 guide |
| US8 | **Crescimento explosivo** — ≥5× year-over-year contract revenue with ≥ R$1M in surge year (consecutive years only) | UNODC 2013 |

All patterns use `Promise.allSettled` — one failing pattern never blocks the others. Results cached 5 days per CNPJ in SQLite.

## Data Sources

All data from [Base dos Dados](https://basedosdados.org) BigQuery public project:

| Dataset | Used by |
|---------|---------|
| `br_cgu_licitacao_contrato.contrato_compra` | US1–3, US6–8 |
| `br_cgu_licitacao_contrato.licitacao_participante` | US4–5 |
| `br_cgu_licitacao_contrato.licitacao` | US4–5 |
| `br_cgu_licitacao_contrato.contrato_termo_aditivo` | US6 |
| `br_me_cnpj.empresas` | US7 |
| `br_me_cnpj.estabelecimentos` | US7 — `data_inicio_atividade` lives here |

## Stack

- **Runtime:** Bun + TypeScript (no build step for server)
- **Backend:** `Bun.serve` in `index.ts` (single-file monolith)
- **Database:** SQLite (`community.db`) — votes, notes, flag cache
- **Graph frontend:** Sigma + Graphology (`graph-client.ts` → `public/graph.js`)
- **Data:** Google BigQuery via `@google-cloud/bigquery`

## Setup

**Prerequisites:**

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
gcloud auth application-default login
# or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Run:**

```bash
bun install
bun run dev     # development with hot-reload
bun run start   # production
```

## Batch Scanners

### `scripts/scan-all.ts` — Full CNPJ population scan

Runs all 8 patterns as `GROUP BY cnpj_basico` queries — one BigQuery job per pattern, processing every company in a single pass. Results for 2023: ~15,000 CNPJs in ~12s (~8 BigQuery jobs).

```bash
GCP_PROJECT_ID=xxx bun run scripts/scan-all.ts --ano 2023 [--out results.json] [--import]
```

- `--out results.json` — write raw flag data to JSON
- `--import` — upsert flagged CNPJs into the community feed (`community.db`)

### `scripts/scan-suspicious.ts` — CSV list scanner

Runs all 8 patterns per-CNPJ for a curated list. Input: `cnpjs_interesse.csv` (columns: `cnpj`, `name`).

```bash
GCP_PROJECT_ID=xxx bun run scripts/scan-suspicious.ts
```

## API Routes

### Patterns

```
GET /api/patterns/:cnpj     → PatternResult (all 8 flags for one CNPJ, cached 5 days)
```

### Community feed

```
GET  /api/feed              → ranked company list (score DESC → flag_count DESC)
POST /api/vote/:cnpj        → { vote: "up"|"down" } — vote (one per IP, changeable)
GET  /api/votes/:cnpj       → { up, down, userVote }
POST /api/note/:cnpj        → { text } — add investigation note
GET  /api/notes/:cnpj       → note list
```

### Graph & lookup

```
GET /api/graph/:cnpj
GET /api/lookup/:cnpj?limit=10|20|30|40
GET /api/lookup/:cnpj/dataset/:datasetId
GET /api/lookup/related?datasetId=...&foreignKey=...&value=...
```

## File Structure

```
index.ts               server, HTML, patterns, feed API (monolith)
graph-client.ts        graph UI logic → compiled to public/graph.js
cnpj-datasets.ts       dataset configs and cross-CNPJ join definitions
scripts/
  scan-all.ts          batch scanner (GROUP BY, all CNPJs)
  scan-suspicious.ts   per-CNPJ scanner from CSV
docs/
  patterns-audit.md    deep audit: legal basis, thresholds, false positives, fixes
  basedosdados-schema.md
community.db           SQLite: votes, notes, cnpj_flags cache
```

## Audit Documentation

`docs/patterns-audit.md` contains the full investigation of all 8 patterns:
- Legal and methodological basis for each threshold
- False positive scenarios and mitigations
- Cross-implementation consistency (web UI vs batch vs CSV scanner)
- All bug fixes with rationale

## Docker / Deploy

```bash
docker compose up -d
```

Requires `GCP_PROJECT_ID` and `GCP_SERVICE_ACCOUNT_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`) in environment. See `docker-compose.yaml` and `haloy.yaml` for Traefik routing labels.

## License

Proprietary — all rights reserved.
