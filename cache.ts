import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const CACHE_DIR = resolve(import.meta.dir, ".cache");
const TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const memCache = new Map<string, CacheEntry<unknown>>();

function filePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return resolve(CACHE_DIR, safe + ".json");
}

export function getCache<T>(key: string): T | null {
  const mem = memCache.get(key);
  if (mem && Date.now() <= mem.expiresAt) return mem.data as T;

  try {
    const entry = JSON.parse(readFileSync(filePath(key), "utf-8")) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) return null;
    memCache.set(key, entry as CacheEntry<unknown>);
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { expiresAt: Date.now() + TTL_MS, data };
  memCache.set(key, entry as CacheEntry<unknown>);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(filePath(key), JSON.stringify(entry));
}
