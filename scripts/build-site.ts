#!/usr/bin/env bun
/**
 * Builds a fully static export of the site into dist/ for GitHub Pages (or
 * any static host). Uses the same render.ts templates as the dev server
 * (src/index.ts), just with relative link paths instead of absolute "/..."
 * ones — GitHub Pages project pages serve from a subpath (e.g.
 * https://user.github.io/datative/), not domain root, so absolute paths
 * would 404 there.
 *
 * Does NOT run scripts/generate-static-entities.ts — that needs SSH access
 * to beelink, which a CI runner doesn't have. Run it locally / from wherever
 * has that access, commit static/, then this script just packages whatever
 * is already there.
 *
 * Usage: bun run build:site   (outputs to dist/)
 */
import { mkdirSync, writeFileSync, cpSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadEntitiesIndex, renderGraphLanding, renderGraphPage, type LinkScheme } from "../src/render";

const ROOT = resolve(import.meta.dir, "..");
const DIST_DIR = resolve(ROOT, "dist");
const STATIC_DIR = resolve(ROOT, "static");
const GRAPH_JS_PATH = resolve(ROOT, "public/graph.js");
const FAVICON_PATH = resolve(ROOT, "public/favicon.svg");
const ROBOTS_PATH = resolve(ROOT, "public/robots.txt");

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...args);
}

const STATIC_LINKS: LinkScheme = {
  home: "index.html",
  favicon: "favicon.svg",
  graphJs: "graph.js",
  entityHref: (id) => `e-${id}.html`,
};

function main() {
  if (!existsSync(GRAPH_JS_PATH)) {
    throw new Error("public/graph.js not found — run `bun run build:graph` first.");
  }
  const entitiesIndex = loadEntitiesIndex();
  if (entitiesIndex.length === 0) {
    log("WARNING: static/entities-index.json is empty or missing — landing page will show no entities.");
  }
  const entitiesById = new Map(entitiesIndex.map((e) => [e.id, e]));

  mkdirSync(DIST_DIR, { recursive: true });
  mkdirSync(resolve(DIST_DIR, "entities"), { recursive: true });

  writeFileSync(resolve(DIST_DIR, "index.html"), renderGraphLanding(entitiesIndex, STATIC_LINKS));
  log("wrote index.html");

  for (const entity of entitiesIndex) {
    writeFileSync(
      resolve(DIST_DIR, `e-${entity.id}.html`),
      renderGraphPage(entity.id, entitiesById, STATIC_LINKS),
    );
  }
  log(`wrote ${entitiesIndex.length} entity page(s)`);

  cpSync(GRAPH_JS_PATH, resolve(DIST_DIR, "graph.js"));
  cpSync(FAVICON_PATH, resolve(DIST_DIR, "favicon.svg"));
  cpSync(ROBOTS_PATH, resolve(DIST_DIR, "robots.txt"));
  if (existsSync(resolve(STATIC_DIR, "entities"))) {
    cpSync(resolve(STATIC_DIR, "entities"), resolve(DIST_DIR, "entities"), { recursive: true });
  }
  // GitHub Pages otherwise runs dist/ through Jekyll, which ignores files/dirs
  // starting with "_" and can mangle other things; .nojekyll disables that.
  writeFileSync(resolve(DIST_DIR, ".nojekyll"), "");
  log("copied graph.js, favicon.svg, robots.txt, entities/, .nojekyll");
  log("done", { outDir: DIST_DIR });
}

main();
