#!/usr/bin/env bun
/**
 * Ranks entity instances (companies by cnpj_basico, people by CPF) by how many
 * DISTINCT CNPJ/CPF-joinable tables each one appears in at least once — breadth
 * across dataset types, not raw row/edge count. A mega-corp with huge volume in
 * a single dataset (e.g. PGFN dívida ativa) ranks below an entity that shows up
 * across several different datasets (CGU contracts + TSE donations + TCU
 * sanctions + ...), because the latter makes a more varied, more interesting
 * static graph even with fewer total edges.
 *
 * Ranked SEPARATELY per entity type (empresa vs pessoa) and top N taken from
 * each — a mixed top-N would be almost entirely companies, since a person
 * rarely accumulates the same dataset breadth as a bank. --top=50 therefore
 * means "top 50 companies AND top 50 people", not "top 50 total".
 *
 * For each entity, precomputes its full network (person-centered for pessoa,
 * company-centered for empresa) in the same {nodes, links} shape
 * /api/graph/:cnpj used to return, and writes:
 *   static/entities/<id>.json      — one network per entity
 *   static/entities-index.json     — [{ id, type, label, datasetCount, path }]
 *
 * Data comes from the same beelink DuckDB catalog the live app queries, piped
 * over SSH (duckdb-ssh.ts) — this script just runs the ranking + precompute
 * offline instead of doing it per-request.
 *
 * Usage:
 *   bun run scripts/generate-static-entities.ts [--top=50] [--per-dataset-limit=15] [--concurrency=6] [--force]
 *   bun run scripts/generate-static-entities.ts --ids=00000000,60701190   # rebuild only these empresas
 *   bun run scripts/generate-static-entities.ts --ids=48391060 --add-to-index   # ...and upsert them into the index
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { execRemoteSQL } from "./lib/duckdb-ssh";
import { socioNodeId, isMaskedDocument } from "./lib/cnpj-index";
import { hashCpf, isPersonalDocColumn, sanitizeAnyValue, sanitizeCpfValue, sanitizeRow } from "./lib/cpf-privacy";
import { CNPJ_DATASETS, type CnpjColumn, type CnpjDatasetEntry } from "../src/cnpj-datasets";

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...args);
}

// --- CLI args ---
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const TOP_N = parseInt(args.top ?? "50", 10);
// Caps how many of a dataset's matching rows render as graph nodes/edges —
// keeps the visualization from turning into a starburst on a dataset with
// hundreds of hits. The lookup panel's row table is NOT capped by this: it
// fetches up to PANEL_LIMIT rows regardless, so the table always reflects the
// true hit count even when the graph only shows a subset.
const PER_DATASET_LIMIT = parseInt(args["per-dataset-limit"] ?? "15", 10);
// SQL fetch limit for the panel's row table. Generous but not unbounded —
// a handful of high-volume datasets (e.g. TSE despesas_candidato) could
// plausibly return thousands of rows for one heavily-referenced CNPJ, and an
// actually-unbounded fetch risks the same cardinality/JSON-size problem the
// ranking pass's COUNT(DISTINCT) guard exists for (see MAX_DISTINCT below).
const PANEL_LIMIT = parseInt(args["panel-limit"] ?? "500", 10);
const CONCURRENCY = parseInt(args.concurrency ?? "6", 10);
const FORCE = args.force === "true";

const OUT_DIR = resolve(import.meta.dir, "../static");
const ENTITIES_DIR = resolve(OUT_DIR, "entities");
mkdirSync(ENTITIES_DIR, { recursive: true });

type EntityType = "empresa" | "pessoa";

interface EntitySource {
  datasetId: string; // CNPJ_DATASETS entry id, for graph-building later
  tableKey: string; // "dataset.table" — the breadth-counting unit
  column: CnpjColumn;
}

// Every CNPJ/CPF column of every wired external dataset. Deliberately excludes
// br_me_cnpj.empresas/socios/estabelecimentos: those are Receita's own base
// tables (full, undeduped history — hundreds of millions of rows), which
// (a) every company appears in trivially, so they carry no ranking signal for
// "breadth across joinable datasets", and (b) a DISTINCT scan over them returns
// tens of millions of values, far too large to ship over SSH as JSON just to
// count breadth. socios is still queried per-entity (a targeted single-cnpj
// lookup, cheap) when building each top entity's actual network below.
const BASE_RECEITA_TABLES = new Set(["br_me_cnpj.empresas", "br_me_cnpj.socios", "br_me_cnpj.estabelecimentos", "br_me_cnpj.simples"]);

function collectSources(): EntitySource[] {
  const sources: EntitySource[] = [];
  for (const ds of CNPJ_DATASETS) {
    const parts = ds.table.split(".");
    const tableKey = `${parts[1]}.${parts[2]}`;
    if (BASE_RECEITA_TABLES.has(tableKey)) continue;
    for (const col of ds.cnpjColumns) {
      sources.push({ datasetId: ds.id, tableKey, column: col });
    }
  }
  return sources;
}

// Digits-only form of a document column. A normalize column may also arrive
// float-shaped ("4834065000193.0" — INEP, or any DOUBLE cast to VARCHAR), so
// the trailing ".0" goes first or it would become a 15th digit.
function docDigitsExpr(col: CnpjColumn): string {
  const raw = `CAST("${col.name}" AS VARCHAR)`;
  const unfloated = col.normalize ? `regexp_replace(${raw}, '\\.0+$', '')` : raw;
  return `regexp_replace(${unfloated}, '[^0-9]', '', 'g')`;
}

// Digits-only extraction, then bucket into an 8-digit company root or an
// 11-digit CPF depending on column type/length. Masked CPFs ("***123456**")
// strip down to 6 digits and are naturally dropped by the length check.
function entityKeyExpr(col: CnpjColumn): { keyExpr: string; typeExpr: string } {
  const digits = docDigitsExpr(col);
  const guarded = (expr: string) => (col.where ? `CASE WHEN ${col.where} THEN ${expr} ELSE NULL END` : expr);
  if (col.type === "basico") {
    return { keyExpr: guarded(`NULLIF(${digits}, '')`), typeExpr: `'empresa'` };
  }
  if (col.type === "full") {
    const padded = col.normalize ? `lpad(${digits}, 14, '0')` : digits;
    const guard = col.normalize ? `ltrim(${digits}, '0') <> ''` : `length(${digits}) = 14`;
    return {
      keyExpr: guarded(`CASE WHEN ${guard} THEN substr(${padded}, 1, 8) ELSE NULL END`),
      typeExpr: `'empresa'`,
    };
  }
  return {
    keyExpr: guarded(`CASE WHEN length(${digits}) = 14 THEN substr(${digits}, 1, 8)
                    WHEN length(${digits}) = 11 THEN ${digits}
                    ELSE NULL END`),
    typeExpr: guarded(`CASE WHEN length(${digits}) = 14 THEN 'empresa'
                     WHEN length(${digits}) = 11 THEN 'pessoa'
                     ELSE NULL END`),
  };
}

function buildDistinctSQL(src: EntitySource): string {
  const { keyExpr, typeExpr } = entityKeyExpr(src.column);
  const [dataset, table] = src.tableKey.split(".");
  return `SELECT DISTINCT ${keyExpr} AS entity_id, ${typeExpr} AS entity_type
    FROM "${dataset}"."${table}"
    WHERE ${keyExpr} IS NOT NULL;`;
}

function buildCountDistinctSQL(src: EntitySource): string {
  const { keyExpr } = entityKeyExpr(src.column);
  const [dataset, table] = src.tableKey.split(".");
  return `SELECT COUNT(DISTINCT ${keyExpr}) AS n FROM "${dataset}"."${table}";`;
}

// A JSON payload of N distinct values is transferred over SSH AND parsed by a
// single synchronous JSON.parse call — a timeout can't preempt that (JS is
// single-threaded), so a high-cardinality table (e.g. PGFN dívida ativa, tens
// of millions of distinct debtors) hangs the whole process for minutes with no
// way to cancel it. Check cardinality cheaply first and skip the full fetch
// above this ceiling instead of risking that hang.
const MAX_DISTINCT_VALUES = parseInt(args["max-distinct"] ?? "1000000", 10);

const QUERY_TIMEOUT_MS = parseInt(args["query-timeout-ms"] ?? "60000", 10);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolvePromise(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function pMap<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// --- Pass 1: rank entities by distinct-table breadth ---

interface EntityRank {
  id: string;
  type: EntityType;
  datasetCount: number;
  tables: Set<string>;
}

async function rankEntities(): Promise<EntityRank[]> {
  const sources = collectSources();
  const byEntity = new Map<string, EntityRank>();

  log("ranking pass", { sources: sources.length, concurrency: CONCURRENCY });
  await pMap(sources, CONCURRENCY, async (src, i) => {
    const label = `${src.tableKey}.${src.column.name}`;
    const t0 = Date.now();
    try {
      const countRows = await withTimeout(execRemoteSQL(buildCountDistinctSQL(src)), QUERY_TIMEOUT_MS, `count ${label}`);
      const distinctCount = Number(countRows[0]?.n ?? 0);
      if (distinctCount > MAX_DISTINCT_VALUES) {
        log(`[${i + 1}/${sources.length}] SKIP (too high cardinality)`, label, { distinctCount });
        return;
      }
    } catch (err) {
      log(`[${i + 1}/${sources.length}] FAILED (count)`, label, String(err).slice(0, 200));
      return;
    }
    const sql = buildDistinctSQL(src);
    try {
      const rows = await withTimeout(execRemoteSQL(sql), QUERY_TIMEOUT_MS, label);
      for (const row of rows) {
        const id = String(row.entity_id ?? "");
        const type = row.entity_type as EntityType | null;
        if (!id || !type) continue;
        const key = `${type}:${id}`;
        let rank = byEntity.get(key);
        if (!rank) {
          rank = { id, type, datasetCount: 0, tables: new Set() };
          byEntity.set(key, rank);
        }
        if (!rank.tables.has(src.tableKey)) {
          rank.tables.add(src.tableKey);
          rank.datasetCount++;
        }
      }
      log(`[${i + 1}/${sources.length}]`, src.tableKey, src.column.name, { rows: rows.length, ms: Date.now() - t0 });
    } catch (err) {
      log(`[${i + 1}/${sources.length}] FAILED`, src.tableKey, src.column.name, String(err).slice(0, 200));
    }
  });

  return [...byEntity.values()].sort((a, b) => b.datasetCount - a.datasetCount);
}

// --- Pass 2: precompute each top entity's network ---

interface GraphNode {
  id: string;
  label: string;
  type: string;
  datasetId?: string;
  datasetLabel?: string;
  row?: Record<string, unknown>;
  // false for rows beyond PER_DATASET_LIMIT within a dataset — still carries
  // `row` for the client's lookup panel table, but the client must not add it
  // as a visual graph node/edge. Omitted (implicitly true) for every other node.
  inGraph?: boolean;
}
interface GraphLink { source: string; target: string }
interface EntityNetwork { nodes: GraphNode[]; links: GraphLink[] }

function inferNodeFields(ds: CnpjDatasetEntry): { idField: string; labelField: string } {
  return {
    idField: ds.nodeIdField ?? ds.cnpjColumns[0]?.name ?? ds.displayFields[0],
    labelField: ds.nodeLabelField ?? ds.displayFields[0],
  };
}

// Builds a cross-dataset hit's node id/label, masking the underlying value
// only when the source field is itself a known document column (never a
// blanket scan — see isPersonalDocColumn) so unrelated 11-digit ids/free text
// in other fields are left untouched.
function safeNodeIdAndLabel(
  ds: CnpjDatasetEntry,
  row: Record<string, unknown>,
  idField: string,
  labelField: string,
  fallbackIndex: number,
): { nodeId: string; nodeLabel: string } {
  const docColumns = ds.cnpjColumns.map((c) => c.name);
  const rawId = row[idField] ?? fallbackIndex;
  const idValue = isPersonalDocColumn(idField, docColumns) ? sanitizeCpfValue(rawId) : sanitizeAnyValue(rawId, idField);
  const nodeId = `${ds.id}:${idValue}`;
  const rawLabel = row[labelField];
  const labelValue = isPersonalDocColumn(labelField, docColumns) ? sanitizeCpfValue(rawLabel) : sanitizeAnyValue(rawLabel, labelField);
  const nodeLabel = String(labelValue ?? nodeId);
  return { nodeId, nodeLabel };
}

// --- Batched build: one scan per table for ALL target entities ---
//
// Building entity by entity meant targets × datasets queries (156 × 117 ≈ 18k),
// each one a full scan of its table to find a single company — hours of
// beelink time, and timeouts on the big tables under that load. Instead every
// table is scanned once with the whole target set in an IN list, the entity
// key computed by the same entityKeyExpr the ranking pass uses, and capped at
// PANEL_LIMIT rows per entity with a window function. Rows are then dealt out
// to each entity's network in JS. The output JSON shape is unchanged.

interface BuildTarget {
  type: EntityType;
  rawId: string; // cnpj_basico, or the raw CPF (used only to query beelink)
  publicId: string; // cnpj_basico, or hashCpf(cpf)
}

// A full-table scan for every entity at once can legitimately take minutes on
// the biggest tables — far past the per-query QUERY_TIMEOUT_MS of the ranking.
const BATCH_TIMEOUT_MS = parseInt(args["batch-timeout-ms"] ?? "1800000", 10);

const sqlList = (ids: Iterable<string>) => [...ids].map((id) => `'${id}'`).join(",");

// Clean basico columns (checked 2026-10-11: 8-digit VARCHAR everywhere they're
// wired) are compared raw so DuckDB can prune parquet row groups by min/max.
function batchKeyExpr(col: CnpjColumn): string {
  if (col.type === "basico" && !col.normalize) {
    return col.where ? `CASE WHEN ${col.where} THEN "${col.name}" ELSE NULL END` : `"${col.name}"`;
  }
  return entityKeyExpr(col).keyExpr;
}

// Keys never collide across entity types: empresa keys are 8-digit roots,
// pessoa keys 11-digit CPFs, and only mixed columns can yield the latter.
function datasetBatchSQL(ds: CnpjDatasetEntry, columns: string[], keys: string[], windowed = true): string {
  const [, dataset, table] = ds.table.split(".");
  const select = columns.map((c) => `"${c}"`).join(", ");
  // UNION (not ALL): a row matched through two of its columns for the same
  // entity (e.g. CNPJ_FUNDO and CNPJ_ADMIN both its own) is still one row,
  // as it was with the old per-entity `col1 OR col2` filter.
  const parts = ds.cnpjColumns.map((col) => {
    const key = batchKeyExpr(col);
    return `SELECT ${select}, ${key} AS __key FROM "${dataset}"."${table}" WHERE ${key} IN (${sqlList(keys)})`;
  });
  const union = parts.join("\nUNION\n");
  if (!windowed) return `${union};`;
  return `SELECT * EXCLUDE (__rn) FROM (
    SELECT *, row_number() OVER (PARTITION BY __key) AS __rn FROM (${union})
  ) WHERE __rn <= ${PANEL_LIMIT};`;
}

// Batched scans are heavy, so fewer run at once than the ranking's CONCURRENCY.
const BATCH_CONCURRENCY = parseInt(args["batch-concurrency"] ?? "3", 10);

// Under memory pressure (beelink is shared — another DuckDB there held 9 GB
// on 2026-10-11) remote duckdb fails intermittently on queries that succeed
// when retried alone: "Out of buffer", "ZSTD Decompression failure" on a
// parquet file that reads fine, "free(): invalid size".
const TRANSIENT = /Out of buffer|Decompression failure|free\(\)|invalid size|Out of Memory|exited 255/i;

async function timedBatch(label: string, sql: string): Promise<Record<string, unknown>[]> {
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    try {
      const rows = await withTimeout(execRemoteSQL(sql), BATCH_TIMEOUT_MS, label);
      log("  batch", label, { rows: rows.length, ms: Date.now() - t0, ...(attempt > 1 ? { attempt } : {}) });
      return rows;
    } catch (err) {
      if (attempt >= 4 || !TRANSIENT.test(String(err))) throw err;
      log("  transient failure, retrying", label, { attempt, err: String(err).slice(0, 120) });
      await new Promise((r) => setTimeout(r, 15000 * attempt));
    }
  }
}

function groupBy(rows: Record<string, unknown>[], field: string): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = String(r[field]);
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push(r);
  }
  return out;
}

async function buildNetworks(targets: BuildTarget[]): Promise<Map<string, { label: string; network: EntityNetwork }>> {
  const roots = targets.filter((t) => t.type === "empresa").map((t) => t.rawId);
  const cpfs = targets.filter((t) => t.type === "pessoa").map((t) => t.rawId);

  // Base Receita tables: sócios of every empresa, companies of every pessoa
  // (by CPF — usually masked in socios, so often empty), then razão social
  // for every company id either side needs.
  const [sociosByEmpresa, sociosByPessoa] = await Promise.all([
    roots.length
      ? timedBatch("socios por empresa", `SELECT cnpj_basico, nome, documento FROM (
          SELECT cnpj_basico, nome, documento, row_number() OVER (PARTITION BY cnpj_basico) AS rn
          FROM "br_me_cnpj"."socios" WHERE "cnpj_basico" IN (${sqlList(roots)})
        ) WHERE rn <= ${PER_DATASET_LIMIT};`)
      : Promise.resolve([]),
    cpfs.length
      ? timedBatch("socios por cpf", `SELECT documento, nome, cnpj_basico FROM (
          SELECT documento, nome, cnpj_basico, row_number() OVER (PARTITION BY documento) AS rn
          FROM "br_me_cnpj"."socios" WHERE "documento" IN (${sqlList(cpfs)})
        ) WHERE rn <= ${PER_DATASET_LIMIT};`)
      : Promise.resolve([]),
  ]);
  const companyIds = new Set([...roots, ...sociosByPessoa.map((r) => String(r.cnpj_basico))]);
  const empresaRows = companyIds.size
    ? await timedBatch("razao social", `SELECT cnpj_basico, razao_social
        FROM "br_me_cnpj"."empresas" WHERE "cnpj_basico" IN (${sqlList(companyIds)});`)
    : [];
  // Deduped here, not with GROUP BY/any_value: aggregating over empresas
  // dies on beelink with DuckDB "Out of buffer" (2026-10-11); the plain
  // filtered select doesn't. empresas is full history, so a few dozen
  // rows per company — first non-empty razão social wins.
  const razaoSocial = new Map<string, string>();
  for (const r of empresaRows) {
    const id = String(r.cnpj_basico);
    if (!razaoSocial.has(id) && r.razao_social) razaoSocial.set(id, String(r.razao_social));
  }
  const sociosOf = groupBy(sociosByEmpresa, "cnpj_basico");
  const empresasOf = groupBy(sociosByPessoa, "documento");

  // Cross-dataset hits: one batched query per dataset.
  const hits = new Map<string, Map<string, Record<string, unknown>[]>>(); // datasetId → key → rows
  await pMap(CNPJ_DATASETS, BATCH_CONCURRENCY, async (ds) => {
    const hasMixed = ds.cnpjColumns.some((c) => c.type === "mixed");
    const keys = hasMixed ? [...roots, ...cpfs] : roots;
    if (!keys.length) return;
    const { idField, labelField } = inferNodeFields(ds);
    const columns = [...new Set([...ds.displayFields, idField, labelField, ...ds.cnpjColumns.map((c) => c.name)])];
    try {
      const rows = await timedBatch(ds.id, datasetBatchSQL(ds, columns, keys));
      hits.set(ds.id, groupBy(rows, "__key"));
    } catch (err) {
      // Same "Out of buffer" risk as the empresas aggregate: retry without the
      // window function and cap per entity here instead.
      log("  batch failed, retrying without window", ds.id, String(err).slice(0, 200));
      try {
        const rows = await timedBatch(`${ds.id} (sem janela)`, datasetBatchSQL(ds, columns, keys, false));
        const grouped = groupBy(rows, "__key");
        for (const [k, list] of grouped) grouped.set(k, list.slice(0, PANEL_LIMIT));
        hits.set(ds.id, grouped);
      } catch (err2) {
        log("  cross-dataset batch FAILED", ds.id, String(err2).slice(0, 200));
      }
    }
  });

  const out = new Map<string, { label: string; network: EntityNetwork }>();
  for (const t of targets) {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const seen = new Set<string>();
    const addNode = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

    let label: string;
    let rootNode: GraphNode;
    if (t.type === "empresa") {
      label = razaoSocial.get(t.rawId) ?? t.rawId;
      rootNode = { id: t.publicId, label, type: "empresa" };
      addNode(rootNode);
      for (const s of sociosOf.get(t.rawId) ?? []) {
        const nome = String(s.nome ?? "");
        const documento = s.documento != null ? String(s.documento) : null;
        const socioId = socioNodeId(documento, t.rawId, nome);
        addNode({ id: socioId, label: nome || socioId, type: "socio" });
        links.push({ source: t.publicId, target: socioId });
      }
    } else {
      const socioRows = empresasOf.get(t.rawId) ?? [];
      label = String(socioRows[0]?.nome ?? sanitizeCpfValue(t.rawId));
      rootNode = { id: t.publicId, label, type: "socio" };
      addNode(rootNode);
      for (const cnpjBasico of new Set(socioRows.map((r) => String(r.cnpj_basico)))) {
        addNode({ id: cnpjBasico, label: razaoSocial.get(cnpjBasico) ?? cnpjBasico, type: "empresa" });
        links.push({ source: t.publicId, target: cnpjBasico });
      }
    }

    for (const ds of CNPJ_DATASETS) {
      const rows = hits.get(ds.id)?.get(t.rawId);
      if (!rows) continue;
      const { idField, labelField } = inferNodeFields(ds);
      const docColumns = ds.cnpjColumns.map((c) => c.name);
      rows.forEach((raw, i) => {
        const { __key: _key, ...row } = raw;
        const { nodeId, nodeLabel } = safeNodeIdAndLabel(ds, row, idField, labelField, i);
        const inGraph = i < PER_DATASET_LIMIT;
        addNode({ id: nodeId, label: nodeLabel, type: ds.nodeType ?? "registro", datasetId: ds.id, datasetLabel: ds.label, row: sanitizeRow(row, docColumns), ...(inGraph ? {} : { inGraph: false }) });
        if (inGraph) links.push({ source: t.publicId, target: nodeId });
      });
    }

    // br_me_cnpj.socios masks most CPFs for privacy, so a pessoa often has no
    // socios hit even when it was ranked via an unmasked mixed column
    // elsewhere (CGU/TSE/etc). Fall back to the first cross-dataset hit's own
    // name field rather than showing the raw CPF digits as the entity's label.
    if (t.type === "pessoa" && label === sanitizeCpfValue(t.rawId)) {
      const preferred = ["nome_favorecido", "nome_contratado", "nome_fornecedor", "nome_doador", "nome", "razao_social", "nome_razao_social", "nome_fantasia", "NOME", "nome_sancionado", "nome_infrator"];
      outer: for (const n of nodes) {
        if (!n.row) continue;
        for (const key of preferred) {
          const value = n.row[key];
          if (value) { label = String(value); break outer; }
        }
      }
      rootNode.label = label;
    }
    out.set(t.publicId, { label, network: { nodes, links } });
  }
  return out;
}

// --- Main ---

interface IndexEntry {
  id: string;
  type: EntityType;
  label: string;
  datasetCount: number;
  path: string;
}

// --ids=<cnpj_basico>,... rebuilds just those empresa entities' files, skipping
// the ranking pass and leaving entities-index.json alone — for timing or
// spot-checking a dataset change before a full run. Pessoa entities can't be
// targeted this way: their public id is a CPF hash, and the raw CPF needed to
// query beelink only comes out of the ranking pass.
// With --add-to-index, the rebuilt empresas are also upserted into
// entities-index.json (every other row kept as is) — for publishing a
// specific entity on request, outside the top-N. datasetCount there is the
// number of distinct datasets with hits in the built network, since no
// ranking pass ran to count tables.
async function buildOnly(ids: string[], addToIndex: boolean) {
  const t0 = Date.now();
  const built = await buildNetworks(ids.map((id) => ({ type: "empresa" as const, rawId: id, publicId: id })));
  const entries: IndexEntry[] = [];
  for (const [id, { label, network }] of built) {
    writeFileSync(resolve(ENTITIES_DIR, `${id}.json`), JSON.stringify(network));
    const datasets = new Set(network.nodes.map((n) => n.datasetId).filter(Boolean));
    log("built", id, label, { nodes: network.nodes.length, datasets: datasets.size });
    entries.push({ id, type: "empresa", label, datasetCount: datasets.size, path: `entities/${id}.json` });
  }
  if (addToIndex) {
    const indexPath = resolve(OUT_DIR, "entities-index.json");
    const previous: IndexEntry[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
    const builtIds = new Set(entries.map((e) => e.id));
    const index = [...previous.filter((e) => !builtIds.has(e.id)), ...entries];
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    log("index updated", { added: entries.length, total: index.length });
  }
  log("done", { entities: built.size, ms: Date.now() - t0 });
}

async function main() {
  if (args.ids) {
    await buildOnly(args.ids.split(",").map((x) => x.trim()).filter(Boolean), args["add-to-index"] === "true");
    return;
  }
  const ranked = await rankEntities();
  log("ranked entities", { total: ranked.length });

  // Ranked separately per type and capped at TOP_N each — a mixed top-N would
  // be almost entirely companies (a person rarely accumulates the same
  // dataset breadth as a bank), so pessoa entities would never make the cut.
  const eligible = ranked.filter((r) => r.type === "empresa" || !isMaskedDocument(r.id));
  const topEmpresas = eligible.filter((r) => r.type === "empresa").slice(0, TOP_N);
  const topPessoas = eligible.filter((r) => r.type === "pessoa").slice(0, TOP_N);
  log("split by type", { empresas: topEmpresas.length, pessoas: topPessoas.length });
  const publicIdOf = (r: EntityRank) => (r.type === "pessoa" ? hashCpf(r.id) : r.id);

  // Entities already published stay published: wiring new datasets shifts the
  // breadth ranking, and an entity that falls out of the new top-N would
  // otherwise vanish from the site instead of being rebuilt with the new
  // relations. Pessoa ids in the index are CPF hashes, so they're matched back
  // to their raw CPF through the ranking (hash of each ranked CPF).
  const indexPath = resolve(OUT_DIR, "entities-index.json");
  const previous: IndexEntry[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
  const topIds = new Set([...topEmpresas, ...topPessoas].map(publicIdOf));
  const previousIds = new Set(previous.map((e) => e.id));
  const carried = eligible.filter((r) => previousIds.has(publicIdOf(r)) && !topIds.has(publicIdOf(r)));
  const top = [...topEmpresas, ...topPessoas, ...carried];
  const reachedIds = new Set(top.map(publicIdOf));
  const unreached = previous.filter((e) => !reachedIds.has(e.id));
  log("previously published", { total: previous.length, carriedOutsideTop: carried.length, notInRanking: unreached.length });
  const index: IndexEntry[] = [];

  // Pessoa entities are keyed publicly by a hash of the CPF, never the raw
  // digits — the raw id is only used internally to query beelink.
  const pathOf = (publicId: string) => resolve(ENTITIES_DIR, `${publicId}.json`);
  const toBuild: BuildTarget[] = [];
  for (const entity of top) {
    const publicId = publicIdOf(entity);
    if (!FORCE && existsSync(pathOf(publicId))) {
      try {
        const network = JSON.parse(readFileSync(pathOf(publicId), "utf8")) as EntityNetwork;
        const rootLabel = network.nodes.find((n) => n.id === publicId)?.label ?? publicId;
        index.push({ id: publicId, type: entity.type, label: rootLabel, datasetCount: entity.datasetCount, path: `entities/${publicId}.json` });
      } catch (err) {
        log("WARN could not index existing file", publicId, String(err).slice(0, 150));
      }
      continue;
    }
    toBuild.push({ type: entity.type, rawId: entity.id, publicId });
  }
  log("building", { entities: toBuild.length, skippedExisting: top.length - toBuild.length });
  const datasetCountOf = new Map(top.map((r) => [publicIdOf(r), r.datasetCount]));
  const built = await buildNetworks(toBuild);
  for (const t of toBuild) {
    const result = built.get(t.publicId);
    if (!result) continue;
    writeFileSync(pathOf(t.publicId), JSON.stringify(result.network));
    index.push({ id: t.publicId, type: t.type, label: result.label, datasetCount: datasetCountOf.get(t.publicId) ?? 0, path: `entities/${t.publicId}.json` });
  }

  // A previously published entity the ranking no longer reaches (e.g. its only
  // source table failed this run) keeps its old file and index row untouched.
  for (const e of unreached) {
    if (existsSync(resolve(OUT_DIR, e.path))) index.push(e);
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  log("done", { written: index.length, outDir: OUT_DIR });
}

await main();
