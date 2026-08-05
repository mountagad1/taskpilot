// ============================================================
// TASKPILOT — SEMANTIC CACHE
// services/api/src/runtime/cache/semantic-cache.ts
//
// Same page + same task = same answer, so serve it from cache. Backed by
// Upstash Redis when configured, by an in-process LRU otherwise — a
// missing Redis must degrade to "slower", never to "broken".
// ============================================================

import { Redis } from "@upstash/redis";
import { hashString } from "@taskpilot/shared";

export interface CacheEntry {
  result: unknown;
  task: string;
  model: string;
  tokensUsed: number;
  createdAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  /** Tokens not spent because a hit was served. */
  tokensSaved: number;
}

export interface CacheBackend {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void>;
  delete(keys: string[]): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

// ─── BACKENDS ────────────────────────────────────────────────

class RedisBackend implements CacheBackend {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.redis.get<CacheEntry | string>(key);
    if (!raw) return null;
    // Upstash auto-deserialises JSON, but a string round-trip can survive
    // from older writes — handle both rather than throwing.
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as CacheEntry;
      } catch {
        return null;
      }
    }
    return raw;
  }

  async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(entry));
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }
}

/** Bounded LRU so a long-lived worker can't grow without limit. */
export class MemoryBackend implements CacheBackend {
  private readonly entries = new Map<string, { entry: CacheEntry; expiresAt: number }>();

  constructor(private readonly maxEntries = 500) {}

  async get(key: string): Promise<CacheEntry | null> {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    // Re-insert to mark as most-recently-used.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.entry;
  }

  async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { entry, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return [...this.entries.keys()].filter((k) => regex.test(k));
  }

  clear(): void {
    this.entries.clear();
  }
}

// ─── CACHE ───────────────────────────────────────────────────

const DEFAULT_TTL = 3600; // 1 hour
const LONG_TTL = 86_400; // 24 hours

/** Content-derived tasks stay valid far longer than page-state ones. */
const LONG_CACHE_TASKS = new Set([
  "summarize",
  "translate",
  "extract_emails",
  "extract_prices",
  "extract_links",
  "extract_table",
]);

export class SemanticCache {
  private readonly backend: CacheBackend;
  private stats: CacheStats = { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0 };

  constructor(backend?: CacheBackend) {
    this.backend = backend ?? SemanticCache.defaultBackend();
  }

  /** Redis when both env vars are present; otherwise a local LRU. */
  static defaultBackend(): CacheBackend {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) return new RedisBackend(new Redis({ url, token }));
    return new MemoryBackend();
  }

  /**
   * Deterministic key from the request. Deliberately excludes user identity:
   * the same page summarised by two users is the same summary, and sharing
   * that hit is most of the cost saving.
   */
  generateKey(params: {
    task: string;
    pageContent: string;
    userInput?: string;
    url?: string;
    language?: string;
  }): string {
    const { task, pageContent, userInput = "", url = "", language = "en" } = params;

    const normalised = pageContent.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 2000);
    return `semantic:${task}:${hashString(`${task}:${normalised}:${userInput}:${url}:${language}`)}`;
  }

  async get(key: string): Promise<unknown | null> {
    try {
      const entry = await this.backend.get(key);
      if (!entry) {
        this.stats.misses++;
        this.recomputeRate();
        return null;
      }
      this.stats.hits++;
      this.stats.tokensSaved += entry.tokensUsed || 0;
      this.recomputeRate();
      return entry.result;
    } catch (err) {
      // A cache outage must not fail the request it was meant to speed up.
      console.error("[SemanticCache] get failed:", err);
      return null;
    }
  }

  async set(
    key: string,
    result: unknown,
    meta: { task: string; model: string; tokensUsed: number }
  ): Promise<void> {
    try {
      await this.backend.set(
        key,
        { result, task: meta.task, model: meta.model, tokensUsed: meta.tokensUsed, createdAt: Date.now() },
        LONG_CACHE_TASKS.has(meta.task) ? LONG_TTL : DEFAULT_TTL
      );
    } catch (err) {
      console.error("[SemanticCache] set failed:", err);
    }
  }

  async invalidate(taskPattern: string): Promise<void> {
    try {
      const keys = await this.backend.keys(`semantic:${taskPattern}:*`);
      await this.backend.delete(keys);
    } catch (err) {
      console.error("[SemanticCache] invalidate failed:", err);
    }
  }

  /** Process-local counters. Aggregate reporting lives in the analytics tables. */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, hitRate: 0, tokensSaved: 0 };
  }

  private recomputeRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total ? this.stats.hits / total : 0;
  }
}

/**
 * Shared instance for route handlers. Constructed lazily so importing this
 * module never requires Redis credentials to be present.
 */
let shared: SemanticCache | null = null;

export function getSemanticCache(): SemanticCache {
  if (!shared) shared = new SemanticCache();
  return shared;
}

/** @deprecated Prefer `getSemanticCache()` — this proxies to it. */
export const semanticCache = {
  generateKey: (params: Parameters<SemanticCache["generateKey"]>[0]) =>
    getSemanticCache().generateKey(params),
  get: (key: string) => getSemanticCache().get(key),
  set: (key: string, result: unknown, meta: { task: string; model: string; tokensUsed: number }) =>
    getSemanticCache().set(key, result, meta),
  getStats: () => getSemanticCache().getStats(),
};
