import { DuckDBInstance } from "@duckdb/node-api";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const lines = readFileSync(resolve(import.meta.dir, "../.env"), "utf-8").split("\n");
    for (const line of lines) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length && !process.env[k.trim()]) {
        process.env[k.trim()] = rest.join("=").trim();
      }
    }
  } catch {}
}

loadEnv();

const bucket   = process.env.HETZNER_S3_BUCKET   ?? "baseldosdados";
const endpoint = process.env.HETZNER_S3_ENDPOINT  ?? "https://hel1.your-objectstorage.com";
const keyId    = process.env.S3_ACCESS_KEY_ID     ?? "";
const secret   = process.env.S3_SECRET_ACCESS_KEY ?? "";

if (!keyId || !secret) {
  console.error("Faltam S3_ACCESS_KEY_ID ou S3_SECRET_ACCESS_KEY no .env");
  process.exit(1);
}

const host = endpoint.replace(/^https?:\/\//, "");

console.log(`\nTestando DuckDB httpfs com S3 Hetzner`);
console.log(`  endpoint : ${endpoint}`);
console.log(`  bucket   : ${bucket}\n`);

const instance = await DuckDBInstance.create(":memory:", { threads: "4" });
const conn = await instance.connect();

// 1. instalar e carregar httpfs
console.log("[1/3] Instalando httpfs...");
await conn.run("INSTALL httpfs; LOAD httpfs;");
console.log("      OK");

// 2. configurar credenciais S3
console.log("[2/3] Configurando credenciais...");
await conn.run(`
  SET s3_endpoint='${host}';
  SET s3_access_key_id='${keyId}';
  SET s3_secret_access_key='${secret}';
  SET s3_use_ssl=true;
  SET s3_url_style='path';
`);
console.log("      OK");

// 3. tentar ler 1 linha de um parquet do bucket
const glob = `s3://${bucket}/br_me_cnpj/empresas/**/*.parquet`;
console.log(`[3/3] Lendo 1 linha de:\n      ${glob}`);

const reader = await conn.runAndReadAll(
  `SELECT * FROM read_parquet('${glob}', hive_partitioning=true) LIMIT 1`
);
const rows = reader.getRowObjectsJS();

if (rows.length === 0) {
  console.log("\nAviso: query retornou 0 linhas (bucket vazio ou path incorreto)");
} else {
  console.log("\nSucesso! Colunas encontradas:");
  console.log(" ", Object.keys(rows[0]).join(", "));
  console.log("\nPrimeira linha:");
  const replacer = (_: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;
  console.log(" ", JSON.stringify(rows[0], replacer, 2).split("\n").join("\n  "));
}

