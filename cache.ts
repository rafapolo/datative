import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

// Returns undefined on cache miss or expiry; returns T (including null) on hit.
// Callers that cache null as a "found nothing" sentinel must use `!== undefined`
// to distinguish a miss from a stored null result.
export function getCache<T>(key: string): T | undefined {
  try {
    const entry = JSON.parse(readFileSync(filePath(key), "utf-8")) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) return undefined;
    return entry.data;
  } catch {
    return undefined;  // cache miss — file not found or unreadable
  }
}

export function setCache<T>(key: string, data: T): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry<T> = { expiresAt: Date.now() + TTL_MS, data };
  writeFileSync(filePath(key), JSON.stringify(entry));
}
