import { readFileSync } from "fs";
import { resolve } from "path";
import { loadEntitiesIndex, renderGraphLanding, renderGraphPage, type LinkScheme } from "./render";

function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]`, ...args);
}

// --- Config ---
const PORT = parseInt(process.env.PORT ?? "3003", 10);
const GRAPH_JS_PATH = resolve(import.meta.dir, "../public/graph.js");
const FAVICON_PATH = resolve(import.meta.dir, "../public/favicon.svg");
const ROBOTS_PATH = resolve(import.meta.dir, "../public/robots.txt");
const STATIC_DIR = resolve(import.meta.dir, "../static");

const entitiesIndex = loadEntitiesIndex();
const entitiesById = new Map(entitiesIndex.map((e) => [e.id, e]));

// Absolute paths — fine for the dev server, which always serves from "/".
// scripts/build-site.ts uses relative equivalents instead, since a GitHub
// Pages project page is published under a subpath (e.g. /datative/), not root.
const DEV_LINKS: LinkScheme = {
  home: "/",
  favicon: "/favicon.svg",
  graphJs: "/graph.js",
  entityHref: (id) => `/?cnpj=${id}`,
};

// --- HTTP server ---
Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    log(`→ ${req.method} ${url.pathname}${url.search}`);

    // Favicon
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
      try {
        const svg = readFileSync(FAVICON_PATH);
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // robots.txt — belt-and-suspenders alongside the per-page noindex meta tag
    if (url.pathname === "/robots.txt") {
      try {
        return new Response(readFileSync(ROBOTS_PATH), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Static JS bundle
    if (url.pathname === "/graph.js") {
      try {
        const js = readFileSync(GRAPH_JS_PATH);
        return new Response(js, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      } catch {
        return new Response("graph.js not found — run: bun run build:graph", { status: 404 });
      }
    }

    // Graph page (also root)
    if (url.pathname === "/" || url.pathname === "/graph") {
      const id = (url.searchParams.get("cnpj") ?? "").trim();
      if (!id) return new Response(renderGraphLanding(entitiesIndex, DEV_LINKS), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      return new Response(renderGraphPage(id, entitiesById, DEV_LINKS), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Entity JSON — served straight from the precomputed static file, no live
    // query. Same relative path ("entities/:id.json") graph-client.ts fetches
    // in the published static-site build, so the client code needs no
    // dev-vs-static branching.
    const entityMatch = url.pathname.match(/^\/entities\/([^/]+)\.json$/);
    if (entityMatch) {
      const id = entityMatch[1];
      try {
        const json = readFileSync(resolve(STATIC_DIR, "entities", `${id}.json`), "utf-8");
        return new Response(json, {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Entidade não pré-computada." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${PORT}`);
