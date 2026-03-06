import Graph from "graphology";
import Sigma from "sigma";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { drawDiscNodeLabel, drawDiscNodeHover } from "sigma/rendering";
import { NodeSquareProgram, NodeDiamondProgram } from "./node-shape-programs";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";

interface GraphNode {
  id: string;
  label: string;
  type: string;
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

interface LookupResponse {
  cnpj: string;
  results: LookupResult[];
}

interface LookupDatasetResponse {
  cnpj: string;
  result: LookupResult;
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
const queriedDatasetKeys = new Set<string>();
let renderer: Sigma | null = null;
let isExpanding = false;
let hoveredNode: string | null = null;
let selectedNode: string | null = null;
let layoutRootId = "";
let currentLayout: "radial" | "circular" | "forceatlas2" = "radial";

// Dataset colors injected server-side via window.__DATASET_COLORS
const DATASET_COLORS: Record<string, string> =
  (window as unknown as { __DATASET_COLORS?: Record<string, string> })
    .__DATASET_COLORS ?? {};

interface RelatedLookupConfig {
  datasetId: string;
  localKey: string;
  foreignKey: string;
}
// Related dataset expansion rules injected server-side
const DATASET_RELATIONS: Record<string, RelatedLookupConfig[]> =
  (
    window as unknown as {
      __DATASET_RELATIONS?: Record<string, RelatedLookupConfig[]>;
    }
  ).__DATASET_RELATIONS ?? {};

// Tracks already-expanded related lookups to avoid duplicate fetches
const expandedRelatedKeys = new Set<string>();

// Tracks which dataset IDs were auto-added on init (to avoid duplicate adds from panel)
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

function extractLookupBasicoFromNode(nodeId: string): string | null {
  const idDigits = nodeId.replace(/\D/g, "");
  if (idDigits.length === 8) return idDigits;
  if (idDigits.length === 14) return idDigits.slice(0, 8);

  const details = nodeDetailsMap.get(nodeId) ?? [];
  for (const detail of details) {
    for (const [k, v] of Object.entries(detail.attributes)) {
      if (!/cnpj/i.test(k)) continue;
      const raw = String(v ?? "");
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 8) return digits;
      if (digits.length === 14) return digits.slice(0, 8);
    }
  }
  return null;
}

function setStatus(msg: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function debugLog(...args: unknown[]) {
  if (!DEBUG_LOOKUP) return;
  console.log("[lookup-debug]", ...args);
}

async function fetchGraph(cnpj: string): Promise<GraphData> {
  debugLog("GET /api/graph", { cnpj });
  const res = await fetch(`/api/graph/${cnpj}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  debugLog("GET /api/graph done", { cnpj, status: res.status });
  return res.json() as Promise<GraphData>;
}

async function fetchLookupDataset(
  cnpj: string,
  datasetId: string,
): Promise<LookupResult> {
  debugLog("GET /api/lookup/:cnpj/dataset/:datasetId", { cnpj, datasetId });
  const res = await fetch(
    `/api/lookup/${cnpj}/dataset/${encodeURIComponent(datasetId)}?fresh=1`,
  );
  if (!res.ok) throw new Error(`Lookup dataset API error ${res.status}`);
  const payload = (await res.json()) as LookupDatasetResponse;
  debugLog("GET dataset done", {
    cnpj,
    datasetId,
    status: res.status,
    rows: payload.result.rows.length,
    count: payload.result.count,
    queryError: payload.result.queryError,
  });
  return payload.result;
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

function nodeShapeType(type: string): string {
  if (type === "empresa") return "square";
  if (type === "socio") return "diamond";
  return "circle";
}

function nodeAttrs(
  type: string,
  label: string,
  opts?: string | { datasetId?: string; empresaId?: string; isRoot?: boolean },
) {
  const o = typeof opts === "string" ? { empresaId: opts } : (opts ?? {});
  const shapeType = nodeShapeType(type);
  // Leaf dataset nodes — smaller, labeled only on hover
  if (o.datasetId) {
    const color = DATASET_COLORS[o.datasetId] ?? NODE_COLORS[type] ?? "#888888";
    return {
      label: "",
      fullLabel: label,
      size: 9,
      color,
      type: shapeType,
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
    type: shapeType,
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
  const d = data as Record<string, unknown>;
  const nodeType = d.type as string | undefined;
  if (nodeType === "square" || nodeType === "diamond") {
    if (!data.label) return;
    const size = settings.labelSize ?? 12;
    const font = settings.labelFont ?? "sans-serif";
    const weight = settings.labelWeight ?? "500";
    ctx.font = `${weight} ${size}px ${font}`;

    const hs = data.size * 0.7; // half-side estimate

    if (d.isRoot) {
      // Root: full name shown as caption below — skip the inside label
      drawNodeLabelPill(ctx, data.label, data.x, data.y + hs + 5, size, "#e8b84b");
    } else {
      // Non-root: truncate to fit inside, draw centered
      const maxW = hs * 1.7;
      let label = data.label;
      if (ctx.measureText(label).width > maxW) {
        while (label.length > 1 && ctx.measureText(label + "…").width > maxW)
          label = label.slice(0, -1);
        label += "…";
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(label, data.x, data.y);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, data.x, data.y);
    }
  } else {
    if (!data.label) return;
    const size = settings.labelSize ?? 12;
    const font = settings.labelFont ?? "sans-serif";
    const weight = settings.labelWeight ?? "500";
    const color = (settings.labelColor as { color?: string }).color ?? "#000";
    const tx = data.x + data.size + 3;
    const ty = data.y + size / 3;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000";
    ctx.strokeText(data.label, tx, ty);
    ctx.fillStyle = color;
    ctx.fillText(data.label, tx, ty);
  }
}

function drawHoverInsideNode(
  ctx: CanvasRenderingContext2D,
  data: Parameters<typeof drawDiscNodeHover>[1],
  settings: Parameters<typeof drawDiscNodeHover>[2],
): void {
  const d = data as Record<string, unknown>;
  const nodeType = d.type as string | undefined;
  if (nodeType === "square" || nodeType === "diamond") {
    if (!data.label || d.isRoot) return; // root caption always visible; nothing extra needed
    const size = settings.labelSize ?? 12;
    const font = settings.labelFont ?? "sans-serif";
    const weight = settings.labelWeight ?? "500";
    ctx.font = `${weight} ${size}px ${font}`;
    drawNodeLabelPill(ctx, data.label, data.x, data.y + data.size * 0.7 + 5, size);
  }
  // circles: label already drawn by drawLabelInsideNode; nodeReducer enlarges on hover — no extra rendering needed
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

function runLayout(graph: Graph, _iterations: number, onDone?: () => void) {
  requestAnimationFrame(() => {
    if (currentLayout === "circular") {
      circular.assign(graph);
    } else if (currentLayout === "forceatlas2") {
      const settings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, { iterations: 150, settings });
    } else {
      radialLayout(graph);
    }
    renderer?.refresh();
    onDone?.();
  });
}

async function expandRelatedDatasets(nodeId: string, graph: Graph) {
  const details = nodeDetailsMap.get(nodeId) ?? [];
  for (const detail of details) {
    const relations = DATASET_RELATIONS[detail.datasetId];
    if (!relations?.length) continue;
    for (const rel of relations) {
      const value = detail.attributes[rel.localKey];
      if (!value) continue;
      const expandKey = `${rel.datasetId}:${rel.foreignKey}:${value}`;
      if (expandedRelatedKeys.has(expandKey)) continue;
      expandedRelatedKeys.add(expandKey);
      try {
        const url = `/api/lookup/related?datasetId=${encodeURIComponent(rel.datasetId)}&foreignKey=${encodeURIComponent(rel.foreignKey)}&value=${encodeURIComponent(String(value))}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const { result } = (await res.json()) as { result: LookupResult };
        if (result.rows.length > 0) addResultsToGraph(result, nodeId, graph);
      } catch {
        // silently skip failed related lookups
      }
    }
  }
}

async function expandNode(id: string, graph: Graph) {
  if (isExpanding) return;
  isExpanding = true;
  setStatus(`Carregando conexões de ${id}…`);
  try {
    const data = await fetchGraph(id);
    const newNodes = data.nodes.filter((n) => !knownNodeIds.has(n.id));
    const newLinks = data.links.filter((l) => {
      const k = `${l.source}→${l.target}`;
      if (knownLinkKeys.has(k)) return false;
      knownLinkKeys.add(k);
      return true;
    });

    for (const n of newNodes) {
      knownNodeIds.add(n.id);
      nodeTypeMap.set(n.id, n.type);
      graph.addNode(
        n.id,
        nodeAttrs(n.type, n.label, n.type === "empresa" ? n.id : id),
      );
    }
    for (const l of newLinks) {
      if (
        graph.hasNode(l.source) &&
        graph.hasNode(l.target) &&
        !graph.hasEdge(l.source, l.target)
      ) {
        graph.addEdge(l.source, l.target, edgeAttrs());
      }
    }

    if (newNodes.length > 0) {
      runLayout(graph, 150, () => {
        setStatus(`+${newNodes.length} nó(s) adicionado(s)`);
      });
    } else {
      setStatus("Nenhum nó novo encontrado");
    }
  } catch (e) {
    setStatus(`Erro: ${(e as Error).message}`);
  } finally {
    isExpanding = false;
  }
}

// --- Lookup Panel ---

function injectPanelStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #lookup-panel {
      position: fixed;
      top: 46px;
      right: 0;
      width: 420px;
      min-width: 320px;
      max-width: 85vw;
      height: calc(100vh - 46px - 30px);
      min-height: calc(100vh - 46px - 30px);
      max-height: calc(100vh - 46px - 30px);
      background: #0f0f22;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.25s ease;
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
      font-family: system-ui, sans-serif;
      font-size: 0.85rem;
    }
    #lookup-panel.open {
      transform: translateX(0);
    }
    #lookup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #080814;
      border-bottom: 1px solid #23234a;
      flex-shrink: 0;
      cursor: grab;
      user-select: none;
    }
    #lookup-header:active { cursor: grabbing; }
    #lookup-title {
      font-weight: 700;
      font-size: 0.9rem;
      color: #a5b4fc;
    }
    #lookup-close {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    #lookup-close:hover {
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
      left: 0;
      width: 360px;
      height: calc(100vh - 46px - 30px);
      background: #0c1024;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      z-index: 1000;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      box-shadow: 4px 0 20px rgba(0,0,0,0.45);
      font-family: system-ui, sans-serif;
      font-size: 0.82rem;
    }
    #node-details-panel.open {
      transform: translateX(0);
    }
    #node-details-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid #23234a;
      background: #080814;
      cursor: grab;
      user-select: none;
    }
    #node-details-header:active { cursor: grabbing; }
    #node-details-title {
      color: #93c5fd;
      font-weight: 700;
      font-size: 0.86rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-right: 0.5rem;
    }
    #node-details-close {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      border-radius: 4px;
      font-size: 1rem;
      padding: 0.25rem 0.45rem;
    }
    #node-details-close:hover {
      background: #1f2937;
      color: #fff;
    }
    #node-details-body {
      overflow-y: auto;
      padding: 0.55rem 0.7rem 0.8rem;
      flex: 1;
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
      font-size: 9px;
    }
    .node-detail-empty {
      color: #9ca3af;
      font-style: italic;
      padding: 0.4rem 0.2rem;
    }
  `;
  document.head.appendChild(style);
}

function makeDraggable(panel: HTMLElement, handleId: string) {
  const handle = document.getElementById(handleId)!;
  let dragging = false;
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;

  handle.addEventListener("mousedown", (e) => {
    if (!panel.classList.contains("open")) return;
    // Don't drag when clicking buttons inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    panel.style.transform = "none";
    panel.style.transition = "none";
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panel.style.left = startLeft + (e.clientX - startX) + "px";
    panel.style.top = startTop + (e.clientY - startY) + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function makeResizable(panel: HTMLElement, edge: "left" | "right") {
  const resizer = document.createElement("div");
  resizer.style.cssText = `
    position: absolute;
    ${edge}: 0;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: ew-resize;
    z-index: 10;
    background: transparent;
  `;
  panel.appendChild(resizer);

  let resizing = false;
  let startX = 0,
    startW = 0;

  resizer.addEventListener("mousedown", (e) => {
    resizing = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    panel.style.transition = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const newW = edge === "right" ? startW + dx : startW - dx;
    if (newW >= 240 && newW <= window.innerWidth * 0.9) {
      panel.style.width = newW + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    resizing = false;
  });
}

function resetPanelPosition(panel: HTMLElement) {
  panel.style.left = "";
  panel.style.right = "";
  panel.style.top = "";
  panel.style.transform = "";
  panel.style.transition = "";
}

function createPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = "lookup-panel";
  panel.innerHTML = `
    <div id="lookup-header">
      <button id="lookup-back" style="display:none">← Voltar</button>
      <span id="lookup-title">CNPJ</span>
      <button id="lookup-close">✕</button>
    </div>
    <div id="lookup-body"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById("lookup-close")!.addEventListener("click", () => {
    resetPanelPosition(panel);
    panel.classList.remove("open");
    lookupHistory.length = 0;
  });

  makeDraggable(panel, "lookup-header");
  makeResizable(panel, "left");

  return panel;
}

function createNodeDetailsPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = "node-details-panel";
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
      resetPanelPosition(panel);
      panel.classList.remove("open");
    });

  makeDraggable(panel, "node-details-header");
  makeResizable(panel, "right");

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
  body.appendChild(meta);

  if (details.length === 0) {
    panel.classList.add("open");
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

  panel.classList.add("open");
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
    const hasHits = result.count > 0;
    section.className = "lookup-section" + (hasHits ? "" : " empty");
    const canAddToGraph = true;
    let datasetAdded = autoAddedDatasets.has(result.id);

    const header = document.createElement("div");
    header.className = "lookup-section-header";

    const datasetColor = DATASET_COLORS[result.id] ?? "#888888";
    const actionsHtml =
      canAddToGraph && hasHits && !datasetAdded
        ? `<button class="lookup-add-btn" data-id="${result.id}">+ Grafo</button>`
        : "";

    header.innerHTML = `
      <span class="lookup-section-title">
        <span style="color:${datasetColor};margin-right:0.3em;font-size:0.85em">⦿</span>${result.label}
      </span>
      <div class="lookup-section-actions">
        ${hasHits ? `<span class="lookup-badge">${result.count}${result.count === 10 ? "+" : ""}</span>` : ""}
        ${actionsHtml}
        <span class="chevron">▶</span>
      </div>
    `;
    if (datasetAdded) section.classList.add("added");

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "lookup-section-body";

    if (hasHits && result.rows.length > 0) {
      const cols = Object.keys(result.rows[0]);
      const cnpjCols = new Set(result.cnpjColumnNames ?? []);
      const tHead = cols.map((c) => `<th>${c}</th>`).join("");

      const table = document.createElement("table");
      table.className = "lookup-table";
      table.innerHTML = `<thead><tr>${tHead}</tr></thead><tbody></tbody>`;
      const tbody = table.querySelector("tbody")!;

      for (const row of result.rows) {
        const tr = document.createElement("tr");
        for (const col of cols) {
          const val = row[col];
          const text = val == null ? "—" : String(val);
          const td = document.createElement("td");
          td.title = text;

          if (cnpjCols.has(col) && isCnpj(text)) {
            const span = document.createElement("span");
            span.className = "cnpj-link";
            span.textContent = text;
            span.addEventListener("click", () => {
              const basico = extractBasico(text);
              lookupHistory.push({
                cnpj: currentLookupCnpj,
                label: currentLookupLabel,
              });
              openLookupPanel(basico, graph);
            });
            td.appendChild(span);
          } else {
            td.textContent = text;
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      bodyDiv.appendChild(table);
    }

    // Toggle body on header click
    const datasetKey = `${cnpj}:${result.id}`;
    const queryAndAddDataset = async () => {
      if (!canAddToGraph || datasetAdded || queriedDatasetKeys.has(datasetKey))
        return;
      queriedDatasetKeys.add(datasetKey);
      const btn = header.querySelector<HTMLButtonElement>(".lookup-add-btn");
      if (btn) {
        btn.textContent = "Consultando...";
        btn.disabled = true;
      }
      try {
        const freshResult = await fetchLookupDataset(cnpj, result.id);
        if (freshResult.queryError) {
          throw new Error(freshResult.queryError);
        }
        addResultsToGraph(freshResult, cnpj, graph);
        if (!freshResult.rows.length) {
          if (btn) btn.remove();
          setStatus(
            `Dataset "${result.label}" não retornou registros para ${cnpj}.`,
          );
        } else {
          datasetAdded = true;
          section.classList.add("added");
          if (btn) btn.remove();
        }
      } catch (e) {
        queriedDatasetKeys.delete(datasetKey);
        if (btn) {
          btn.textContent = "+ Grafo";
          btn.disabled = false;
        }
        setStatus(
          `Erro ao consultar dataset ${result.label}: ${(e as Error).message}`,
        );
      }
    };

    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("lookup-add-btn"))
        return;
      debugLog("lookup section click", {
        datasetId: result.id,
        datasetLabel: result.label,
        cnpj,
      });
      // Accordion behavior: keep only one dataset expanded at a time.
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
      const isExpanded = bodyDiv.classList.toggle("expanded");
      header.classList.toggle("expanded", isExpanded);
      if (isExpanded) void queryAndAddDataset();
    });

    // Auto-expand first dataset that already has hits.
    if (!firstExpanded && hasHits) {
      firstExpanded = true;
      bodyDiv.classList.add("expanded");
      header.classList.add("expanded");
      void queryAndAddDataset();
    }

    // "Add to graph" button
    const btn = header.querySelector<HTMLButtonElement>(".lookup-add-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (datasetAdded) return;
        header.click();
      });
    }

    section.appendChild(header);
    section.appendChild(bodyDiv);
    body.appendChild(section);
  }
}

function addResultsToGraph(
  result: LookupResult,
  companyCnpj: string,
  graph: Graph,
) {
  const newNodes: Array<{ id: string; label: string }> = [];

  const groupId = `group:${companyCnpj}:${result.id}`;
  const groupColor = DATASET_COLORS[result.id] ?? "#888888";
  ensureGroupNode(graph, groupId, result.label, groupColor, companyCnpj);

  // Track IDs seen within this batch so duplicate-CNPJ rows each get their own node
  const seenInBatch = new Set<string>();

  for (const [idx, row] of result.rows.entries()) {
    let nodeId = inferNodeId(result, row, companyCnpj, idx);
    const nodeLabel = inferNodeLabel(result, row, nodeId);
    const nodeType = result.nodeType ?? "registro";
    if (!nodeId) continue;

    // If this exact nodeId already appeared earlier in the same batch, make it unique
    if (seenInBatch.has(nodeId)) {
      nodeId = `${result.id}:${companyCnpj}:${idx}`;
    }
    seenInBatch.add(nodeId);

    trackNodeDetail(nodeId, result.id, result.label, companyCnpj, row);
    if (!knownNodeIds.has(nodeId)) {
      knownNodeIds.add(nodeId);
      nodeTypeMap.set(nodeId, nodeType);
      graph.addNode(
        nodeId,
        nodeAttrs(nodeType, nodeLabel, { datasetId: result.id }),
      );
      newNodes.push({ id: nodeId, label: nodeLabel });
    }
    const edgeKey = `${groupId}→${nodeId}`;
    if (
      !knownLinkKeys.has(edgeKey) &&
      graph.hasNode(groupId) &&
      graph.hasNode(nodeId)
    ) {
      knownLinkKeys.add(edgeKey);
      if (!graph.hasEdge(groupId, nodeId)) {
        graph.addEdge(groupId, nodeId, edgeAttrs());
      }
    }
  }

  if (newNodes.length > 0) {
    runLayout(graph, 100, () => {
      setStatus(`+${newNodes.length} nó(s) de "${result.label}" adicionado(s)`);
    });
  } else {
    setStatus(`Nenhum nó novo para "${result.label}".`);
  }
}

function inferNodeId(
  result: LookupResult,
  row: Record<string, unknown>,
  companyCnpj: string,
  rowIndex: number,
): string {
  if (result.nodeIdField) {
    const direct = String(row[result.nodeIdField] ?? "").trim();
    if (direct) return direct;
  }

  for (const cnpjCol of result.cnpjColumnNames ?? []) {
    const raw = String(row[cnpjCol] ?? "").trim();
    if (!raw) continue;
    const normalized = raw.replace(/\D/g, "");
    if (normalized.length >= 8) return normalized;
  }

  const stable = Object.entries(row)
    .map(([k, v]) => `${k}=${valueText(v)}`)
    .join("|");
  return `${result.id}:${companyCnpj}:${rowIndex}:${stable}`;
}

function inferNodeLabel(
  result: LookupResult,
  row: Record<string, unknown>,
  fallbackId: string,
): string {
  if (result.nodeLabelField) {
    const direct = String(row[result.nodeLabelField] ?? "").trim();
    if (direct) return direct;
  }

  const preferred = [
    "nome_fornecedor",
    "nome_contratado",
    "nome_favorecido",
    "nome_doador",
    "nome",
    "razao_social",
    "nome_razao_social",
    "nome_fantasia",
    "objeto",
    "descricao",
  ];
  for (const key of preferred) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }

  return fallbackId;
}

async function openLookupPanel(
  cnpj: string,
  graph: Graph,
  skipHistory = false,
  prefetched?: LookupResult[],
) {
  const panel = document.getElementById("lookup-panel") as HTMLElement;
  const body = document.getElementById("lookup-body")!;
  const title = document.getElementById("lookup-title")!;
  const backBtn = document.getElementById("lookup-back") as HTMLButtonElement;

  if (!skipHistory) {
    // will be set after we know the label
  }

  currentLookupCnpj = cnpj;
  currentLookupLabel = cnpj; // updated below if razao_social available

  title.textContent = `CNPJ: ${cnpj}`;
  backBtn.style.display = lookupHistory.length > 0 ? "inline-block" : "none";

  body.innerHTML = `<div class="lookup-skeleton">Consultando ${30}+ bases de dados…</div>`;
  panel.classList.add("open");

  // Wire back button (idempotent — replaces any prior listener via clone)
  const newBack = backBtn.cloneNode(true) as HTMLButtonElement;
  backBtn.replaceWith(newBack);
  newBack.addEventListener("click", () => {
    const prev = lookupHistory.pop();
    if (prev) openLookupPanel(prev.cnpj, graph, true);
  });

  if (prefetched) {
    renderResultSections(prefetched, cnpj, graph);
    return;
  }

  try {
    debugLog("GET /api/lookup/:cnpj", { cnpj });
    const res = await fetch(`/api/lookup/${cnpj}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as LookupResponse;
    debugLog("GET /api/lookup done", {
      cnpj,
      status: res.status,
      datasets: data.results.length,
    });
    renderResultSections(data.results, cnpj, graph);
  } catch (e) {
    body.innerHTML = `<div class="lookup-error">Erro ao consultar: ${(e as Error).message}</div>`;
  }
}

// --- Init ---
async function init() {
  const params = new URLSearchParams(location.search);
  const cnpj = params.get("cnpj");
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

  setStatus("Consultando BigQuery…");

  let data: GraphData;
  try {
    data = await fetchGraph(cnpj);
  } catch (e) {
    setStatus(`Erro ao carregar: ${(e as Error).message}`);
    return;
  }

  const graph = new Graph();

  // The first empresa node is the root cnpj
  const rootNode = data.nodes.find((n) => n.type === "empresa");
  const rootId = rootNode?.id ?? cnpj;
  layoutRootId = rootId;
  // Update breadcrumb with company name
  const bcLabel = document.getElementById("bc-label");
  if (bcLabel && rootNode?.label) bcLabel.textContent = rootNode.label;
  for (const n of data.nodes) {
    knownNodeIds.add(n.id);
    nodeTypeMap.set(n.id, n.type);
    graph.addNode(
      n.id,
      nodeAttrs(n.type, n.label, {
        empresaId: rootId,
        isRoot: n.id === rootId,
      }),
    );
  }

  // Group socios under a "Sócios" hub node instead of direct empresa→socio edges
  const socioNodes = data.nodes.filter((n) => n.type === "socio");
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
  } else {
    // No socios — keep original links (e.g. empresa→empresa for expanded nodes)
    for (const l of data.links) {
      knownLinkKeys.add(`${l.source}→${l.target}`);
      if (
        graph.hasNode(l.source) &&
        graph.hasNode(l.target) &&
        !graph.hasEdge(l.source, l.target)
      ) {
        graph.addEdge(l.source, l.target, edgeAttrs());
      }
    }
  }

  renderer = new Sigma(graph, container, {
    renderEdgeLabels: false,
    defaultEdgeType: "curved",
    edgeProgramClasses: { curved: createEdgeCurveProgram() },
    nodeProgramClasses: {
      square: NodeSquareProgram,
      diamond: NodeDiamondProgram,
    },
    defaultDrawNodeLabel: drawLabelInsideNode,
    defaultDrawNodeHover: drawHoverInsideNode,
    labelRenderedSizeThreshold: 8,
    labelFont: "'Inter', system-ui, sans-serif",
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: "#c8d0e0" },
    nodeReducer: (node, data) => {
      const res = { ...data };
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
          res.label = "";
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
      if (selectedNode !== null) {
        const src = g?.source(edge);
        const tgt = g?.target(edge);
        const touchesSelected = src === selectedNode || tgt === selectedNode;
        if (touchesSelected) {
          res.color = COLOR_EDGE_HOVER;
          res.size = 2;
          res.zIndex = 5;
        } else {
          res.color = COLOR_FADE_EDGE;
          res.size = 0.5;
          res.zIndex = 0;
        }
      } else if (hoveredNode !== null) {
        const src = g?.source(edge);
        const tgt = g?.target(edge);
        if (src === hoveredNode || tgt === hoveredNode) {
          res.color = COLOR_EDGE_HOVER;
          res.size = 2;
        } else {
          res.color = interpolateColor(COLOR_EDGE_BASE, COLOR_FADE_EDGE, 0.6);
          res.size = 0.8;
        }
      }
      return res;
    },
  });

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

  // Auto-fetch all dataset lookups and populate graph with colored nodes
  const overlay = document.getElementById("loading-overlay");
  const loadingText = overlay?.querySelector(
    ".loading-text",
  ) as HTMLElement | null;
  if (loadingText) loadingText.textContent = "cruzando bases de dados…";
  setStatus("Cruzando com bases de dados…");
  let lookupResults: LookupResult[] = [];
  try {
    const res = await fetch(`/api/lookup/${cnpj}`);
    if (res.ok) {
      const payload = (await res.json()) as LookupResponse;
      lookupResults = payload.results;
      for (const result of lookupResults) {
        if (result.count > 0 && result.rows.length > 0 && !result.queryError) {
          addResultsToGraph(result, cnpj, graph);
          autoAddedDatasets.add(result.id);
          queriedDatasetKeys.add(`${cnpj}:${result.id}`);
        }
      }
      const hits = lookupResults.filter((r) => r.count > 0).length;
      setStatus(`${hits} base(s) com referência`);
      runLayout(graph, 300);
    }
  } catch (e) {
    setStatus(`Erro ao cruzar bases: ${(e as Error).message}`);
  } finally {
    if (overlay) overlay.style.display = "none";
    // Open panels after everything is loaded
    void openLookupPanel(cnpj, graph, false, lookupResults);
    showNodeDetails(cnpj, graph);
  }

  // Node dragging
  let draggedNode: string | null = null;
  let isDragging = false;
  let dragOffset = { dx: 0, dy: 0 };

  renderer.on("downNode", ({ node, event }) => {
    draggedNode = node;
    isDragging = false;
    renderer!.getCamera().disable();
    const mousePos = renderer!.viewportToGraph({
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    });
    const nodeX = graph.getNodeAttribute(node, "x") as number;
    const nodeY = graph.getNodeAttribute(node, "y") as number;
    dragOffset = { dx: nodeX - mousePos.x, dy: nodeY - mousePos.y };
  });

  renderer.getMouseCaptor().on("mousemovebody", (e: MouseEvent) => {
    if (!draggedNode) return;
    isDragging = true;
    const pos = renderer!.viewportToGraph({ x: e.clientX, y: e.clientY });
    graph.setNodeAttribute(draggedNode, "x", pos.x + dragOffset.dx);
    graph.setNodeAttribute(draggedNode, "y", pos.y + dragOffset.dy);
  });

  renderer.getMouseCaptor().on("mouseup", () => {
    if (draggedNode && !isDragging) {
      // treat as click — already handled by clickNode
    }
    draggedNode = null;
    isDragging = false;
    renderer!.getCamera().enable();
  });

  renderer.on("enterNode", ({ node }) => {
    hoveredNode = node;
    renderer!.refresh({ skipIndexation: true });
  });

  renderer.on("leaveNode", () => {
    hoveredNode = null;
    renderer!.refresh({ skipIndexation: true });
  });

  renderer.on("clickStage", () => {
    selectedNode = null;
    renderer!.refresh({ skipIndexation: true });
  });

  renderer.on("clickNode", ({ node }) => {
    selectedNode = selectedNode === node ? null : node;
    hoveredNode = null;
    renderer!.refresh({ skipIndexation: true });

    const nodeType = nodeTypeMap.get(node);
    if (nodeType === "group") {
      showNodeDetails(node, graph);
      return;
    }
    if (nodeType === "empresa") {
      expandNode(node, graph);
      openLookupPanel(node, graph);
      showNodeDetails(node, graph);
    } else {
      const basico = extractLookupBasicoFromNode(node);
      if (basico) openLookupPanel(basico, graph);
      showNodeDetails(node, graph);
      void expandRelatedDatasets(node, graph);
    }
  });
}

init().catch((e) => setStatus(`Erro fatal: ${(e as Error).message}`));
