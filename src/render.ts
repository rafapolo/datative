import { readFileSync } from "fs";
import { resolve } from "path";
import { CNPJ_DATASETS, RELATED_DATASETS } from "./cnpj-datasets";

const STATIC_DIR = resolve(import.meta.dir, "../static");
const ENTITIES_INDEX_PATH = resolve(STATIC_DIR, "entities-index.json");

export interface EntityIndexEntry {
  id: string;
  type: "empresa" | "pessoa";
  label: string;
  datasetCount: number;
  path: string;
}

export function loadEntitiesIndex(): EntityIndexEntry[] {
  try {
    return JSON.parse(readFileSync(ENTITIES_INDEX_PATH, "utf-8")) as EntityIndexEntry[];
  } catch {
    return [];
  }
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every path below is relative-or-injected so the exact same HTML works both
// served by src/index.ts's dev server (page at "/") and published as a
// standalone static file by scripts/build-site.ts (e.g. under GitHub Pages'
// project-page subpath, /datative/) — absolute "/foo" paths would 404 there.
export interface LinkScheme {
  home: string; // nav-brand / breadcrumb "back to landing" href
  favicon: string;
  graphJs: string;
  entityHref: (id: string) => string; // landing row -> that entity's graph page
}

function renderEntityRow(e: EntityIndexEntry, links: LinkScheme): string {
  return (
    `<a href="${escHtml(links.entityHref(e.id))}" class="ci-row">` +
    `<span class="ci-cnpj">${escHtml(e.id)}</span>` +
    `<span class="ci-name">${escHtml(e.label)}</span>` +
    `<span class="ci-porte">${e.datasetCount} datasets</span>` +
    `</a>`
  );
}

function renderEntitySection(title: string, entities: EntityIndexEntry[], links: LinkScheme): string {
  if (entities.length === 0) return "";
  return (
    `<div class="ci-section-header"><span>${escHtml(title)}</span><span>${entities.length}</span></div>` +
    entities.map((e) => renderEntityRow(e, links)).join("")
  );
}

export function renderGraphLanding(entitiesIndex: EntityIndexEntry[], links: LinkScheme): string {
  const empresas = entitiesIndex.filter((e) => e.type === "empresa");
  const pessoas = entitiesIndex.filter((e) => e.type === "pessoa");
  const entityRows =
    renderEntitySection("Empresas", empresas, links) + renderEntitySection("Pessoas", pessoas, links);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="${escHtml(links.favicon)}">
  <title>DATATIVE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap">
  <style>
    :root {
      --bg: #06060e; --surface: #0d0d20; --border: #1c1c38;
      --gold: #e8b84b; --text: #e4e4f0; --muted: #6868aa;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'DM Sans', sans-serif;
      background-color: var(--bg);
      background-image: radial-gradient(circle, #1a1a36 1.5px, transparent 1.5px);
      background-size: 28px 28px;
      color: var(--text);
      display: flex;
      flex-direction: column;
    }
    body::before {
      content: '';
      display: block;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold) 60%, transparent 100%);
      flex-shrink: 0;
    }
    nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.1rem 3rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .nav-brand {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.35rem;
      letter-spacing: 0.12em;
      color: var(--gold);
      text-decoration: none;
    }
    .layout { display: flex; flex: 1; overflow: hidden; min-height: 0; }
    main {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 3rem 2rem;
      max-width: 580px;
      min-width: 420px;
    }
    .eyebrow {
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      color: var(--gold);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      margin-bottom: 0.6rem;
      opacity: 0.85;
    }
    .wordmark {
      font-family: 'Bebas Neue', sans-serif;
      font-size: clamp(5rem, 13vw, 9.5rem);
      line-height: 0.88;
      letter-spacing: 0.03em;
      color: var(--text);
    }
    .wordmark span {
      display: inline-block;
      opacity: 0;
      transform: translateY(24px);
      animation: letterIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes letterIn { to { opacity: 1; transform: translateY(0); } }
    .gold-rule {
      width: 72px;
      height: 2px;
      background: var(--gold);
      margin: 1.6rem 0;
    }
    .tagline {
      font-size: 0.95rem;
      color: var(--muted);
      max-width: 460px;
      line-height: 1.7;
      margin-bottom: 1rem;
      font-weight: 300;
      letter-spacing: 0.01em;
    }
    footer {
      padding: 0.9rem 3rem;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .footer-copy {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #252540;
      letter-spacing: 0.1em;
    }
    .footer-status {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #303050;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .status-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--gold);
      animation: blink 2.5s ease-in-out infinite;
    }
    @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
    .ci-panel {
      flex: 1;
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ci-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 1.2rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .ci-panel-label {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      color: var(--gold);
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .ci-panel-count {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      letter-spacing: 0.08em;
    }
    .ci-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0.25rem 0;
    }
    .ci-section-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0.5rem 1.2rem 0.3rem;
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--gold);
      opacity: 0.75;
    }
    .ci-section-header span:last-child {
      color: #2e2e50;
      letter-spacing: 0.05em;
      text-transform: none;
    }
    .ci-scroll::-webkit-scrollbar { width: 4px; }
    .ci-scroll::-webkit-scrollbar-track { background: transparent; }
    .ci-scroll::-webkit-scrollbar-thumb { background: #1c1c38; border-radius: 2px; }
    .ci-row {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.5rem 1.2rem;
      text-decoration: none;
      border-bottom: 1px solid #0d0d1e;
      transition: background 0.1s;
    }
    .ci-row:hover { background: #0f0f28; }
    .ci-cnpj {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      color: var(--gold);
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }
    .ci-name {
      font-size: 0.78rem;
      color: #9090c0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .ci-porte {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: #2e2e50;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <nav>
    <a class="nav-brand" href="${escHtml(links.home)}">DATA_</a>
  </nav>
  <div class="layout">
    <main>
      <p class="eyebrow">// sistema de investigação · br</p>
      <h1 class="wordmark">
        <span style="animation-delay:.04s">D</span><span style="animation-delay:.09s">A</span><span style="animation-delay:.14s">T</span><span style="animation-delay:.19s">A</span><span style="animation-delay:.24s">T</span><span style="animation-delay:.29s">I</span><span style="animation-delay:.34s">V</span><span style="animation-delay:.39s">E</span>
      </h1>
      <div class="gold-rule"></div>
      <p class="tagline">Cruzamento de CNPJs com bases públicas federais — Receita Federal, CGU, TSE, SIAFI e mais.</p>
      <p class="tagline">Entidades pré-computadas, sem consulta ao vivo — clique numa entidade abaixo para ver a rede.</p>
    </main>
    <aside class="ci-panel">
      <div class="ci-panel-header">
        <span class="ci-panel-label">[ maior abrangência entre datasets ]</span>
        <span class="ci-panel-count">${entitiesIndex.length} entidades</span>
      </div>
      <div class="ci-scroll">
        ${entityRows || `<div style="padding:1rem 1.2rem;color:var(--muted);font-size:0.8rem">Nenhuma entidade pré-computada ainda — rode <code>bun run generate:static</code>.</div>`}
      </div>
    </aside>
  </div>
  <footer>
    <span class="footer-copy">DATATIVE · CNPJ GRAPH · BASE DOS DADOS</span>
    <span class="footer-status"><span class="status-dot"></span> ESTÁTICO</span>
  </footer>
</body>
</html>`;
}

export function renderGraphPage(
  id: string,
  entitiesById: Map<string, EntityIndexEntry>,
  links: LinkScheme,
): string {
  const entity = entitiesById.get(id);
  const label = entity?.label ?? id;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="${escHtml(links.favicon)}">
  <title>DATA_ ${escHtml(label)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap">
  <style>
    :root {
      --bg: #06060e; --surface: #0d0d20; --border: #1c1c38;
      --gold: #e8b84b; --text: #e4e4f0; --muted: #6868aa;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
    }
    .gold-bar {
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold) 60%, transparent 100%);
      flex-shrink: 0;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 1.5rem;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-shrink: 0;
    }
    .h-brand {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.2rem;
      letter-spacing: 0.1em;
      color: var(--gold);
      text-decoration: none;
    }
    .h-brand:hover { opacity: 0.9; }
    .h-divider {
      width: 1px;
      height: 18px;
      background: var(--border);
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0;
      font-family: 'Space Mono', monospace;
      font-size: 0.62rem;
      letter-spacing: 0.06em;
    }
    .breadcrumb a, .breadcrumb span {
      color: var(--muted);
      text-decoration: none;
      white-space: nowrap;
    }
    .breadcrumb a:hover { color: var(--gold); }
    .breadcrumb .bc-sep {
      margin: 0 0.4rem;
      color: #2e2e50;
      user-select: none;
    }
    .breadcrumb .bc-current {
      color: var(--gold);
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .control-group {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }
    .control-group + .control-group {
      margin-left: 0.6rem;
    }
    .control-label {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: var(--muted);
      letter-spacing: 0.07em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    #layout-select, #query-limit-select {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
      cursor: pointer;
      outline: none;
    }
    #query-limit-select { min-width: 56px; text-align: center; }
    #layout-select:hover, #query-limit-select:hover { border-color: var(--gold); color: var(--text); }
    #layout-select option, #query-limit-select option { background: #0d0d20; }
    #status {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      color: var(--muted);
      letter-spacing: 0.05em;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #status[data-loading="true"] {
      color: var(--text);
    }
    #status[data-loading="true"]::before {
      content: "● ";
      color: var(--gold);
      animation: statusPulse 1s ease-in-out infinite;
    }
    @keyframes statusPulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
    #graph-container {
      flex: 1;
      width: 100%;
      position: relative;
      background: #08080f;
    }
    footer {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 0 1.5rem;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    footer span {
      font-family: 'Space Mono', monospace;
      font-size: 0.58rem;
      color: var(--muted);
      letter-spacing: 0.05em;
    }
    .footer-meta {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 0;
    }
    .footer-meta span + span::before { content: " | "; color: #2e2e50; }
    #loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.25rem;
      background: #08080f;
      z-index: 10;
      pointer-events: none;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 2px solid var(--gold);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      color: #6b7aaa;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="gold-bar"></div>
  <header>
    <a class="h-brand" href="${escHtml(links.home)}">DATA_</a>
    <span class="h-divider"></span>
    <nav class="breadcrumb">
      <a href="${escHtml(links.home)}">INÍCIO</a>
      <span class="bc-sep">›</span>
      <span class="bc-current" id="bc-label">${escHtml(label)}</span>
    </nav>
    <div class="control-group">
      <label class="control-label" for="layout-select">Layout</label>
      <select id="layout-select" class="layout-select">
        <option value="radial">Radial</option>
        <option value="radial-compact">Radial Compacto</option>
        <option value="collapsible-tree">Collapsible Tree</option>
        <option value="pack">Pack</option>
        <option value="forceatlas2">Force Atlas 2</option>
      </select>
    </div>
  </header>
  <div id="graph-container">
    <div id="loading-overlay">
      <div class="spinner"></div>
      <span class="loading-text">carregando rede</span>
    </div>
  </div>
  <footer>
    <span id="status">Carregando…</span>
    <div class="footer-meta">
      <span id="execution-time">Execução · --:--</span>
      <span>estático</span>
    </div>
  </footer>
  <script>
    window.__ENTITY_ID__ = ${JSON.stringify(id)};
    window.__DATASET_COLORS = ${JSON.stringify(
      Object.fromEntries([
        ...CNPJ_DATASETS.map((d) => [d.id, d.color]),
        ...RELATED_DATASETS.map((d) => [d.id, d.color]),
      ])
    )};
    window.__DATASET_META = ${JSON.stringify(
      Object.fromEntries(
        CNPJ_DATASETS.map((d) => [
          d.id,
          {
            label: d.label,
            color: d.color,
            cnpjColumnNames: d.cnpjColumns.map((c) => c.name),
            nodeType: d.nodeType,
            nodeIdField: d.nodeIdField,
            nodeLabelField: d.nodeLabelField,
          },
        ])
      )
    )};
  </script>
  <script src="${escHtml(links.graphJs)}"></script>
</body>
</html>`;
}
