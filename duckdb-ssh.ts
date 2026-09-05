import { spawn } from "child_process";

const SSH_USER = process.env.DUCKDB_SSH_USER ?? "polo";
const SSH_HOST = process.env.DUCKDB_SSH_HOST ?? "beelink";
const REMOTE_DB_PATH = process.env.DUCKDB_REMOTE_PATH ?? "~/rodado/basedosdados.duckdb";
const REMOTE_DUCKDB_BIN = process.env.DUCKDB_REMOTE_BIN ?? "~/.local/bin/duckdb";

// Reuses one multiplexed TCP connection across all queries so each query only
// pays for spawning the remote duckdb process, not a fresh SSH handshake.
const CONTROL_PATH = process.env.DUCKDB_SSH_CONTROL_PATH ?? `${process.env.HOME}/.ssh/cm-datative-%r@%h:%p`;

function sshArgs(): string[] {
  return [
    "-o", "ControlMaster=auto",
    "-o", `ControlPath=${CONTROL_PATH}`,
    "-o", "ControlPersist=10m",
    "-o", "ConnectTimeout=5",
    "-o", "BatchMode=yes",
    `${SSH_USER}@${SSH_HOST}`,
    // -readonly avoids the exclusive file lock duckdb otherwise takes, which
    //   would serialize all concurrent queries against one process.
    // -no-init skips ~/.duckdbrc so app output is deterministic and can never
    //   be corrupted by an rc file writing to stdout.
    `${REMOTE_DUCKDB_BIN} -readonly -no-init -json ${REMOTE_DB_PATH}`,
  ];
}

export function execRemoteSQL(sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("ssh", sshArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`remote duckdb exited ${code}: ${stderr.trim()}`));
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolvePromise([]);
        return;
      }
      try {
        resolvePromise(JSON.parse(trimmed) as Record<string, unknown>[]);
      } catch (err) {
        reject(new Error(`failed to parse duckdb JSON output: ${(err as Error).message}\n${stderr}`));
      }
    });
    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

// Splits duckdb -json output (one JSON array per statement, arrays may span
// lines) into its top-level values, respecting brackets inside string literals.
function splitJsonArrays(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "]" || c === "}") { depth--; if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

// Runs several statements in ONE remote duckdb process and returns one row set
// per statement — one SSH spawn / one DB open instead of N.
export function execRemoteSQLMulti(sqls: string[]): Promise<Record<string, unknown>[][]> {
  const joined = sqls.map((s) => s.trim().replace(/;?\s*$/, ";")).join("\n");
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("ssh", sshArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`remote duckdb exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const parts = splitJsonArrays(stdout);
        resolvePromise(parts.map((p) => JSON.parse(p) as Record<string, unknown>[]));
      } catch (err) {
        reject(new Error(`failed to parse duckdb JSON output: ${(err as Error).message}\n${stderr}`));
      }
    });
    proc.stdin.write(joined);
    proc.stdin.end();
  });
}

export async function warmUpSSH(): Promise<void> {
  await execRemoteSQL("SELECT 1;");
}
