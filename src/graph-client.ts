import Graph from "graphology";
import Sigma from "sigma";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { drawDiscNodeLabel, drawDiscNodeHover } from "sigma/rendering";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { sortRowsNewestFirst } from "./lookup-sort";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  datasetId?: string;
  datasetLabel?: string;
  row?: Record<string, unknown>;
  // false = beyond the generator's per-dataset graph cap: keep in the lookup
  // panel's row table (it still carries `row`), but never add as a visual
  // graph node/edge. Omitted (implicitly true) for every other node.
  inGraph?: boolean;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface LookupResult {
  id: string;
  label: string;
  count: number;
  rows: Record<string, unknown>[];
  cnpjColumnNames?: string[];
  nodeType?: string;
  nodeIdField?: string;
  nodeLabelField?: string;
  queryError?: string;
}

interface NodeDetailEntry {
  datasetId: string;
  datasetLabel: string;
  relatedCompanyCnpj: string;
  attributes: Record<string, unknown>;
}

// --- Colors ---
const EMPRESA_COLORS = [
  "#4a72a0", // muted steel blue
  "#c07830", // muted amber
  "#b04a4c", // muted rose
  "#5a9490", // muted teal
  "#4a8040", // muted green
  "#b09030", // muted gold
  "#8060a0", // muted violet
  "#c07880", // muted pink
  "#806050", // muted brown
  "#909090", // neutral gray
];
const NODE_COLORS: Record<string, string> = {
  empresa: "#4a72a0", // steel blue
  socio: "#7a9ec0", // lighter blue
  contrato: "#b07838", // muted amber
  doacao: "#8060a0", // muted violet
  estabelecimento: "#4a7a9a", // steel teal
  pagamento: "#a04848", // muted crimson
  registro: "#3a8878", // muted teal-green
};

const COLOR_SELECTED = "#f0c060"; // warm amber — selected node highlight
const COLOR_FADE_NODE = "#2a2a3a"; // near-invisible for non-neighbors
const COLOR_FADE_EDGE = "#1e2436"; // very dim for non-neighborhood edges
const COLOR_EDGE_BASE = "#3a4a6a"; // default edge color
const COLOR_EDGE_HOVER = "#6a8ab0"; // highlighted edge color

let colorIndex = 0;
const empresaColorMap = new Map<string, string>();
const knownNodeIds = new Set<string>();
const knownLinkKeys = new Set<string>();
const nodeTypeMap = new Map<string, string>();
const nodeDetailsMap = new Map<string, NodeDetailEntry[]>();
const knownNodeDetailKeys = new Set<string>();
const rowSignatureToNodeIds = new Map<string, Set<string>>();
let renderer: Sigma | null = null;
let hoveredNode: string | null = null;
let selectedNode: string | null = null;
let layoutRootId = "";
let currentLayout:
  | "radial"
  | "radial-compact"
  | "forceatlas2"
  | "collapsible-tree"
  | "pack" = "radial";
let currentLookupLimit = 10;
let currentGraph: Graph | null = null;
const LOOKUP_LIMIT_OPTIONS = new Set([10, 20, 30, 40]);

// Below this viewport width, both side panels collapse into full-width
// bottom sheets (see the `@media` block in injectPanelStyles) — kept as a
// JS constant too so drag/resize/positioning logic can agree with the CSS.
const MOBILE_BREAKPOINT_PX = 768;
function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

// Populated by radialCompactLayout: leaves beyond COMPACT_MAX_LEAVES per hub
// are hidden (node + incident edges) rather than crammed into the same arc,
// and one of them is repurposed to display a "+N mais" marker in its place.
const COMPACT_MAX_LEAVES = 7;
const compactHiddenNodeIds = new Set<string>();
const compactOverflowLabels = new Map<string, string>();

// Dataset colors injected server-side via window.__DATASET_COLORS
const DATASET_COLORS: Record<string, string> =
  (window as unknown as { __DATASET_COLORS?: Record<string, string> })
    .__DATASET_COLORS ?? {};

interface DatasetMeta {
  label: string;
  color: string;
  cnpjColumnNames: string[];
  nodeType?: string;
  nodeIdField?: string;
  nodeLabelField?: string;
}

// Dataset config injected server-side via window.__DATASET_META — lets the
// panel list every wired dataset (including zero-hit ones) without a live
// query, since the precomputed graph JSON only carries nodes for hits.
const DATASET_META: Record<string, DatasetMeta> =
  (window as unknown as { __DATASET_META?: Record<string, DatasetMeta> })
    .__DATASET_META ?? {};

// Tracks which dataset IDs have at least one precomputed hit, so their
// section starts marked "added" in the panel.
const autoAddedDatasets = new Set<string>();

// --- Breadcrumb / drill-down state ---
const lookupHistory: Array<{ cnpj: string; label: string }> = [];
let currentLookupCnpj = "";
let currentLookupLabel = "";
const DEBUG_LOOKUP = true;

function interpolateColor(c1: string, c2: string, t: number): string {
  const h = (c: string) => parseInt(c.slice(1), 16);
  const r1 = (h(c1) >> 16) & 255,
    g1 = (h(c1) >> 8) & 255,
    b1 = h(c1) & 255;
  const r2 = (h(c2) >> 16) & 255,
    g2 = (h(c2) >> 8) & 255,
    b2 = h(c2) & 255;
  const r = Math.round(r1 + (r2 - r1) * t)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(g1 + (g2 - g1) * t)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(b1 + (b2 - b1) * t)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

function isCnpj(val: string): boolean {
  return val.replace(/\D/g, "").length === 14;
}

function extractBasico(val: string): string {
  return val.replace(/\D/g, "").slice(0, 8);
}

function setStatus(msg: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function setStatusLoading(active: boolean) {
  const el = document.getElementById("status");
  if (!el) return;
  el.dataset.loading = active ? "true" : "false";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startStatusTimer(baseMsg: string) {
  const startedAt = performance.now();
  setStatusLoading(true);
  const update = () => {
    setStatus(`${baseMsg} ${formatElapsed(performance.now() - startedAt)}`);
  };
  update();
  const intervalId = window.setInterval(update, 1000);

  return {
    stop(finalStatus?: string) {
      window.clearInterval(intervalId);
      const elapsedMs = Math.max(0, performance.now() - startedAt);
      setStatusLoading(false);
      if (finalStatus) setStatus(finalStatus);
      return elapsedMs;
    },
  };
}

function debugLog(...args: unknown[]) {
  if (!DEBUG_LOOKUP) return;
  console.log("[lookup-debug]", ...args);
}

function rowSignature(datasetId: string, row: Record<string, unknown>): string {
  return `${datasetId}|${JSON.stringify(row)}`;
}

function lookupLimitParam(): string {
  return String(currentLookupLimit);
}

function sanitizeLookupLimit(raw: string | null | undefined): number {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed)) return 10;
  return LOOKUP_LIMIT_OPTIONS.has(parsed) ? parsed : 10;
}

function selectedRowSignatures(): Set<string> {
  const signatures = new Set<string>();
  if (!selectedNode) return signatures;

  const graph = currentGraph;
  const nodeType = nodeTypeMap.get(selectedNode);
  const details: NodeDetailEntry[] = [];

  if (nodeType === "group" && graph?.hasNode(selectedNode)) {
    for (const neighbor of graph.neighbors(selectedNode)) {
      const neighborType = nodeTypeMap.get(neighbor);
      if (neighborType === "group") continue;
      details.push(...(nodeDetailsMap.get(neighbor) ?? []));
    }
  } else {
    details.push(...(nodeDetailsMap.get(selectedNode) ?? []));
  }

  for (const detail of details) {
    signatures.add(rowSignature(detail.datasetId, detail.attributes));
  }
  return signatures;
}

function syncLookupRowHighlight() {
  const selectedSignatures = selectedRowSignatures();
  const rows = document.querySelectorAll<HTMLTableRowElement>(
    ".lookup-table tbody tr[data-row-signature]",
  );
  for (const row of rows) {
    const signature = row.dataset.rowSignature;
    const isLinked = !!signature && selectedSignatures.has(signature);
    row.classList.toggle("linked", isLinked);
  }
}

// Expands and scrolls to a dataset's section in the side panel — triggered by
// clicking that dataset's hub node in the graph (accordion: collapses any
// other open section, matching the header-click behavior in renderResultSections).
function focusLookupSection(datasetId: string) {
  const panel = document.getElementById("lookup-panel");
  const body = document.getElementById("lookup-body");
  if (!panel || !body) return;
  const section = body.querySelector<HTMLElement>(
    `.lookup-section[data-dataset-id="${datasetId}"]`,
  );
  if (!section) return;
  const header = section.querySelector<HTMLElement>(".lookup-section-header");
  const bodyDiv = section.querySelector<HTMLElement>(".lookup-section-body");
  for (const openBody of body.querySelectorAll<HTMLElement>(
    ".lookup-section-body.expanded",
  )) {
    if (openBody !== bodyDiv) openBody.classList.remove("expanded");
  }
  for (const openHeader of body.querySelectorAll<HTMLElement>(
    ".lookup-section-header.expanded",
  )) {
    if (openHeader !== header) openHeader.classList.remove("expanded");
  }
  if (bodyDiv) ensureLookupTable(bodyDiv);
  bodyDiv?.classList.add("expanded");
  header?.classList.add("expanded");
  panel.classList.add("open");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Replaces the loading spinner with what went wrong, plus a retry button
// when trying again could help (a failed or stalled download).
function showLoadFailure(message: string, retry = false) {
  setStatus(message);
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.style.display = "";
  overlay.classList.add("failed");
  const text = overlay.querySelector<HTMLElement>(".loading-text");
  if (text) text.textContent = message;
  overlay.querySelector(".loading-retry")?.remove();
  if (!retry) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "loading-retry";
  button.textContent = "Tentar de novo";
  button.addEventListener("click", () => location.reload());
  overlay.appendChild(button);
}

// A download that stalls (a phone on poor signal) never errors by itself.
const FETCH_TIMEOUT_MS = 20000;

async function fetchGraph(cnpj: string): Promise<GraphData> {
  // Relative (no leading slash) so it resolves the same way whether the page
  // is served at "/" (dev server) or published under a subpath, e.g. GitHub
  // Pages project pages serve at "/<repo>/" (scripts/build-site.ts's output).
  const url = `entities/${cnpj}.json`;
  debugLog("GET", { url });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(`[fetch] ${res.status} ${url}`, body);
      throw new Error(`API error ${res.status}`);
    }
    debugLog("GET done", { url, status: res.status });
    return (await res.json()) as GraphData;
  } finally {
    clearTimeout(timer);
  }
}

function assignEmpresaColor(id: string): string {
  if (!empresaColorMap.has(id)) {
    empresaColorMap.set(id, EMPRESA_COLORS[colorIndex % EMPRESA_COLORS.length]);
    colorIndex++;
  }
  return empresaColorMap.get(id)!;
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 80);
  const g = Math.min(255, ((n >> 8) & 0xff) + 80);
  const b = Math.min(255, (n & 0xff) + 80);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function nodeAttrs(
  type: string,
  label: string,
  opts?: string | { datasetId?: string; empresaId?: string; isRoot?: boolean },
) {
  const o = typeof opts === "string" ? { empresaId: opts } : (opts ?? {});
  // Leaf dataset nodes — smaller, labeled only on hover
  if (o.datasetId) {
    const color = DATASET_COLORS[o.datasetId] ?? NODE_COLORS[type] ?? "#888888";
    return {
      label: "",
      fullLabel: label,
      size: 9,
      color,
      type: "circle",
      x: Math.random() * 10,
      y: Math.random() * 10,
    };
  }
  // empresa / socio use per-company color palette
  const baseColor = o.empresaId ? assignEmpresaColor(o.empresaId) : "#aaaaaa";
  let size: number;
  if (type === "empresa") {
    size = o.isRoot ? 22 : 18;
  } else if (type === "socio") {
    size = 11;
  } else {
    size = 9;
  }
  return {
    label,
    fullLabel: label,
    size,
    isRoot: o.isRoot ?? false,
    color: type === "empresa" ? baseColor : lighten(baseColor),
    type: "circle",
    x: Math.random() * 10,
    y: Math.random() * 10,
  };
}

function drawNodeLabelPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  topY: number,
  size: number,
  color = "#fff",
  bg = "rgba(8,8,20,0.88)",
) {
  const padding = 5;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(
    cx - w / 2 - padding,
    topY,
    w + padding * 2,
    size + padding * 2,
    3,
  );
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  ctx.fillText(text, cx, topY + padding);
}

function drawLabelInsideNode(
  ctx: CanvasRenderingContext2D,
  data: Parameters<typeof drawDiscNodeLabel>[1],
  settings: Parameters<typeof drawDiscNodeLabel>[2],
): void {
  if (!data.label) return;
  const size = settings.labelSize ?? 12;
  const font = settings.labelFont ?? "sans-serif";
  const weight = settings.labelWeight ?? "500";
  const color = (settings.labelColor as { color?: string }).color ?? "#000";
  const tx = data.x + data.size + 3;
  const ty = data.y + size / 3;
  ctx.font = `${weight} ${size}px ${font}`;
  if (currentLayout === "collapsible-tree") {
    const text = String(data.label);
    const metrics = ctx.measureText(text);
    const padX = 4;
    const padY = 2;
    const boxX = tx - padX;
    const boxY = ty - size + 1 - padY;
    const boxW = metrics.width + padX * 2;
    const boxH = size + padY * 2;
    ctx.fillStyle = "rgba(6, 8, 18, 0.86)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.strokeText(data.label, tx, ty);
  ctx.fillStyle = color;
  ctx.fillText(data.label, tx, ty);
}

function drawHoverInsideNode(
  ctx: CanvasRenderingContext2D,
  data: Parameters<typeof drawDiscNodeHover>[1],
  settings: Parameters<typeof drawDiscNodeHover>[2],
): void {
  // Labels are already drawn by drawLabelInsideNode; keep hover rendering minimal.
  void ctx;
  void data;
  void settings;
}

function edgeAttrs() {
  return { type: "curved", color: COLOR_EDGE_BASE, size: 1.2, zIndex: 1 };
}

function valueText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function trackNodeDetail(
  nodeId: string,
  datasetId: string,
  datasetLabel: string,
  relatedCompanyCnpj: string,
  attributes: Record<string, unknown>,
) {
  const detailKey = `${nodeId}|${datasetId}|${JSON.stringify(attributes)}`;
  if (knownNodeDetailKeys.has(detailKey)) return;
  knownNodeDetailKeys.add(detailKey);
  const current = nodeDetailsMap.get(nodeId) ?? [];
  current.push({
    datasetId,
    datasetLabel,
    relatedCompanyCnpj,
    attributes,
  });
  nodeDetailsMap.set(nodeId, current);
}

const DATASET_ICONS: Record<string, string> = {
  br_cgu_licitacao_contrato: "📋",
  br_cgu_cartao_pagamento: "💳",
  br_cgu_compras_governamentais: "🛒",
  br_tse_eleicoes: "🗳",
  br_ms_cnes: "🏥",
  br_me_exportadoras_importadoras: "🌐",
};

function datasetIcon(datasetId: string): string {
  return DATASET_ICONS[datasetId] ?? "◈";
}

function ensureGroupNode(
  graph: Graph,
  groupId: string,
  label: string,
  color: string,
  parentId: string,
) {
  if (!knownNodeIds.has(groupId)) {
    knownNodeIds.add(groupId);
    nodeTypeMap.set(groupId, "group");
    // Extract datasetId from groupId pattern "group:<cnpj>:<datasetId>"
    const datasetId = groupId.startsWith("group:")
      ? groupId.split(":").slice(2).join(":")
      : "";
    const icon = datasetId ? datasetIcon(datasetId) : "";
    const displayLabel = icon ? `${icon} ${label}` : label;
    graph.addNode(groupId, {
      label: displayLabel,
      fullLabel: displayLabel,
      size: 15,
      color,
      type: "circle",
      x: Math.random() * 10,
      y: Math.random() * 10,
    });
  }
  const edgeKey = `${parentId}→${groupId}`;
  if (
    !knownLinkKeys.has(edgeKey) &&
    graph.hasNode(parentId) &&
    graph.hasNode(groupId)
  ) {
    knownLinkKeys.add(edgeKey);
    if (!graph.hasEdge(parentId, groupId)) {
      graph.addEdge(parentId, groupId, edgeAttrs());
    }
  }
}

function radialLayout(graph: Graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root)) return;

  graph.setNodeAttribute(root, "x", 0);
  graph.setNodeAttribute(root, "y", 0);

  // Layer 1: direct neighbors of root
  const layer1 = graph.neighbors(root).filter((n) => graph.hasNode(n));
  if (layer1.length === 0) return;

  // Map each layer-1 node to its children (excluding root)
  const childrenOf = new Map<string, string[]>();
  for (const g of layer1) {
    childrenOf.set(
      g,
      graph.neighbors(g).filter((n) => n !== root),
    );
  }

  // Sector weight = 1 (for the group itself) + number of leaves
  const weights = layer1.map((g) => 1 + (childrenOf.get(g)?.length ?? 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Radii scale with graph size
  const R1 = Math.max(180, layer1.length * 50);
  const maxLeaves = Math.max(...weights.map((w) => w - 1), 1);
  const R2 = R1 + Math.max(160, maxLeaves * 38);

  let cursor = -Math.PI / 2; // start at top
  layer1.forEach((gId, i) => {
    const sector = (2 * Math.PI * weights[i]) / totalWeight;
    const gAngle = cursor + sector / 2;
    cursor += sector;

    graph.setNodeAttribute(gId, "x", Math.cos(gAngle) * R1);
    graph.setNodeAttribute(gId, "y", Math.sin(gAngle) * R1);

    const children = childrenOf.get(gId) ?? [];
    if (children.length === 0) return;

    const spread = sector * 0.82;
    const startAngle = gAngle - spread / 2;
    const step = children.length > 1 ? spread / (children.length - 1) : 0;
    children.forEach((leafId, j) => {
      const leafAngle = children.length === 1 ? gAngle : startAngle + j * step;
      graph.setNodeAttribute(leafId, "x", Math.cos(leafAngle) * R2);
      graph.setNodeAttribute(leafId, "y", Math.sin(leafAngle) * R2);
    });
  });
}

// Same hub placement as radialLayout, but caps visible leaves per hub at
// COMPACT_MAX_LEAVES — sector weight is computed from the capped count so a
// hub with 30 hits doesn't hog more angular room than one with 7, and the
// leaves that do fit get generous spacing instead of being crammed into a
// sector sized for the full (often 10-15+) hit count. Overflow leaves are
// hidden (via compactHiddenNodeIds, read by nodeReducer/edgeReducer) and one
// of them is repurposed in place as a "+N mais" marker (compactOverflowLabels).
function radialCompactLayout(graph: Graph) {
  compactHiddenNodeIds.clear();
  compactOverflowLabels.clear();

  const root = layoutRootId;
  if (!root || !graph.hasNode(root)) return;

  graph.setNodeAttribute(root, "x", 0);
  graph.setNodeAttribute(root, "y", 0);

  const layer1 = graph.neighbors(root).filter((n) => graph.hasNode(n));
  if (layer1.length === 0) return;

  const childrenOf = new Map<string, string[]>();
  for (const g of layer1) {
    childrenOf.set(g, graph.neighbors(g).filter((n) => n !== root));
  }

  const cappedCount = (g: string) =>
    Math.min(childrenOf.get(g)?.length ?? 0, COMPACT_MAX_LEAVES);
  const weights = layer1.map((g) => 1 + cappedCount(g));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const R1 = Math.max(180, layer1.length * 50);
  const maxLeaves = Math.max(...weights.map((w) => w - 1), 1);
  const R2 = R1 + Math.max(160, maxLeaves * 38);

  let cursor = -Math.PI / 2;
  layer1.forEach((gId, i) => {
    const sector = (2 * Math.PI * weights[i]) / totalWeight;
    const gAngle = cursor + sector / 2;
    cursor += sector;

    graph.setNodeAttribute(gId, "x", Math.cos(gAngle) * R1);
    graph.setNodeAttribute(gId, "y", Math.sin(gAngle) * R1);

    const allChildren = childrenOf.get(gId) ?? [];
    if (allChildren.length === 0) return;

    const overflow = allChildren.length > COMPACT_MAX_LEAVES;
    const visibleCount = overflow ? COMPACT_MAX_LEAVES - 1 : allChildren.length;
    const visible = allChildren.slice(0, visibleCount);
    const hidden = overflow ? allChildren.slice(visibleCount) : [];
    const slots = overflow ? COMPACT_MAX_LEAVES : allChildren.length;

    const spread = sector * 0.82;
    const startAngle = gAngle - spread / 2;
    const step = slots > 1 ? spread / (slots - 1) : 0;

    visible.forEach((leafId, j) => {
      const leafAngle = slots === 1 ? gAngle : startAngle + j * step;
      graph.setNodeAttribute(leafId, "x", Math.cos(leafAngle) * R2);
      graph.setNodeAttribute(leafId, "y", Math.sin(leafAngle) * R2);
    });

    if (overflow) {
      const markerAngle = startAngle + (slots - 1) * step;
      const markerX = Math.cos(markerAngle) * R2;
      const markerY = Math.sin(markerAngle) * R2;
      const [markerId, ...restHidden] = hidden;
      graph.setNodeAttribute(markerId, "x", markerX);
      graph.setNodeAttribute(markerId, "y", markerY);
      compactOverflowLabels.set(markerId, `+${hidden.length} mais`);
      for (const id of restHidden) {
        compactHiddenNodeIds.add(id);
        graph.setNodeAttribute(id, "x", markerX);
        graph.setNodeAttribute(id, "y", markerY);
      }
    }
  });
}

interface RootedTree {
  children: Map<string, string[]>;
  depth: Map<string, number>;
  visited: Set<string>;
}

function buildRootedTree(graph: Graph, root: string): RootedTree {
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>([[root, 0]]);
  const visited = new Set<string>([root]);
  const queue: string[] = [root];

  const sortNodes = (a: string, b: string) => {
    const aType = String(nodeTypeMap.get(a) ?? "");
    const bType = String(nodeTypeMap.get(b) ?? "");
    if (aType !== bType) return aType.localeCompare(bType);
    const aLabel = String(
      graph.getNodeAttribute(a, "fullLabel") ??
        graph.getNodeAttribute(a, "label") ??
        a,
    );
    const bLabel = String(
      graph.getNodeAttribute(b, "fullLabel") ??
        graph.getNodeAttribute(b, "label") ??
        b,
    );
    return aLabel.localeCompare(bLabel);
  };

  while (queue.length > 0) {
    const node = queue.shift()!;
    const nodeDepth = depth.get(node) ?? 0;
    const nodeChildren: string[] = [];
    const neighbors = graph
      .neighbors(node)
      .filter((n) => graph.hasNode(n))
      .sort(sortNodes);

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      depth.set(neighbor, nodeDepth + 1);
      nodeChildren.push(neighbor);
      queue.push(neighbor);
    }

    children.set(node, nodeChildren);
  }

  return { children, depth, visited };
}

function collapsibleTreeLayout(graph: Graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root)) return;
  const { children, depth, visited } = buildRootedTree(graph, root);

  const rowOrder = new Map<string, number>();
  let nextRow = 0;
  const assignRows = (node: string): number => {
    const nodeChildren = children.get(node) ?? [];
    if (nodeChildren.length === 0) {
      const row = nextRow++;
      rowOrder.set(node, row);
      return row;
    }
    const childRows = nodeChildren.map(assignRows);
    const row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    rowOrder.set(node, row);
    return row;
  };
  assignRows(root);

  const maxDepth = Math.max(...depth.values(), 0);
  const leaves = Math.max(nextRow, 1);
  const maxLabelChars = Math.max(
    ...[...visited].map((node) =>
      String(
        graph.getNodeAttribute(node, "fullLabel") ??
          graph.getNodeAttribute(node, "label") ??
          "",
      ).length,
    ),
    0,
  );
  const labelFactor = Math.max(1, Math.min(1.8, maxLabelChars / 24));
  const rowSpacing = Math.max(
    84,
    Math.min(220, (2600 / leaves) * labelFactor),
  );
  const depthSpacing = Math.max(
    360,
    Math.min(760, (5200 / (maxDepth + 1)) * Math.min(1.7, labelFactor)),
  );
  const rootRow = rowOrder.get(root) ?? 0;
  const depthCenterOffset = ((maxDepth + 1) * depthSpacing) / 2;

  for (const node of visited) {
    const d = depth.get(node) ?? 0;
    const row = rowOrder.get(node) ?? 0;
    const nodeType = String(nodeTypeMap.get(node) ?? "");
    const typeOffset =
      nodeType === "group"
        ? 18
        : nodeType === "empresa"
          ? -12
          : nodeType === "socio"
            ? 12
            : 0;
    graph.setNodeAttribute(node, "x", d * depthSpacing - depthCenterOffset + typeOffset);
    graph.setNodeAttribute(node, "y", (row - rootRow) * rowSpacing);
  }

  const detached = graph.nodes().filter((n) => !visited.has(n));
  if (detached.length === 0) return;

  const ringRadius = Math.max(220, detached.length * 24);
  detached.forEach((node, index) => {
    const angle = (index / detached.length) * 2 * Math.PI;
    graph.setNodeAttribute(node, "x", -depthSpacing);
    graph.setNodeAttribute(node, "y", ringRadius * Math.sin(angle));
  });
}

function packLayout(graph: Graph) {
  const root = layoutRootId;
  if (!root || !graph.hasNode(root)) return;
  const { children, visited } = buildRootedTree(graph, root);

  const subtreeWeight = new Map<string, number>();
  const calcWeight = (node: string): number => {
    const nodeChildren = children.get(node) ?? [];
    const weight = 1 + nodeChildren.reduce((sum, child) => sum + calcWeight(child), 0);
    subtreeWeight.set(node, weight);
    return weight;
  };
  const totalWeight = calcWeight(root);
  const rootRadius = Math.max(180, Math.sqrt(totalWeight) * 30);

  type PackedCircle = {
    id: string;
    x: number;
    y: number;
    radius: number;
  };

  const collides = (
    x: number,
    y: number,
    radius: number,
    circles: PackedCircle[],
    padding: number,
  ) => {
    for (const circle of circles) {
      const minDistance = radius + circle.radius + padding;
      if (Math.hypot(x - circle.x, y - circle.y) < minDistance) return true;
    }
    return false;
  };

  const packSiblings = (ids: string[]) => {
    const sorted = [...ids].sort(
      (a, b) => (subtreeWeight.get(b) ?? 1) - (subtreeWeight.get(a) ?? 1),
    );
    const circles: PackedCircle[] = [];

    const baseRadius = (id: string) => Math.max(1, Math.sqrt(subtreeWeight.get(id) ?? 1));
    const spiralStep = 0.35;
    const radialFactor = 0.95;
    const padding = 0.18;

    for (const id of sorted) {
      const radius = baseRadius(id);
      let best: PackedCircle | null = null;

      for (let t = 0; t <= 2200; t += spiralStep) {
        const radial = Math.max(
          radius + 0.25,
          radialFactor * Math.sqrt(t) + radius + 0.12,
        );
        const x = Math.cos(t) * radial;
        const y = Math.sin(t) * radial;
        if (collides(x, y, radius, circles, padding)) continue;
        best = { id, x, y, radius };
        break;
      }

      if (!best) {
        const fallbackX = (circles.length + 1) * (radius * 2.2 + padding);
        best = { id, x: fallbackX, y: 0, radius };
      }
      circles.push(best);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let farthest = 1;
    for (const circle of circles) {
      minX = Math.min(minX, circle.x - circle.radius);
      maxX = Math.max(maxX, circle.x + circle.radius);
      minY = Math.min(minY, circle.y - circle.radius);
      maxY = Math.max(maxY, circle.y + circle.radius);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const circle of circles) {
      circle.x -= cx;
      circle.y -= cy;
      farthest = Math.max(farthest, Math.hypot(circle.x, circle.y) + circle.radius);
    }

    return { circles, extentRadius: farthest };
  };

  const place = (node: string, x: number, y: number, radius: number) => {
    graph.setNodeAttribute(node, "x", x);
    graph.setNodeAttribute(node, "y", y);

    const nodeChildren = children.get(node) ?? [];
    if (nodeChildren.length === 0) return;

    const { circles, extentRadius } = packSiblings(nodeChildren);
    const usableRadius = Math.max(radius * 0.86, 28);
    const scale = usableRadius / extentRadius;

    for (const child of circles) {
      const childRadius = child.radius * scale;
      place(child.id, x + child.x * scale, y + child.y * scale, childRadius);
    }
  };

  place(root, 0, 0, rootRadius);

  const detached = graph.nodes().filter((n) => !visited.has(n));
  if (detached.length === 0) return;
  const detachedRadius = Math.max(220, detached.length * 24);
  detached.forEach((node, index) => {
    const angle = (index / detached.length) * 2 * Math.PI;
    graph.setNodeAttribute(node, "x", -rootRadius * 1.7);
    graph.setNodeAttribute(node, "y", detachedRadius * Math.sin(angle));
  });
}

function runLayout(graph: Graph, _iterations: number, onDone?: () => void) {
  requestAnimationFrame(() => {
    if (currentLayout !== "radial-compact") {
      compactHiddenNodeIds.clear();
      compactOverflowLabels.clear();
    }
    if (currentLayout === "forceatlas2") {
      const settings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, { iterations: 150, settings });
    } else if (currentLayout === "pack") {
      packLayout(graph);
    } else if (currentLayout === "collapsible-tree") {
      collapsibleTreeLayout(graph);
    } else if (currentLayout === "radial-compact") {
      radialCompactLayout(graph);
    } else {
      radialLayout(graph);
    }
    renderer?.refresh();
    onDone?.();
  });
}

// --- Lookup Panel ---

function injectPanelStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #lookup-panel, #node-details-panel {
      scrollbar-width: thin;
      scrollbar-color: #42427a #0a0f22;
    }
    #lookup-panel *::-webkit-scrollbar,
    #node-details-panel *::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    #lookup-panel *::-webkit-scrollbar-track,
    #node-details-panel *::-webkit-scrollbar-track {
      background: #0a0f22;
    }
    #lookup-panel *::-webkit-scrollbar-thumb,
    #node-details-panel *::-webkit-scrollbar-thumb {
      background: #42427a;
      border-radius: 6px;
      border: 2px solid #0a0f22;
    }
    #lookup-panel *::-webkit-scrollbar-thumb:hover,
    #node-details-panel *::-webkit-scrollbar-thumb:hover {
      background: #4f46e5;
    }
    #lookup-panel {
      position: fixed;
      top: 46px;
      left: 0;
      width: 33vw;
      min-width: 320px;
      max-width: 90vw;
      height: calc(100vh - 46px - 30px);
      min-height: calc(100vh - 46px - 30px);
      max-height: calc(100vh - 46px - 30px);
      background: #0f0f22;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 1000;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      box-shadow: 4px 0 20px rgba(0,0,0,0.5);
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
    }
    #lookup-panel.open {
      transform: translateX(0);
    }
    #lookup-panel[data-dock="right"] {
      left: auto;
      right: 0;
      transform: translateX(100%);
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
    }
    #lookup-panel[data-dock="bottom"] {
      top: auto;
      bottom: 30px;
      width: 100% !important;
      max-width: 100%;
      height: 40vh;
      min-height: 0;
      max-height: calc(100vh - 46px - 30px - 80px);
      transform: translateY(calc(100% + 30px));
      box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
    }
    #lookup-panel[data-dock="right"].open,
    #lookup-panel[data-dock="bottom"].open {
      transform: none;
    }
    /* With the lookup panel on the right, the node-details card swaps to
       the left so the two don't stack on the same edge. */
    body[data-lookup-dock="right"] #node-details-panel {
      right: auto;
      left: 0;
      border-left: none;
      border-top: 1px solid #23234a;
      border-right: 1px solid #23234a;
      border-radius: 0 0 10px 0;
      transform: translateX(-100%);
      box-shadow: 4px 4px 20px rgba(0,0,0,0.45);
    }
    body[data-lookup-dock="right"] #node-details-panel.open {
      transform: translateX(0);
    }
    /* With the lookup panel at the bottom, the node-details card shares
       that strip: same height (--bottom-h, synced from the lookup panel in
       updateGraphLayout), docked bottom-right, and the lookup panel gives
       up its width (--details-w) while the card is open. */
    body[data-lookup-dock="bottom"] #node-details-panel {
      top: auto;
      bottom: 30px;
      left: auto;
      right: 0;
      width: 34vw;
      min-width: 260px;
      max-width: 60vw;
      height: var(--bottom-h, 40vh);
      max-height: none;
      /* Same surface and top edge as the lookup panel beside it, so the two
         headers line up as one bar — only the left border divides them. */
      background: #0f0f22;
      border-top: 1px solid #23234a;
      border-bottom: none;
      border-radius: 0;
      transform: translateY(calc(100% + 30px));
      box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
    }
    body[data-lookup-dock="bottom"] #node-details-panel.open {
      transform: none;
    }
    @media (min-width: ${MOBILE_BREAKPOINT_PX + 1}px) {
      body[data-lookup-dock="bottom"][data-details-open] #lookup-panel {
        width: calc(100% - var(--details-w, 34vw)) !important;
      }
    }
    #lookup-actions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    #lookup-header,
    #node-details-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #080814;
      border-bottom: 1px solid #23234a;
      flex-shrink: 0;
      user-select: none;
      /* Equal heights whatever buttons each header holds (the dock glyph is
         taller than ✕), so side-by-side headers share one bottom line. */
      box-sizing: border-box;
      min-height: 53px;
    }
    #lookup-title,
    #node-details-title {
      font-weight: 700;
      font-size: 0.88rem;
      color: #93c5fd;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-right: 0.5rem;
    }
    #lookup-close,
    #lookup-dock,
    #node-details-close {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    #lookup-close:hover,
    #lookup-dock:hover,
    #node-details-close:hover {
      background: #2e2e4e;
      color: #fff;
    }
    #lookup-body {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .lookup-section {
      margin: 0.28rem 0.55rem;
      border: 1px solid #23234a;
      border-radius: 10px;
      overflow: hidden;
      background: #12122b;
      transition: border-color 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
      max-height: 450px;
      display: flex;
      flex-direction: column;
    }
    .lookup-section-header {
      flex-shrink: 0;
    }
    .lookup-section:hover {
      border-color: #3a3a68;
      box-shadow: 0 6px 14px rgba(0,0,0,0.24);
      transform: translateY(-1px);
    }
    .lookup-section.added {
      border-color: #2f8f5b;
      box-shadow: 0 0 0 1px rgba(47,143,91,0.35);
    }
    .lookup-section.empty {
      opacity: 0.5;
    }
    .lookup-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.55rem 1rem;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .lookup-section-header:hover {
      background: linear-gradient(90deg, #1d1d3d 0%, #25254d 100%);
    }
    .lookup-section-header.empty {
      cursor: default;
    }
    .lookup-section-title {
      font-size: 0.78rem;
      color: white;
      letter-spacing: 0.01em;
    }
    .lookup-section-title:hover {
      color: white;
      opacity: 1;
    }
    .lookup-section-header.expanded .lookup-section-title {
      color: #a5b4fc;
    }
    .lookup-section-header.expanded {
      background: linear-gradient(90deg, #23234f 0%, #2c2c69 100%);
    }
    .lookup-badge {
      background: #312e81;
      color: #a5b4fc;
      border-radius: 10px;
      padding: 0.1rem 0.5rem;
      font-size: 0.68rem;
      font-weight: 700;
    }
    .lookup-section-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lookup-add-btn {
      background: none;
      border: 1px solid #4f46e5;
      color: #818cf8;
      border-radius: 4px;
      padding: 0.15rem 0.55rem;
      font-size: 0.68rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .lookup-add-btn:hover { background: #4f46e5; color: #fff; }
    .lookup-add-btn:disabled { opacity: 0.3; cursor: default; }
    .lookup-section-body {
      display: none;
      overflow-x: auto;
      background: #0a0f22;
      border-top: 1px solid #1f2a44;
    }
    .lookup-section-body.expanded {
      display: block;
      overflow: auto;
      min-height: 0;
    }
    .lookup-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.72rem;
    }
    .lookup-table thead th {
      position: sticky;
      top: 0;
      background: #121a34;
      color: #93c5fd;
      text-align: left;
      padding: 0.4rem 0.75rem;
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      white-space: nowrap;
      border-bottom: 1px solid #1f2a44;
    }
    .lookup-table td {
      padding: 0.38rem 0.75rem;
      border-bottom: 1px solid #18213f;
      color: #dbeafe;
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lookup-table tbody tr:nth-child(odd) td { background: #0a0f22; }
    .lookup-table tbody tr:nth-child(even) td { background: #0b132b; }
    .lookup-table tbody tr:hover td { background: #121a34; color: #dbeafe; }
    .lookup-table tbody tr.linked td {
      background: #1d2b52 !important;
      color: #e6f0ff;
      box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.45);
    }
    /* Row has no corresponding graph node (beyond the per-dataset graph cap) —
       clicking it can't highlight anything, so dim it to signal that upfront. */
    .lookup-table tbody tr.row-no-node td {
      color: #5c6584;
      cursor: default;
    }
    .lookup-table tbody tr.row-no-node:hover td {
      color: #5c6584;
    }
    .lookup-skeleton {
      padding: 1rem;
      color: #44446a;
      font-size: 0.78rem;
      font-style: italic;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lookup-skeleton::before {
      content: "";
      width: 14px; height: 14px;
      border: 2px solid #4f46e5;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .lookup-error {
      padding: 0.6rem 1rem;
      color: #f87171;
      font-size: 0.75rem;
      background: #200a0a;
    }
    .chevron {
      font-size: 0.6rem;
      color: #44446a;
      transition: transform 0.2s;
    }
    .lookup-section-header.expanded .chevron {
      transform: rotate(90deg);
      color: #818cf8;
    }
    .cnpj-link {
      color: #a5b4fc;
      cursor: pointer;
      text-decoration: underline dotted;
    }
    .cnpj-link:hover { color: #fff; }
    .node-entity-link { display: inline-block; margin: 0 0 0.6rem; font-size: 0.8rem; }
    .lookup-more {
      display: block;
      width: 100%;
      min-height: 40px;
      padding: 0.55rem;
      font: 700 0.62rem 'Space Mono', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a5b4fc;
      background: #0d1430;
      border: none;
      border-top: 1px solid #1f2a44;
      cursor: pointer;
    }
    .lookup-more:hover { color: #fff; background: #121a3a; }
    .lookup-more[hidden] { display: none; }
    #lookup-fab {
      position: fixed;
      left: 14px;
      bottom: 52px;
      z-index: 20;
      min-height: 44px;
      padding: 0 1.1rem;
      font: 700 0.66rem 'Space Mono', monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0a0a18;
      background: #e8b84b;
      border: none;
      border-radius: 22px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.45);
      cursor: pointer;
    }
    #lookup-fab[hidden] { display: none; }
    #lookup-back {
      background: none;
      border: none;
      color: #818cf8;
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      margin-right: 0.25rem;
    }
    #lookup-back:hover {
      background: #2e2e4e;
      color: #fff;
    }
    #node-details-panel {
      position: fixed;
      top: 46px;
      right: 0;
      width: max-content;
      min-width: 200px;
      max-width: min(520px, 92vw);
      /* Starts as compact as its content allows (just enough for the header
         title + close button at minimum) and only grows — width up to the
         cap above (a two-column key/value row rarely needs the full 520px,
         so most cards end up narrower than that), and height capped at the
         full space below the toolbar/above the footer — #node-details-body's
         overflow-y:auto only kicks in past that cap, so scrolling is a
         fallback, not the default for typical short node-detail cards. */
      max-height: calc(100vh - 46px - 30px);
      background: #0c1024;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      z-index: 1200;
      border-left: 1px solid #23234a;
      border-bottom: 1px solid #23234a;
      border-radius: 0 0 0 10px;
      transform: translateX(100%);
      transition: transform 0.2s ease;
      box-shadow: -4px 4px 20px rgba(0,0,0,0.45);
      font-family: system-ui, sans-serif;
      font-size: 0.82rem;
    }
    #node-details-panel.open {
      transform: translateX(0);
    }
    #node-details-body {
      overflow-y: auto;
      padding: 0.55rem 0.7rem 0.8rem;
      flex: 1;
      min-height: 0;
    }
    .node-detail-meta {
      border: 1px solid #1f2a44;
      border-radius: 6px;
      background: #0b132b;
      color: #cbd5e1;
      margin-bottom: 0.6rem;
      overflow: hidden;
    }
    .node-detail-entry {
      border: 1px solid #1f2a44;
      border-radius: 6px;
      margin-bottom: 0.6rem;
      overflow: hidden;
      background: #0a0f22;
    }
    .node-detail-entry h4 {
      margin: 0;
      padding: 0.42rem 0.55rem;
      font-size: 0.72rem;
      color: #bfdbfe;
      background: #121a34;
      border-bottom: 1px solid #1f2a44;
      letter-spacing: 0.02em;
    }
    .node-detail-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .node-detail-table th,
    .node-detail-table td {
      border-bottom: 1px solid #18213f;
      text-align: left;
      vertical-align: top;
      padding: 0.36rem 0.5rem;
      word-break: break-word;
    }
    .node-detail-table th {
      width: 42%;
      color: #93c5fd;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .node-detail-table td {
      color: #dbeafe;
      font-size: 0.75rem;
    }
    .node-detail-empty {
      color: #9ca3af;
      font-style: italic;
      padding: 0.4rem 0.2rem;
    }
    /* Phones: the lookup panel's dock still applies — left/right become
       drawers over the graph (no reflow, too narrow to share), bottom the
       usual bottom sheet. The node-details card takes the opposite side,
       or is a bottom sheet too while the lookup panel docks at the bottom.
       Only one of the two is open at a time on a phone. */
    @media (max-width: ${MOBILE_BREAKPOINT_PX}px) {
      #lookup-panel[data-dock="left"],
      #lookup-panel[data-dock="right"] {
        top: 46px;
        bottom: 0;
        width: 88vw;
        min-width: 0;
        max-width: 92vw;
        height: auto;
        min-height: 0;
        max-height: none;
      }
      body:not([data-lookup-dock="bottom"]) #node-details-panel {
        width: 88vw;
        min-width: 0;
        max-width: 92vw;
        max-height: calc(100vh - 46px);
      }
      #lookup-panel[data-dock="bottom"],
      body[data-lookup-dock="bottom"] #node-details-panel {
        left: 0;
        right: 0;
        top: auto;
        bottom: 0;
        width: 100% !important;
        max-width: 100%;
        min-width: 0;
        height: auto;
        min-height: 0;
        max-height: 78vh;
        border-radius: 14px 14px 0 0;
        border: none;
        border-top: 1px solid #23234a;
        transform: translateY(100%);
        box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
      }
      #lookup-panel[data-dock="bottom"].open,
      body[data-lookup-dock="bottom"] #node-details-panel.open {
        transform: none;
      }
      #lookup-header,
      #node-details-header {
        cursor: default;
      }
      #lookup-close,
      #lookup-dock,
      #node-details-close,
      #lookup-back {
        min-width: 44px;
        min-height: 44px;
      }
      .lookup-section-header {
        min-height: 44px;
      }
      /* Wider side handle for a finger. */
      .panel-resizer {
        width: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

type PanelEdge = "left" | "right" | "bottom";

// `edge` is the panel's inner edge (the one facing the graph) — a function
// for the lookup panel, whose dock side can change at runtime. "bottom"
// means the panel is docked at the bottom, so it resizes by height from
// its top edge, like the mobile bottom sheet.
function makeResizable(
  panel: HTMLElement,
  edgeOf: PanelEdge | (() => PanelEdge),
  onResize?: () => void,
) {
  const currentEdge = () => (typeof edgeOf === "function" ? edgeOf() : edgeOf);
  const resizer = document.createElement("div");
  resizer.className = "panel-resizer";
  const placeResizer = () => {
    const edge = currentEdge();
    resizer.style.left = edge === "right" ? "auto" : "0";
    resizer.style.right = edge === "right" ? "0" : "auto";
    resizer.style.display = edge === "bottom" ? "none" : "block";
  };
  resizer.style.cssText = `
    position: absolute;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: ew-resize;
    z-index: 10;
    background: transparent;
    touch-action: none;
  `;
  placeResizer();
  panel.appendChild(resizer);

  let resizing = false;
  let startX = 0,
    startW = 0;

  resizer.addEventListener("pointerdown", (e) => {
    if (currentEdge() === "bottom") return; // resize by height, see below
    resizing = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    panel.style.transition = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const newW = currentEdge() === "right" ? startW + dx : startW - dx;
    if (newW >= 240 && newW <= window.innerWidth * 0.9) {
      panel.style.width = newW + "px";
      onResize?.();
    }
  });

  document.addEventListener("pointerup", () => {
    resizing = false;
  });

  // Docked at the bottom the panel is a full-width sheet, so "resizable"
  // means its height — a drag bar along the top edge instead of a side edge.
  const vResizer = document.createElement("div");
  vResizer.className = "panel-resizer-v";
  vResizer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 10px;
    cursor: ns-resize;
    z-index: 10;
    background: transparent;
    touch-action: none;
  `;
  panel.appendChild(vResizer);

  let vResizing = false;
  let startY = 0,
    startH = 0;

  vResizer.addEventListener("pointerdown", (e) => {
    if (currentEdge() !== "bottom") return;
    vResizing = true;
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;
    panel.style.transition = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("pointermove", (e) => {
    if (!vResizing) return;
    const dy = startY - e.clientY; // dragging up grows the sheet
    const newH = startH + dy;
    const minH = window.innerHeight * 0.2;
    const maxH = window.innerHeight * 0.92;
    if (newH >= minH && newH <= maxH) {
      panel.style.maxHeight = newH + "px";
      if (currentEdge() === "bottom") panel.style.height = newH + "px";
      onResize?.();
    }
  });

  document.addEventListener("pointerup", () => {
    vResizing = false;
  });

  const placeVResizer = () => {
    vResizer.style.display = currentEdge() === "bottom" ? "block" : "none";
  };
  placeVResizer();
  const place = () => {
    placeResizer();
    placeVResizer();
  };
  // The edge can depend on the viewport (see createNodeDetailsPanel).
  window.addEventListener("resize", place);
  return place;
}

function closePanel(panel: HTMLElement) {
  panel.classList.remove("open");
}

// A closed panel only slides off screen, so its buttons and rows stayed in
// the Tab order (and the screen reader's reach). Keep it inert while shut.
function keepInertWhileClosed(panel: HTMLElement) {
  const sync = () => {
    panel.inert = !panel.classList.contains("open");
  };
  sync();
  new MutationObserver(sync).observe(panel, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// Esc closes the open panel — the node-details card first, it sits on top.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  for (const id of ["node-details-close", "lookup-close"]) {
    const button = document.getElementById(id);
    const panel = button?.closest("aside");
    if (button && panel?.classList.contains("open")) {
      button.click();
      e.preventDefault();
      return;
    }
  }
});

// Unlike the floating node-details card, the docked lookup panel actually
// reflows the graph instead of overlaying it — #graph-container is pushed
// right by the panel's current width (open + desktop only) and Sigma is
// told to resize, so the graph re-centers in whatever space is left rather
// than sitting partly hidden behind the panel.
function updateGraphLayout() {
  const container = document.getElementById("graph-container");
  const panel = document.getElementById("lookup-panel");
  if (!container || !panel) return;
  const dock = lookupDock();
  const details = document.getElementById("node-details-panel");
  const detailsOpen = !!details?.classList.contains("open");
  document.body.toggleAttribute("data-details-open", detailsOpen);
  document.body.style.setProperty("--bottom-h", `${panel.offsetHeight}px`);
  if (details) {
    document.body.style.setProperty("--details-w", `${details.offsetWidth}px`);
  }
  // At the bottom the node-details card shares the lookup panel's strip,
  // so either one being open takes that height from the graph.
  const open =
    !isMobileViewport() &&
    (panel.classList.contains("open") || (dock === "bottom" && detailsOpen));
  const offset = open
    ? dock === "bottom"
      ? panel.offsetHeight
      : panel.offsetWidth
    : 0;
  const fab = document.getElementById("lookup-fab");
  if (fab) fab.hidden = panel.classList.contains("open");
  container.style.marginLeft = offset && dock === "left" ? `${offset}px` : "";
  container.style.width =
    offset && dock !== "bottom" ? `calc(100% - ${offset}px)` : "";
  container.style.marginBottom =
    offset && dock === "bottom" ? `${offset}px` : "";
  // resize() alone clears the WebGL canvases (changing their width/height
  // attributes wipes the drawing buffer) but never redraws — without an
  // explicit refresh the graph stays blank until something else triggers one.
  renderer?.resize();
  renderer?.refresh({ skipIndexation: true });
}
// The lookup panel's default width is vw-based, and the mobile breakpoint
// changes whether it reflows the graph at all — recompute on every window
// resize, not just drag-resize.
window.addEventListener("resize", updateGraphLayout);

const LOOKUP_DOCKS = ["left", "right", "bottom"] as const;
type LookupDock = (typeof LOOKUP_DOCKS)[number];
// Remembered separately for desktop and phone, which default differently.
const lookupDockKey = () =>
  isMobileViewport() ? "datative.lookupDock.mobile" : "datative.lookupDock";
const LOOKUP_DOCK_ICONS: Record<LookupDock, string> = {
  left: "⇤",
  right: "⇥",
  bottom: "⤓",
};
const LOOKUP_DOCK_LABELS: Record<LookupDock, string> = {
  left: "esquerda",
  right: "direita",
  bottom: "embaixo",
};

function lookupDock(): LookupDock {
  const dock = document.getElementById("lookup-panel")?.dataset.dock;
  return (LOOKUP_DOCKS as readonly string[]).includes(dock ?? "")
    ? (dock as LookupDock)
    : "left";
}

function savedLookupDock(): LookupDock {
  try {
    const saved = localStorage.getItem(lookupDockKey()) ?? "";
    if ((LOOKUP_DOCKS as readonly string[]).includes(saved)) {
      return saved as LookupDock;
    }
  } catch {}
  return isMobileViewport() ? "bottom" : "left";
}

function createPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = "lookup-panel";
  panel.tabIndex = -1;
  panel.setAttribute("aria-label", "Bases de dados");
  panel.innerHTML = `
    <div id="lookup-header">
      <button id="lookup-back" style="display:none">← Voltar</button>
      <span id="lookup-title">CNPJ</span>
      <div id="lookup-actions">
        <button id="lookup-dock" type="button"></button>
        <button id="lookup-close">✕</button>
      </div>
    </div>
    <div id="lookup-body"></div>
  `;
  document.body.appendChild(panel);

  // Reopens the panel once closed — otherwise the only way back was clicking
  // a dataset hub in the graph. Hidden while the panel is open (see
  // updateGraphLayout).
  const fab = document.createElement("button");
  fab.id = "lookup-fab";
  fab.type = "button";
  fab.textContent = "Bases";
  fab.addEventListener("click", (e) => {
    if (isMobileViewport()) closePanel(document.getElementById("node-details-panel") as HTMLElement);
    panel.classList.add("open");
    updateGraphLayout();
    // Opened from the keyboard (no pointer, detail 0): take the focus there,
    // or the next Tab walks the page behind the sheet.
    if (e.detail === 0) {
      panel.inert = false; // the observer only lifts it after this handler
      panel.focus({ preventScroll: true });
    }
  });
  document.body.appendChild(fab);

  document.getElementById("lookup-close")!.addEventListener("click", () => {
    const hadFocus = panel.contains(document.activeElement);
    closePanel(panel);
    lookupHistory.length = 0;
    updateGraphLayout();
    // Focus would otherwise fall into the now-inert panel (or was already
    // lost to <body> when the hidden Bases button let it go): hand it back
    // to the button that reopens the panel.
    if (hadFocus || document.activeElement === document.body) {
      fab.focus({ preventScroll: true });
    }
  });
  keepInertWhileClosed(panel);

  // Docked to an edge (left by default; the header's dock button cycles
  // left → right → bottom, remembered per browser), deliberately not
  // draggable — only width- (bottom dock and mobile: height-) resizable via
  // makeResizable's handle. Resizing also reflows the graph (see
  // updateGraphLayout).
  const placeResizers = makeResizable(
    panel,
    () => {
      const dock = lookupDock();
      return dock === "left" ? "right" : dock === "right" ? "left" : "bottom";
    },
    updateGraphLayout,
  );
  const dockBtn = document.getElementById("lookup-dock")!;
  const applyDock = (dock: LookupDock) => {
    panel.dataset.dock = dock;
    document.body.dataset.lookupDock = dock;
    // Sizes dragged in the previous dock don't carry over to the new one.
    panel.style.width = "";
    panel.style.height = "";
    panel.style.maxHeight = "";
    // Skip the slide animation, which would sweep across the screen.
    panel.style.transition = "none";
    placeResizers();
    const next = LOOKUP_DOCKS[(LOOKUP_DOCKS.indexOf(dock) + 1) % LOOKUP_DOCKS.length];
    dockBtn.textContent = LOOKUP_DOCK_ICONS[next];
    dockBtn.title = `Mover painel para ${LOOKUP_DOCK_LABELS[next]}`;
    dockBtn.setAttribute("aria-label", dockBtn.title);
    updateGraphLayout();
    requestAnimationFrame(() => {
      panel.style.transition = "";
    });
  };
  dockBtn.addEventListener("click", () => {
    const dock = lookupDock();
    const next = LOOKUP_DOCKS[(LOOKUP_DOCKS.indexOf(dock) + 1) % LOOKUP_DOCKS.length];
    try {
      localStorage.setItem(lookupDockKey(), next);
    } catch {}
    applyDock(next);
  });
  applyDock(savedLookupDock());
  // Crossing the breakpoint (rotation, window resize) switches to that
  // viewport's own remembered dock.
  let wasMobile = isMobileViewport();
  window.addEventListener("resize", () => {
    if (isMobileViewport() === wasMobile) return;
    wasMobile = isMobileViewport();
    applyDock(savedLookupDock());
  });

  return panel;
}

function createNodeDetailsPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = "node-details-panel";
  panel.setAttribute("aria-label", "Detalhes do nó");
  panel.innerHTML = `
    <div id="node-details-header">
      <span id="node-details-title">Detalhes do nó</span>
      <button id="node-details-close">✕</button>
    </div>
    <div id="node-details-body"><div class="node-detail-empty">Clique em um nó para ver os atributos.</div></div>
  `;
  document.body.appendChild(panel);

  document
    .getElementById("node-details-close")!
    .addEventListener("click", () => {
      closePanel(panel);
    });

  // Docked to the top-right corner (top-left while the lookup panel docks
  // right; bottom-right beside it while it docks bottom, a bottom sheet on
  // a phone), deliberately not draggable — only width-resizable via
  // makeResizable's handle.
  const placeResizers = makeResizable(
    panel,
    () => {
      const dock = lookupDock();
      if (dock === "bottom" && isMobileViewport()) return "bottom";
      return dock === "right" ? "right" : "left";
    },
    updateGraphLayout,
  );
  document.getElementById("lookup-dock")?.addEventListener("click", placeResizers);
  // Opening/closing the card resizes the lookup panel and the graph when
  // both share the bottom strip — watch the class rather than every caller.
  new MutationObserver(updateGraphLayout).observe(panel, {
    attributes: true,
    attributeFilter: ["class"],
  });
  keepInertWhileClosed(panel);

  return panel;
}

function showNodeDetails(nodeId: string, graph: Graph) {
  const panel = document.getElementById("node-details-panel") as HTMLElement;
  const title = document.getElementById("node-details-title")!;
  const body = document.getElementById("node-details-body")!;
  const nodeLabel =
    valueText(graph.getNodeAttribute(nodeId, "label")) || nodeId;
  const nodeType = nodeTypeMap.get(nodeId) ?? "desconhecido";
  let details = nodeDetailsMap.get(nodeId) ?? [];

  // For group nodes, aggregate details from child leaf nodes
  if (nodeType === "group" && details.length === 0) {
    graph.neighbors(nodeId).forEach((neighbor) => {
      const neighborType = nodeTypeMap.get(neighbor);
      if (neighborType !== "group" && neighborType !== "empresa") {
        const neighborDetails = nodeDetailsMap.get(neighbor) ?? [];
        details = details.concat(neighborDetails);
      }
    });
  }

  title.textContent = nodeLabel;
  body.innerHTML = "";

  const SKIP_ATTRS = new Set([
    "x",
    "y",
    "size",
    "color",
    "type",
    "zIndex",
    "highlighted",
    "hidden",
    "forceLabel",
    "label",
    "fullLabel",
  ]);
  const attrs = graph.getNodeAttributes(nodeId);

  const meta = document.createElement("table");
  meta.className = "node-detail-meta node-detail-table";
  const metaRows = [
    `<tr><th>ID</th><td>${nodeId}</td></tr>`,
    `<tr><th>Tipo</th><td>${nodeType}</td></tr>`,
    ...Object.entries(attrs)
      .filter(([k]) => !SKIP_ATTRS.has(k))
      .map(([k, v]) => `<tr><th>${k}</th><td>${valueText(v)}</td></tr>`),
  ];
  meta.innerHTML = `<tbody>${metaRows.join("")}</tbody>`;
  // A sócio with a full CPF has id hashCpf(cpf) and an empresa node has its
  // cnpj_basico — the same public ids the generator publishes pages under, so
  // a node with its own page links straight to that entity's network.
  if (nodeId !== currentLookupCnpj && PUBLISHED_IDS.has(nodeId)) {
    const open = document.createElement("a");
    open.className = "cnpj-link node-entity-link";
    open.textContent = "abrir a rede desta entidade →";
    open.href = ENTITY_HREF_TEMPLATE.replace("__ID__", encodeURIComponent(nodeId));
    open.target = "_blank";
    open.rel = "noopener";
    body.appendChild(open);
  }
  body.appendChild(meta);

  const openPanel = () => {
    if (isMobileViewport()) {
      closePanel(document.getElementById("lookup-panel") as HTMLElement);
      updateGraphLayout();
    }
    panel.classList.add("open");
  };

  if (details.length === 0) {
    openPanel();
    return;
  }

  for (const detail of details) {
    const card = document.createElement("section");
    card.className = "node-detail-entry";

    const header = document.createElement("h4");
    header.textContent = `${detail.datasetLabel} · CNPJ raiz ${detail.relatedCompanyCnpj}`;
    card.appendChild(header);

    const table = document.createElement("table");
    table.className = "node-detail-table";
    const tbody = document.createElement("tbody");
    for (const [k, v] of Object.entries(detail.attributes)) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = k;
      const td = document.createElement("td");
      td.textContent = valueText(v);
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    body.appendChild(card);
  }

  openPanel();
}

const lazyTables = new WeakMap<HTMLElement, () => void>();

function ensureLookupTable(bodyDiv: HTMLElement) {
  const build = lazyTables.get(bodyDiv);
  if (!build) return;
  lazyTables.delete(bodyDiv);
  build();
}

// Rows are appended in pages of this size behind a "mostrar mais" button, so
// opening a 500-row dataset on a phone doesn't stall on one huge layout.
const LOOKUP_PAGE_SIZE = 100;

const PUBLISHED_IDS = new Set<string>(
  (window as unknown as { __PUBLISHED_IDS__?: string[] }).__PUBLISHED_IDS__ ?? [],
);
const ENTITY_HREF_TEMPLATE =
  (window as unknown as { __ENTITY_HREF__?: string }).__ENTITY_HREF__ ?? "?cnpj=__ID__";

function buildLookupTable(result: LookupResult, bodyDiv: HTMLElement) {
  const cols = Object.keys(result.rows[0]);
  const cnpjCols = new Set(result.cnpjColumnNames ?? []);
  const table = document.createElement("table");
  table.className = "lookup-table";
  const headRow = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    headRow.appendChild(th);
  }
  const thead = document.createElement("thead");
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);
  bodyDiv.appendChild(table);

  // One delegated listener per table instead of one per row.
  tbody.addEventListener("click", (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-row-signature]");
    if (!tr) return;
    const nodeIds = rowSignatureToNodeIds.get(tr.dataset.rowSignature!);
    if (!nodeIds || nodeIds.size === 0 || !currentGraph) return;
    const nodeId = [...nodeIds][0];
    selectedNode = nodeId;
    hoveredNode = null;
    renderer?.refresh({ skipIndexation: true });
    showNodeDetails(nodeId, currentGraph);
    syncLookupRowHighlight();
  });

  let rendered = 0;
  const more = document.createElement("button");
  more.type = "button";
  more.className = "lookup-more";
  const renderPage = () => {
    const frag = document.createDocumentFragment();
    const end = Math.min(rendered + LOOKUP_PAGE_SIZE, result.rows.length);
    for (let i = rendered; i < end; i++) {
      const row = result.rows[i];
      const tr = document.createElement("tr");
      const signature = rowSignature(result.id, row);
      tr.dataset.rowSignature = signature;
      tr.dataset.datasetId = result.id;
      // Rows beyond the generator's per-dataset graph cap (inGraph:false)
      // never got a Sigma node, so clicking them can't highlight anything
      // in the graph — mark them visually so that's clear before the click.
      if ((rowSignatureToNodeIds.get(signature)?.size ?? 0) === 0) tr.classList.add("row-no-node");
      for (const col of cols) {
        const val = row[col];
        const text = val == null ? "—" : String(val);
        const td = document.createElement("td");
        td.title = text;
        const basico = cnpjCols.has(col) && isCnpj(text) ? extractBasico(text) : "";
        if (basico && basico !== currentLookupCnpj && PUBLISHED_IDS.has(basico)) {
          const a = document.createElement("a");
          a.className = "cnpj-link";
          a.textContent = text;
          a.href = ENTITY_HREF_TEMPLATE.replace("__ID__", encodeURIComponent(basico));
          a.addEventListener("click", (e) => e.stopPropagation());
          td.appendChild(a);
        } else {
          td.textContent = text;
        }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    rendered = end;
    const left = result.rows.length - rendered;
    more.textContent = `mostrar mais ${Math.min(left, LOOKUP_PAGE_SIZE)} de ${left}`;
    more.hidden = left <= 0;
    syncLookupRowHighlight();
  };
  more.addEventListener("click", renderPage);
  bodyDiv.appendChild(more);
  renderPage();
}

function renderResultSections(
  results: LookupResult[],
  cnpj: string,
  graph: Graph,
) {
  const body = document.getElementById("lookup-body")!;
  body.innerHTML = "";
  let firstExpanded = false;

  // Sort: hits first, then empty
  const sorted = [...results].sort(
    (a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0),
  );

  for (const result of sorted) {
    const section = document.createElement("div");
    section.dataset.datasetId = result.id;
    const hasHits = result.count > 0;
    section.className = "lookup-section" + (hasHits ? "" : " empty");
    if (hasHits) section.classList.add("added");

    const header = document.createElement("div");
    header.className = "lookup-section-header";

    const datasetColor = DATASET_COLORS[result.id] ?? "#888888";

    header.innerHTML = `
      <span class="lookup-section-title">
        <span style="color:${datasetColor};margin-right:0.3em;font-size:0.85em">⦿</span>${result.label}
      </span>
      <div class="lookup-section-actions">
        ${hasHits ? `<span class="lookup-badge">${result.count}</span>` : ""}
        <span class="chevron">▶</span>
      </div>
    `;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "lookup-section-body";

    // Tables are built on first expand, not up front: a big entity (Banco do
    // Brasil) has ~60 datasets × up to 500 rows, which eagerly meant ~7k <tr>
    // and ~80k DOM nodes before anything was opened — the main cost of the
    // page, worst on mobile.
    if (hasHits && result.rows.length > 0) {
      lazyTables.set(bodyDiv, () => buildLookupTable(result, bodyDiv));
    }

    // Toggle body on header click — accordion: keep only one section expanded.
    header.addEventListener("click", () => {
      debugLog("lookup section click", {
        datasetId: result.id,
        datasetLabel: result.label,
        cnpj,
      });
      for (const openBody of body.querySelectorAll<HTMLElement>(
        ".lookup-section-body.expanded",
      )) {
        if (openBody !== bodyDiv) openBody.classList.remove("expanded");
      }
      for (const openHeader of body.querySelectorAll<HTMLElement>(
        ".lookup-section-header.expanded",
      )) {
        if (openHeader !== header) openHeader.classList.remove("expanded");
      }
      ensureLookupTable(bodyDiv);
      bodyDiv.classList.toggle("expanded");
      header.classList.toggle("expanded");
    });

    // Auto-expand first dataset that already has hits.
    if (!firstExpanded && hasHits) {
      firstExpanded = true;
      ensureLookupTable(bodyDiv);
      bodyDiv.classList.add("expanded");
      header.classList.add("expanded");
    }

    section.appendChild(header);
    section.appendChild(bodyDiv);
    body.appendChild(section);
  }
  syncLookupRowHighlight();
}

// `results` is always the precomputed set built from the static graph JSON —
// there is no live endpoint left to fall back to, so a missing/empty set just
// renders an empty panel rather than attempting (and failing) a fetch.
function openLookupPanel(
  cnpj: string,
  graph: Graph,
  results: LookupResult[],
) {
  const panel = document.getElementById("lookup-panel") as HTMLElement;
  const title = document.getElementById("lookup-title")!;
  const backBtn = document.getElementById("lookup-back") as HTMLButtonElement;

  currentLookupCnpj = cnpj;
  currentLookupLabel = cnpj; // updated below if razao_social available

  // The entity's own name, not "CNPJ: <id>" — for a pessoa the id is a CPF
  // hash, meaningless to a reader.
  const rootLabel = graph.hasNode(cnpj) ? valueText(graph.getNodeAttribute(cnpj, "fullLabel") ?? graph.getNodeAttribute(cnpj, "label")) : "";
  title.textContent = rootLabel && rootLabel !== "—" ? rootLabel : `CNPJ: ${cnpj}`;
  title.title = cnpj;
  backBtn.style.display = lookupHistory.length > 0 ? "inline-block" : "none";
  const hits = results.filter((result) => result.count > 0).length;
  const fab = document.getElementById("lookup-fab");
  if (fab) fab.textContent = `Bases · ${hits}`;
  // On a phone both panels are bottom sheets covering most of the screen —
  // start with the graph alone and let the "Bases" button open the list.
  if (isMobileViewport()) {
    closePanel(document.getElementById("node-details-panel") as HTMLElement);
  } else {
    panel.classList.add("open");
  }
  updateGraphLayout();

  setStatus(`${hits} base(s) com referência`);
  renderResultSections(results, cnpj, graph);
}

// --- Init ---
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// The topmost visible node whose drawn disc contains the viewport point —
// a CPU stand-in for Sigma's GPU picking (see the clickStage handler).
function nodeAtViewport(r: Sigma, x: number, y: number): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const node of r.getGraph().nodes()) {
    const data = r.getNodeDisplayData(node);
    if (!data || data.hidden) continue;
    const p = r.framedGraphToViewport(data);
    const radius = r.scaleSize(data.size);
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance <= radius && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

async function init() {
  const params = new URLSearchParams(location.search);
  // Dev server: id comes from the ?cnpj= query param (one shared page, "/").
  // Static build (scripts/build-site.ts): each entity gets its own HTML file
  // with no query string, so the id is baked in as window.__ENTITY_ID__.
  const cnpj = params.get("cnpj") ??
    (window as unknown as { __ENTITY_ID__?: string }).__ENTITY_ID__ ?? null;
  currentLookupLimit = sanitizeLookupLimit(params.get("qlimit"));
  const container = document.getElementById(
    "graph-container",
  ) as HTMLDivElement;

  if (!cnpj) {
    setStatus("CNPJ não informado na URL.");
    return;
  }

  injectPanelStyles();
  createPanel();
  createNodeDetailsPanel();

  setStatus("Carregando dados…");

  let data: GraphData;
  try {
    data = await fetchGraph(cnpj);
  } catch (e) {
    console.error("[fetch]", e);
    // Nothing to list: "Bases" would open an empty panel.
    document.getElementById("lookup-fab")?.remove();
    showLoadFailure(
      "Não foi possível baixar os dados desta rede. Verifique a conexão e tente de novo.",
      true,
    );
    return;
  }

  const graph = new Graph();
  currentGraph = graph;

  // The root is the entity's own node (id = the page's cnpj_basico or CPF
  // hash). A pessoa's network lists its companies as empresa nodes too, so
  // "first empresa node" would put one of them at the center.
  const rootNode = data.nodes.find((n) => n.id === cnpj) ?? data.nodes.find((n) => n.type === "empresa");
  const rootId = rootNode?.id ?? cnpj;
  layoutRootId = rootId;
  // Update breadcrumb with company name
  const bcLabel = document.getElementById("bc-label");
  if (bcLabel && rootNode?.label) bcLabel.textContent = rootNode.label;
  // n.inGraph === false: overflow row beyond the generator's per-dataset cap.
  // Still shows up in the lookup panel's table (built separately from
  // data.nodes below), but must not become a visual node — skip entirely
  // here so it's never added to Sigma, grouped under a hub, or clickable.
  for (const n of data.nodes) {
    if (n.inGraph === false) continue;
    knownNodeIds.add(n.id);
    nodeTypeMap.set(n.id, n.type);
    graph.addNode(
      n.id,
      n.datasetId
        ? nodeAttrs(n.type, n.label, { datasetId: n.datasetId })
        : nodeAttrs(n.type, n.label, {
            empresaId: rootId,
            isRoot: n.id === rootId,
          }),
    );
    if (n.datasetId && n.row) {
      trackNodeDetail(n.id, n.datasetId, n.datasetLabel ?? n.datasetId, rootId, n.row);
      const signature = rowSignature(n.datasetId, n.row);
      if (!rowSignatureToNodeIds.has(signature)) {
        rowSignatureToNodeIds.set(signature, new Set<string>());
      }
      rowSignatureToNodeIds.get(signature)!.add(n.id);
    }
  }

  // Group socios under a "Sócios" hub node instead of direct empresa→socio edges.
  // On a pessoa page the root is itself a socio node — never group it.
  const socioNodes = data.nodes.filter((n) => n.type === "socio" && n.id !== rootId && n.inGraph !== false);
  const socioIds = new Set(socioNodes.map((n) => n.id));
  if (socioNodes.length > 0) {
    const socioGroupId = `group:${rootId}:socios`;
    ensureGroupNode(graph, socioGroupId, "Sócios", NODE_COLORS.socio, rootId);
    for (const n of socioNodes) {
      const edgeKey = `${socioGroupId}→${n.id}`;
      knownLinkKeys.add(edgeKey);
      if (!graph.hasEdge(socioGroupId, n.id)) {
        graph.addEdge(socioGroupId, n.id, edgeAttrs());
      }
    }
  }

  // A pessoa's companies (non-dataset empresa nodes) hang off an "Empresas"
  // hub, the mirror of the "Sócios" hub on an empresa page.
  const empresaIds = new Set<string>();
  if (rootNode && rootNode.type !== "empresa") {
    const empresaNodes = data.nodes.filter((n) => n.type === "empresa" && !n.datasetId && n.id !== rootId && n.inGraph !== false);
    if (empresaNodes.length > 0) {
      const empresaGroupId = `group:${rootId}:empresas`;
      ensureGroupNode(graph, empresaGroupId, "Empresas", NODE_COLORS.empresa, rootId);
      for (const n of empresaNodes) {
        empresaIds.add(n.id);
        knownLinkKeys.add(`${empresaGroupId}→${n.id}`);
        if (!graph.hasEdge(empresaGroupId, n.id)) graph.addEdge(empresaGroupId, n.id, edgeAttrs());
      }
    }
  }

  // Group every cross-dataset node under a per-dataset hub node (e.g. "CGU ·
  // Contratos") instead of wiring each dataset hit straight to the root
  // company — otherwise a company with dozens of hits across ~40 datasets
  // renders as one indistinguishable starburst off the root.
  const datasetGroupIds = new Set<string>();
  for (const n of data.nodes) {
    if (!n.datasetId) continue;
    const groupId = `group:${rootId}:${n.datasetId}`;
    if (!datasetGroupIds.has(groupId)) {
      datasetGroupIds.add(groupId);
      const groupColor = DATASET_COLORS[n.datasetId] ?? "#888888";
      ensureGroupNode(graph, groupId, n.datasetLabel ?? n.datasetId, groupColor, rootId);
    }
    const edgeKey = `${groupId}→${n.id}`;
    knownLinkKeys.add(edgeKey);
    if (graph.hasNode(groupId) && graph.hasNode(n.id) && !graph.hasEdge(groupId, n.id)) {
      graph.addEdge(groupId, n.id, edgeAttrs());
    }
  }

  // Any remaining link not covered by the sócios/dataset grouping above
  // (e.g. empresa→empresa edges from holdings/ownership hits).
  const groupedIds = new Set<string>([...socioIds, ...empresaIds, ...data.nodes.filter((n) => n.datasetId).map((n) => n.id)]);
  for (const l of data.links) {
    if (groupedIds.has(l.source) || groupedIds.has(l.target)) continue;
    knownLinkKeys.add(`${l.source}→${l.target}`);
    if (
      graph.hasNode(l.source) &&
      graph.hasNode(l.target) &&
      !graph.hasEdge(l.source, l.target)
    ) {
      graph.addEdge(l.source, l.target, edgeAttrs());
    }
  }

  const sigmaSettings: ConstructorParameters<typeof Sigma>[2] = {
    renderEdgeLabels: false,
    defaultEdgeType: "curved",
    edgeProgramClasses: { curved: createEdgeCurveProgram() },
    defaultDrawNodeLabel: drawLabelInsideNode,
    defaultDrawNodeHover: drawHoverInsideNode,
    labelRenderedSizeThreshold: 8,
    labelFont: "'Inter', system-ui, sans-serif",
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: "#c8d0e0" },
    nodeReducer: (node, data) => {
      const res = { ...data };
      if (currentLayout === "radial-compact" && compactHiddenNodeIds.has(node)) {
        return { ...res, hidden: true };
      }
      const overflowLabel = currentLayout === "radial-compact"
        ? compactOverflowLabels.get(node)
        : undefined;
      if (overflowLabel) {
        res.label = overflowLabel;
        res.fullLabel = overflowLabel;
        res.color = "#5a5a6a";
      }
      const alwaysShowLabels = currentLayout === "collapsible-tree" || !!overflowLabel;
      if (alwaysShowLabels && res.fullLabel) {
        res.label = res.fullLabel as string;
      }
      // Restore label for leaf nodes on hover
      if (!res.label && res.fullLabel) {
        if (hoveredNode === node || selectedNode === node) {
          res.label = res.fullLabel as string;
        }
      }
      if (selectedNode !== null) {
        const isSelected = node === selectedNode;
        const isNeighbor =
          renderer?.getGraph().hasEdge(selectedNode, node) ||
          renderer?.getGraph().hasEdge(node, selectedNode);
        if (isSelected) {
          res.highlighted = true;
          res.color = COLOR_SELECTED;
          res.size = ((data.size as number) ?? 12) * 1.25;
          res.zIndex = 10;
        } else if (isNeighbor) {
          res.zIndex = 5;
        } else {
          res.color = COLOR_FADE_NODE;
          if (!alwaysShowLabels) res.label = "";
          res.zIndex = 0;
        }
      } else if (hoveredNode !== null) {
        if (node === hoveredNode) {
          res.size = ((data.size as number) ?? 12) * 1.15;
          res.zIndex = 10;
        }
      }
      return res;
    },
    edgeReducer: (edge, data) => {
      const res = { ...data };
      const g = renderer?.getGraph();
      if (currentLayout === "radial-compact" && g) {
        const src = g.source(edge);
        const tgt = g.target(edge);
        if (compactHiddenNodeIds.has(src) || compactHiddenNodeIds.has(tgt)) {
          return { ...res, hidden: true };
        }
      }
      if (currentLayout === "collapsible-tree") {
        res.type = "line";
        res.size = 1;
        res.color = "rgba(96,122,176,0.45)";
      }
      if (selectedNode !== null) {
        const src = g?.source(edge);
        const tgt = g?.target(edge);
        const touchesSelected = src === selectedNode || tgt === selectedNode;
        if (touchesSelected) {
          res.color = COLOR_EDGE_HOVER;
          res.size = currentLayout === "collapsible-tree" ? 1.5 : 2;
          res.zIndex = 5;
        } else {
          res.color = COLOR_FADE_EDGE;
          res.size = currentLayout === "collapsible-tree" ? 0.25 : 0.5;
          res.zIndex = 0;
        }
      } else if (hoveredNode !== null) {
        const src = g?.source(edge);
        const tgt = g?.target(edge);
        if (src === hoveredNode || tgt === hoveredNode) {
          res.color = COLOR_EDGE_HOVER;
          res.size = currentLayout === "collapsible-tree" ? 1.5 : 2;
        } else {
          res.color = interpolateColor(COLOR_EDGE_BASE, COLOR_FADE_EDGE, 0.6);
          res.size = currentLayout === "collapsible-tree" ? 0.5 : 0.8;
        }
      }
      return res;
    },
  };

  // Sigma draws with WebGL. Without it (Tor "Safer", blocklisted GPUs, a
  // context the browser refuses) the dataset tables below still work, so
  // say what's missing instead of spinning for ever.
  let canDraw = hasWebGL();
  const mountRenderer = () => {
    renderer = new Sigma(graph, container, sigmaSettings);
    // Handle for scripts/test_platforms.py (and the console) to reach the graph.
    (window as unknown as { __sigma: Sigma }).__sigma = renderer;
    bindRenderer(renderer);
    // A backgrounded tab can lose its WebGL context (iOS does it routinely);
    // Sigma never rebuilds its programs, so the graph stayed blank. Allow the
    // restore (preventDefault) and remount a fresh renderer on it.
    let remounting = false;
    for (const canvas of container.querySelectorAll("canvas")) {
      canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
      canvas.addEventListener("webglcontextrestored", () => {
        if (remounting) return;
        remounting = true;
        requestAnimationFrame(() => {
          renderer?.kill();
          mountRenderer();
        });
      });
    }
  };
  if (canDraw) {
    try {
      mountRenderer();
    } catch (e) {
      console.error("[sigma]", e);
      canDraw = false;
    }
  }

  runLayout(graph, 200);

  // Layout select box
  const layoutSelect = document.getElementById("layout-select") as HTMLSelectElement | null;
  if (layoutSelect) {
    layoutSelect.value = currentLayout;
    layoutSelect.addEventListener("change", () => {
      currentLayout = layoutSelect.value as typeof currentLayout;
      runLayout(graph, 200);
    });
  }
  const queryLimitSelect = document.getElementById(
    "query-limit-select",
  ) as HTMLSelectElement | null;
  if (queryLimitSelect) {
    queryLimitSelect.value = lookupLimitParam();
    queryLimitSelect.addEventListener("change", () => {
      currentLookupLimit = sanitizeLookupLimit(queryLimitSelect.value);
      queryLimitSelect.value = lookupLimitParam();
      const next = new URL(location.href);
      next.searchParams.set("qlimit", lookupLimitParam());
      location.href = next.toString();
    });
  }

  // Build the lookup panel straight from the precomputed graph JSON — no
  // fetch involved. Deliberately includes inGraph:false nodes too (the
  // generator's overflow rows beyond its per-dataset graph cap): the panel's
  // row count/table always reflects every hit, even for datasets where only
  // a subset became visual graph nodes above. Datasets with no hits still
  // get a row (count 0, empty) to match the old panel's full dataset listing.
  const overlay = document.getElementById("loading-overlay");
  const nodesByDataset = new Map<string, GraphNode[]>();
  for (const n of data.nodes) {
    if (!n.datasetId) continue;
    if (!nodesByDataset.has(n.datasetId)) nodesByDataset.set(n.datasetId, []);
    nodesByDataset.get(n.datasetId)!.push(n);
  }
  const lookupResults: LookupResult[] = Object.entries(DATASET_META).map(
    ([id, meta]) => {
      const nodes = nodesByDataset.get(id) ?? [];
      if (nodes.length > 0) autoAddedDatasets.add(id);
      return {
        id,
        label: meta.label,
        count: nodes.length,
        rows: sortRowsNewestFirst(
          nodes.map((n) => n.row ?? { [meta.nodeLabelField ?? "label"]: n.label }),
        ),
        cnpjColumnNames: meta.cnpjColumnNames,
        nodeType: meta.nodeType,
        nodeIdField: meta.nodeIdField,
        nodeLabelField: meta.nodeLabelField,
      };
    },
  );
  if (canDraw) {
    if (overlay) overlay.style.display = "none";
  } else {
    showLoadFailure(
      "Este navegador não oferece WebGL, então o grafo não pode ser desenhado. As tabelas das bases continuam no painel.",
    );
  }
  openLookupPanel(rootId, graph, lookupResults);
  if (!isMobileViewport()) showNodeDetails(rootId, graph);

  // Everything bound to a renderer, so a remount (after a lost WebGL
  // context) rebinds it — declared, hence hoisted for mountRenderer above.
  function bindRenderer(r: Sigma) {
    // Node dragging
    let draggedNode: string | null = null;
    let isDragging = false;
    let dragOffset = { dx: 0, dy: 0 };

    r.on("downNode", ({ node, event }) => {
      draggedNode = node;
      isDragging = false;
      r.getCamera().disable();
      const mousePos = r.viewportToGraph({
        x: event.x,
        y: event.y,
      });
      const nodeX = graph.getNodeAttribute(node, "x") as number;
      const nodeY = graph.getNodeAttribute(node, "y") as number;
      dragOffset = { dx: nodeX - mousePos.x, dy: nodeY - mousePos.y };
    });

    r.getMouseCaptor().on("mousemovebody", (e) => {
      if (!draggedNode) return;
      isDragging = true;
      const pos = r.viewportToGraph({ x: e.x, y: e.y });
      graph.setNodeAttribute(draggedNode, "x", pos.x + dragOffset.dx);
      graph.setNodeAttribute(draggedNode, "y", pos.y + dragOffset.dy);
    });

    r.getMouseCaptor().on("mouseup", () => {
      if (draggedNode && !isDragging) {
        // treat as click — already handled by clickNode
      }
      draggedNode = null;
      isDragging = false;
      r.getCamera().enable();
    });

    r.on("enterNode", ({ node }) => {
      hoveredNode = node;
      r.refresh({ skipIndexation: true });
    });

    r.on("leaveNode", () => {
      hoveredNode = null;
      r.refresh({ skipIndexation: true });
    });

    r.on("clickStage", ({ event }) => {
      // Sigma finds the clicked node by reading back a picking buffer. Firefox's
      // resistFingerprinting (LibreWolf, Tor, Mullvad) garbles that readback,
      // so every click landed on the stage. Check the geometry on the CPU
      // before treating it as a click on empty space.
      const hit = nodeAtViewport(r, event.x, event.y);
      if (hit) {
        selectNode(hit);
        return;
      }
      selectedNode = null;
      r.refresh({ skipIndexation: true });
      syncLookupRowHighlight();
    });

    r.on("clickNode", ({ node }) => selectNode(node));

    function selectNode(node: string) {
      selectedNode = selectedNode === node ? null : node;
      hoveredNode = null;
      r.refresh({ skipIndexation: true });
      syncLookupRowHighlight();

      const nodeType = nodeTypeMap.get(node);
      if (nodeType === "group") {
        const datasetId = node.startsWith("group:")
          ? node.split(":").slice(2).join(":")
          : "";
        if (datasetId && datasetId !== "socios") focusLookupSection(datasetId);
      }
      showNodeDetails(node, graph);
    }
  }
}

init().catch((e) => {
  console.error(e);
  showLoadFailure(`Erro ao montar a rede: ${(e as Error).message}`, true);
});
