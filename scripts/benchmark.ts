/**
 * Benchmark for the SSH-tunneled DuckDB query path used in production
 * (queries basedosdados.duckdb on beelink via `ssh ... duckdb -readonly -json`).
 *
 * Run:  bun run benchmark.ts [--iterations N] [--full-scan]
 * Appends a timestamped entry to benchmarks/results.json.
 *
 * Default scenarios (partition-pruned — fast, ~seconds):
 *   empresa_partitioned       — cnpj_basico + ano=2024, single hive partition
 *   socios_partitioned        — cnpj_basico + ano=2024 mes=1, single partition
 *   contratos_mixed_cnpj      — 14-digit CNPJ match on CGU contracts (not year-partitioned)
 *   cartao_mixed_cnpj         — same mixed match on cartão pagamento
 *   parallel_empresa_socios   — empresa + socios partitioned, fired via Promise.all
 *   empresas_search           — UPPER LIKE on razao_social within one ano partition
 *
 * With --full-scan (expensive, minutes for cold run):
 *   empresa_full_scan         — cnpj_basico with no partition filter (all anos)
 *   socios_full_scan          — same for socios (mirrors production queryEmpresa/querySocios)
 *
 * Each scenario runs `iterations` times.
 * First run = "cold" (DuckDB S3 footer cache is empty).
 * Subsequent runs = "warm" (footer metadata cached in-process).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { queryParquetDataset, warmUp } from "../src/parquet-store";
import { queryByCnpj, DatasetInfo } from "../src/cnpj-index";

// ---- Target CNPJs -------------------------------------------------------
// Facebook — 5806 data sources, large company, present across most datasets.
const CNPJ_FACEBOOK = "13347016";
// Cooperativa Agropecu. Patrocínio — Grande porte, likely in government contracts.
const CNPJ_COOP = "23405160";

const BENCHMARK_YEAR = 2024;
const BENCHMARK_MES = 1;

// ---- Helpers ------------------------------------------------------------
async function collect<T>(gen: AsyncGenerator<T>, limit = 200): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of gen) {
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(ms: number[]): { cold: number; p50: number; p95: number; min: number; max: number } {
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    cold: ms[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function gitSha(): string {
  try {
    return spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" }).stdout.trim();
  } catch {
    return "unknown";
  }
}

// ---- Scenario definitions -----------------------------------------------

interface ScenarioResult {
  scenario: string;
  cnpj: string;
  cold_ms: number;
  p50_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  rows: number;
}

const contratosInfo: DatasetInfo = {
  dataset: "br_cgu_licitacao_contrato",
  table: "contrato_compra",
  cnpjColumns: [{ name: "cpf_cnpj_contratado", type: "mixed" }],
  displayFields: ["id_contrato", "objeto", "valor_inicial_compra", "nome_contratado", "cpf_cnpj_contratado"],
};

const cartaoInfo: DatasetInfo = {
  dataset: "br_cgu_cartao_pagamento",
  table: "microdados_governo_federal",
  cnpjColumns: [{ name: "cnpj_cpf_favorecido", type: "mixed" }],
  displayFields: ["nome_favorecido", "cnpj_cpf_favorecido", "valor_transacao", "data_transacao"],
};

type ScenarioFn = () => Promise<number>;

function makeScenarios(cnpj: string, includeFullScan: boolean): Array<{ name: string; fn: ScenarioFn }> {
  const scenarios: Array<{ name: string; fn: ScenarioFn }> = [
    {
      // Hive-partitioned hit: DuckDB prunes all but one ano=2024 partition.
      name: "empresa_partitioned",
      fn: async () => {
        const rows = await collect(
          queryParquetDataset("br_me_cnpj", "empresas", {
            columns: ["cnpj_basico", "razao_social", "capital_social", "porte", "ano"],
            filters: { cnpj_basico: cnpj, ano: BENCHMARK_YEAR },
            limit: 10,
          })
        );
        return rows.length;
      },
    },
    {
      // Hive-partitioned hit: single ano+mes shard, smallest possible scan unit.
      name: "socios_partitioned",
      fn: async () => {
        const rows = await collect(
          queryParquetDataset("br_me_cnpj", "socios", {
            columns: ["cnpj_basico", "nome", "documento", "qualificacao"],
            filters: { cnpj_basico: cnpj, ano: BENCHMARK_YEAR, mes: BENCHMARK_MES },
            limit: 50,
          })
        );
        return rows.length;
      },
    },
    {
      // Mixed-CNPJ match on CGU contracts — no hive partitioning, real full-table scan.
      name: "contratos_mixed_cnpj",
      fn: async () => {
        const rows = await collect(queryByCnpj(contratosInfo, cnpj, 40));
        return rows.length;
      },
    },
    {
      // Mixed-CNPJ on cartão pagamento — exercises the 14-digit+LIKE path.
      name: "cartao_mixed_cnpj",
      fn: async () => {
        const rows = await collect(queryByCnpj(cartaoInfo, cnpj, 40));
        return rows.length;
      },
    },
    {
      // Concurrent empresa + socios (mirrors /api/graph/:cnpj Promise.all pattern).
      name: "parallel_empresa_socios",
      fn: async () => {
        const [e, s] = await Promise.all([
          collect(
            queryParquetDataset("br_me_cnpj", "empresas", {
              columns: ["cnpj_basico", "razao_social", "porte", "ano"],
              filters: { cnpj_basico: cnpj, ano: BENCHMARK_YEAR },
              limit: 5,
            })
          ),
          collect(
            queryParquetDataset("br_me_cnpj", "socios", {
              columns: ["cnpj_basico", "nome", "documento", "qualificacao"],
              filters: { cnpj_basico: cnpj, ano: BENCHMARK_YEAR, mes: BENCHMARK_MES },
              limit: 50,
            })
          ),
        ]);
        return e.length + s.length;
      },
    },
    {
      // UPPER LIKE within a single partition — mirrors the /table?search= endpoint.
      name: "empresas_search_partitioned",
      fn: async () => {
        const rows = await collect(
          queryParquetDataset("br_me_cnpj", "empresas", {
            columns: ["cnpj_basico", "razao_social", "porte", "ano"],
            filters: { ano: BENCHMARK_YEAR },
            rawWhere: `UPPER("razao_social") LIKE '%FACEBOOK%'`,
            limit: 25,
          })
        );
        return rows.length;
      },
    },
  ];

  if (includeFullScan) {
    scenarios.push(
      {
        // No partition filter — mirrors production queryEmpresa (cold = minutes).
        name: "empresa_full_scan",
        fn: async () => {
          const rows = await collect(
            queryParquetDataset("br_me_cnpj", "empresas", {
              columns: ["cnpj_basico", "razao_social", "capital_social", "porte", "ano"],
              filters: { cnpj_basico: cnpj },
              limit: 10,
            })
          );
          return rows.length;
        },
      },
      {
        // No partition filter — mirrors production querySocios.
        name: "socios_full_scan",
        fn: async () => {
          const rows = await collect(
            queryParquetDataset("br_me_cnpj", "socios", {
              columns: ["cnpj_basico", "nome", "documento", "qualificacao"],
              filters: { cnpj_basico: cnpj },
              limit: 50,
            })
          );
          return rows.length;
        },
      }
    );
  }

  return scenarios;
}

// ---- Runner -------------------------------------------------------------

async function runScenario(
  name: string,
  fn: ScenarioFn,
  iterations: number
): Promise<ScenarioResult> {
  const times: number[] = [];
  let rowCount = 0;

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    rowCount = await fn();
    times.push(Math.round(performance.now() - t0));
  }

  const { cold, p50, p95, min, max } = stats(times);
  return { scenario: name, cnpj: "", cold_ms: cold, p50_ms: p50, p95_ms: p95, min_ms: min, max_ms: max, rows: rowCount };
}

// ---- Main ---------------------------------------------------------------

const RESULTS_DIR = resolve(import.meta.dir, "../benchmarks");
const RESULTS_FILE = resolve(RESULTS_DIR, "results.json");

const iterations = (() => {
  const idx = process.argv.indexOf("--iterations");
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 3;
})();
const fullScan = process.argv.includes("--full-scan");

console.log(`\nBenchmark — ${iterations} iteration(s) per scenario${fullScan ? " (+ full-scan)" : ""}`);
console.log("Warming up DuckDB + S3 connection pool…");
await warmUp();
console.log("Ready.\n");

const allResults: ScenarioResult[] = [];

for (const cnpj of [CNPJ_FACEBOOK, CNPJ_COOP]) {
  const label = cnpj === CNPJ_FACEBOOK ? "Facebook (13347016)" : "Cooperativa (23405160)";
  console.log(`── ${label} ─────────────────────────────`);

  for (const { name, fn } of makeScenarios(cnpj, fullScan)) {
    process.stdout.write(`  ${name.padEnd(36)}`);
    const result = await runScenario(name, fn, iterations);
    result.cnpj = cnpj;
    allResults.push(result);

    const { cold_ms, p50_ms, p95_ms, rows } = result;
    const cold = cold_ms >= 60000
      ? `${(cold_ms / 60000).toFixed(1)}m`
      : `${cold_ms}ms`;
    console.log(`cold=${cold.padStart(8)}  p50=${String(p50_ms).padStart(6)}ms  p95=${String(p95_ms).padStart(6)}ms  rows=${rows}`);
  }
  console.log();
}

// ---- Persist results ----------------------------------------------------

mkdirSync(RESULTS_DIR, { recursive: true });

const history: unknown[] = existsSync(RESULTS_FILE)
  ? (JSON.parse(readFileSync(RESULTS_FILE, "utf-8")) as unknown[])
  : [];

history.push({
  timestamp: new Date().toISOString(),
  git: gitSha(),
  iterations,
  full_scan: fullScan,
  results: allResults,
});

writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));
console.log(`Results saved → benchmarks/results.json  (${history.length} run(s) total)`);
