import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const CACHE_DIR = resolve(import.meta.dir, ".cache");
const TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

function filePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return resolve(CACHE_DIR, safe + ".json");
}

export function getCache<T>(key: string): T | null {
  const p = filePath(key);
  if (!existsSync(p)) return null;
  try {
    const entry = JSON.parse(readFileSync(p, "utf-8")) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry<T> = { expiresAt: Date.now() + TTL_MS, data };
  writeFileSync(filePath(key), JSON.stringify(entry));
}
