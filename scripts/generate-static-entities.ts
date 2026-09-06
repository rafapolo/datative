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
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { execRemoteSQL } from "./lib/duckdb-ssh";
import { buildSelectSQL } from "./lib/parquet-store";
import { extractCnpjRoot, socioNodeId, isMaskedDocument } from "./lib/cnpj-index";
import { hashCpf, isPersonalDocColumn, sanitizeCpfValue, sanitizeRow } from "./lib/cpf-privacy";
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
const BASE_RECEITA_TABLES = new Set(["br_me_cnpj.empresas", "br_me_cnpj.socios", "br_me_cnpj.estabelecimentos"]);

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

// Digits-only extraction, then bucket into an 8-digit company root or an
// 11-digit CPF depending on column type/length. Masked CPFs ("***123456**")
// strip down to 6 digits and are naturally dropped by the length check.
function entityKeyExpr(col: CnpjColumn): { keyExpr: string; typeExpr: string } {
  const raw = `"${col.name}"`;
  const digits = `regexp_replace(CAST(${raw} AS VARCHAR), '[^0-9]', '', 'g')`;
  if (col.type === "basico") {
    return { keyExpr: `NULLIF(${digits}, '')`, typeExpr: `'empresa'` };
  }
  if (col.type === "full") {
    const padded = col.normalize ? `lpad(${digits}, 14, '0')` : digits;
    const guard = col.normalize ? `${digits} <> ''` : `length(${digits}) = 14`;
    return {
      keyExpr: `CASE WHEN ${guard} THEN substr(${padded}, 1, 8) ELSE NULL END`,
      typeExpr: `'empresa'`,
    };
  }
  return {
    keyExpr: `CASE WHEN length(${digits}) = 14 THEN substr(${digits}, 1, 8)
                    WHEN length(${digits}) = 11 THEN ${digits}
                    ELSE NULL END`,
    typeExpr: `CASE WHEN length(${digits}) = 14 THEN 'empresa'
                     WHEN length(${digits}) = 11 THEN 'pessoa'
                     ELSE NULL END`,
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
  const idValue = isPersonalDocColumn(idField, docColumns) ? sanitizeCpfValue(rawId) : rawId;
  const nodeId = `${ds.id}:${idValue}`;
  const rawLabel = row[labelField];
  const labelValue = isPersonalDocColumn(labelField, docColumns) ? sanitizeCpfValue(rawLabel) : rawLabel;
  const nodeLabel = String(labelValue ?? nodeId);
  return { nodeId, nodeLabel };
}

async function buildEmpresaNetwork(cnpjBasico: string): Promise<{ label: string; network: EntityNetwork }> {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const addNode = (n: GraphNode) => { if (!nodes.find((x) => x.id === n.id)) nodes.push(n); };

  const empresaRows = await execRemoteSQL(buildSelectSQL("br_me_cnpj", "empresas", {
    columns: ["cnpj_basico", "razao_social"],
    filters: { cnpj_basico: cnpjBasico },
    limit: 1,
  }));
  const label = String(empresaRows[0]?.razao_social ?? cnpjBasico);
  addNode({ id: cnpjBasico, label, type: "empresa" });

  const socioRows = await execRemoteSQL(buildSelectSQL("br_me_cnpj", "socios", {
    columns: ["nome", "documento"],
    rawWhere: `"cnpj_basico" = '${cnpjBasico}'`,
    limit: PER_DATASET_LIMIT,
  }));
  for (const s of socioRows) {
    const nome = String(s.nome ?? "");
    const documento = s.documento != null ? String(s.documento) : null;
    const socioId = socioNodeId(documento, cnpjBasico, nome);
    addNode({ id: socioId, label: nome || socioId, type: "socio" });
    links.push({ source: cnpjBasico, target: socioId });
  }

  await pMap(CNPJ_DATASETS, CONCURRENCY, async (ds) => {
    const parts = ds.table.split(".");
    const { idField, labelField } = inferNodeFields(ds);
    const clauses = ds.cnpjColumns.map((col) => {
      const raw = `"${col.name}"`;
      const digits = `regexp_replace(CAST(${raw} AS VARCHAR), '[^0-9]', '', 'g')`;
      if (col.type === "basico") return `(${digits} = '${cnpjBasico}')`;
      const padded = col.normalize ? `lpad(${digits}, 14, '0')` : digits;
      const notBlank = col.normalize ? `${digits} <> '' AND ` : "";
      if (col.type === "full") return `(${notBlank}${padded} LIKE '${cnpjBasico}%')`;
      return `(${notBlank}length(${digits}) = 14 AND ${padded} LIKE '${cnpjBasico}%')`;
    });
    const columns = [...new Set([...ds.displayFields, idField, labelField, ...ds.cnpjColumns.map((c) => c.name)])];
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await withTimeout(
        execRemoteSQL(buildSelectSQL(parts[1], parts[2], {
          columns,
          rawWhere: `(${clauses.join(" OR ")})`,
          limit: PANEL_LIMIT,
        })),
        QUERY_TIMEOUT_MS,
        `${ds.id} lookup for ${cnpjBasico}`,
      );
    } catch (err) {
      log("  cross-dataset lookup failed", ds.id, String(err).slice(0, 150));
      return;
    }
    rows.forEach((row, i) => {
      const { nodeId, nodeLabel } = safeNodeIdAndLabel(ds, row, idField, labelField, i);
      const inGraph = i < PER_DATASET_LIMIT;
      const safeRow = sanitizeRow(row, ds.cnpjColumns.map((c) => c.name));
      addNode({ id: nodeId, label: nodeLabel, type: ds.nodeType ?? "registro", datasetId: ds.id, datasetLabel: ds.label, row: safeRow, ...(inGraph ? {} : { inGraph: false }) });
      if (inGraph) links.push({ source: cnpjBasico, target: nodeId });
    });
  });

  return { label, network: { nodes, links } };
}

async function buildPessoaNetwork(documento: string, publicId: string): Promise<{ label: string; network: EntityNetwork }> {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const addNode = (n: GraphNode) => { if (!nodes.find((x) => x.id === n.id)) nodes.push(n); };

  const socioRows = await execRemoteSQL(buildSelectSQL("br_me_cnpj", "socios", {
    columns: ["nome", "cnpj_basico"],
    rawWhere: `"documento" = '${documento}'`,
    limit: PER_DATASET_LIMIT,
  }));
  let label = String(socioRows[0]?.nome ?? sanitizeCpfValue(documento));
  const rootNode: GraphNode = { id: publicId, label, type: "socio" };
  addNode(rootNode);

  const companyIds = [...new Set(socioRows.map((r) => String(r.cnpj_basico)))];
  if (companyIds.length) {
    const empresaRows = await execRemoteSQL(buildSelectSQL("br_me_cnpj", "empresas", {
      columns: ["cnpj_basico", "razao_social"],
      rawWhere: `"cnpj_basico" IN (${companyIds.map((id) => `'${id}'`).join(",")})`,
      limit: companyIds.length,
    }));
    const labelByCnpj = new Map(empresaRows.map((r) => [String(r.cnpj_basico), String(r.razao_social ?? r.cnpj_basico)]));
    for (const cnpjBasico of companyIds) {
      addNode({ id: cnpjBasico, label: labelByCnpj.get(cnpjBasico) ?? cnpjBasico, type: "empresa" });
      links.push({ source: publicId, target: cnpjBasico });
    }
  }

  // Cross-dataset hits keyed on the full 11-digit CPF (mixed columns only —
  // "basico"/"full" columns are CNPJ-root matches and don't apply to a person).
  const withMixedCols = CNPJ_DATASETS.filter((ds) => ds.cnpjColumns.some((c) => c.type === "mixed"));
  await pMap(withMixedCols, CONCURRENCY, async (ds) => {
    const mixedCols = ds.cnpjColumns.filter((c) => c.type === "mixed");
    const parts = ds.table.split(".");
    const { idField, labelField } = inferNodeFields(ds);
    const clauses = mixedCols.map((col) => {
      const raw = `"${col.name}"`;
      const digits = `regexp_replace(CAST(${raw} AS VARCHAR), '[^0-9]', '', 'g')`;
      return `(${digits} = '${documento}')`;
    });
    const columns = [...new Set([...ds.displayFields, idField, labelField, ...mixedCols.map((c) => c.name)])];
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await withTimeout(
        execRemoteSQL(buildSelectSQL(parts[1], parts[2], {
          columns,
          rawWhere: `(${clauses.join(" OR ")})`,
          limit: PANEL_LIMIT,
        })),
        QUERY_TIMEOUT_MS,
        `${ds.id} lookup for ${documento}`,
      );
    } catch (err) {
      log("  cross-dataset lookup failed", ds.id, String(err).slice(0, 150));
      return;
    }
    rows.forEach((row, i) => {
      const { nodeId, nodeLabel } = safeNodeIdAndLabel(ds, row, idField, labelField, i);
      const inGraph = i < PER_DATASET_LIMIT;
      const safeRow = sanitizeRow(row, mixedCols.map((c) => c.name));
      addNode({ id: nodeId, label: nodeLabel, type: ds.nodeType ?? "registro", datasetId: ds.id, datasetLabel: ds.label, row: safeRow, ...(inGraph ? {} : { inGraph: false }) });
      if (inGraph) links.push({ source: publicId, target: nodeId });
    });
  });

  // br_me_cnpj.socios masks most CPFs for privacy, so the lookup above often
  // finds nothing even when this CPF was ranked via an unmasked mixed column
  // elsewhere (CGU/TSE/etc). Fall back to the first cross-dataset hit's own
  // name field rather than showing the raw CPF digits as the entity's label.
  if (label === sanitizeCpfValue(documento)) {
    const preferred = ["nome_favorecido", "nome_contratado", "nome_fornecedor", "nome_doador", "nome", "razao_social", "nome_razao_social", "nome_fantasia"];
    outer: for (const n of nodes) {
      if (!n.row) continue;
      for (const key of preferred) {
        const value = n.row[key];
        if (value) { label = String(value); break outer; }
      }
    }
    rootNode.label = label;
  }

  return { label, network: { nodes, links } };
}

// --- Main ---

interface IndexEntry {
  id: string;
  type: EntityType;
  label: string;
  datasetCount: number;
  path: string;
}

async function main() {
  const ranked = await rankEntities();
  log("ranked entities", { total: ranked.length });

  // Ranked separately per type and capped at TOP_N each — a mixed top-N would
  // be almost entirely companies (a person rarely accumulates the same
  // dataset breadth as a bank), so pessoa entities would never make the cut.
  const eligible = ranked.filter((r) => r.type === "empresa" || !isMaskedDocument(r.id));
  const topEmpresas = eligible.filter((r) => r.type === "empresa").slice(0, TOP_N);
  const topPessoas = eligible.filter((r) => r.type === "pessoa").slice(0, TOP_N);
  log("split by type", { empresas: topEmpresas.length, pessoas: topPessoas.length });
  const top = [...topEmpresas, ...topPessoas];
  const index: IndexEntry[] = [];

  for (let i = 0; i < top.length; i++) {
    const entity = top[i];
    // Pessoa entities are keyed publicly by a hash of the CPF, never the raw
    // digits — the raw id is only used internally below to query beelink.
    const publicId = entity.type === "pessoa" ? hashCpf(entity.id) : entity.id;
    const outPath = resolve(ENTITIES_DIR, `${publicId}.json`);
    if (!FORCE && existsSync(outPath)) {
      log(`[${i + 1}/${top.length}] skip (exists)`, entity.type, publicId);
      try {
        const network = JSON.parse(readFileSync(outPath, "utf8")) as EntityNetwork;
        const rootLabel = network.nodes.find((n) => n.id === publicId)?.label ?? publicId;
        index.push({ id: publicId, type: entity.type, label: rootLabel, datasetCount: entity.datasetCount, path: `entities/${publicId}.json` });
      } catch (err) {
        log(`[${i + 1}/${top.length}] WARN could not index existing file`, publicId, String(err).slice(0, 150));
      }
      continue;
    }
    log(`[${i + 1}/${top.length}] building`, entity.type, publicId, { datasetCount: entity.datasetCount });
    try {
      const { label, network } = entity.type === "empresa"
        ? await buildEmpresaNetwork(entity.id)
        : await buildPessoaNetwork(entity.id, publicId);
      writeFileSync(outPath, JSON.stringify(network));
      index.push({ id: publicId, type: entity.type, label, datasetCount: entity.datasetCount, path: `entities/${publicId}.json` });
    } catch (err) {
      log(`[${i + 1}/${top.length}] FAILED`, publicId, String(err).slice(0, 200));
    }
  }

  writeFileSync(resolve(OUT_DIR, "entities-index.json"), JSON.stringify(index, null, 2));
  log("done", { written: index.length, outDir: OUT_DIR });
}

await main();
