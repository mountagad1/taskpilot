// ============================================================
// TASKPILOT — AGENT MEMORY
// services/api/src/runtime/memory/index.ts
//
// Two tiers:
//   Scratchpad   per-run, in-process. Holds each step's `save_as` value and
//                is what later steps interpolate their params from.
//   Store        cross-run, namespaced, TTL'd. Lets an agent remember (say)
//                which rows it already exported from a URL.
//
// The store is behind an interface so the extension can back it with
// chrome.storage, the server with Redis, and tests with a Map.
// ============================================================

import type { StepCondition } from "@taskpilot/shared";

// ─── SCRATCHPAD ──────────────────────────────────────────────

export class Scratchpad {
  private readonly values = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  get(key: string): unknown {
    return this.values.get(key);
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }

  keys(): string[] {
    return [...this.values.keys()];
  }

  /**
   * Resolves a dotted path such as `contacts.0.email` against stored values.
   * Returns undefined rather than throwing on a missing segment — a step
   * referencing a value an earlier step didn't produce is a normal case.
   */
  resolve(path: string): unknown {
    const segments = path.split(".");
    let current: unknown = this.values.get(segments[0]);

    for (let i = 1; i < segments.length && current != null; i++) {
      const segment = segments[i];
      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        current = Number.isNaN(index) ? undefined : current[index];
      } else if (typeof current === "object") {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Substitutes `{{key.path}}` references inside action params. This is how a
   * plan wires one step's output into the next step's input without the
   * runtime needing to understand any particular action's schema.
   */
  interpolate<T>(value: T): T {
    if (typeof value === "string") {
      return this.interpolateString(value) as unknown as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.interpolate(item)) as unknown as T;
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        out[key] = this.interpolate(val);
      }
      return out as unknown as T;
    }
    return value;
  }

  private interpolateString(input: string): unknown {
    const whole = /^\{\{\s*([\w.[\]-]+)\s*\}\}$/.exec(input);
    // A string that is *only* a reference resolves to the raw value, so
    // `{{contacts}}` yields the array rather than "[object Object]".
    if (whole) {
      const resolved = this.resolve(whole[1]);
      return resolved === undefined ? input : resolved;
    }

    return input.replace(/\{\{\s*([\w.[\]-]+)\s*\}\}/g, (match, path: string) => {
      const resolved = this.resolve(path);
      if (resolved === undefined) return match;
      return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
    });
  }

  /** Evaluates a step's guard against current values. */
  evaluate(condition: StepCondition): boolean {
    const actual = this.resolve(condition.key);

    switch (condition.op) {
      case "exists":
        return actual !== undefined && actual !== null && actual !== "" &&
          !(Array.isArray(actual) && actual.length === 0);
      case "not_exists":
        return actual === undefined || actual === null || actual === "" ||
          (Array.isArray(actual) && actual.length === 0);
      case "equals":
        return actual === condition.value;
      case "not_equals":
        return actual !== condition.value;
      case "contains":
        if (typeof actual === "string") return actual.includes(String(condition.value));
        if (Array.isArray(actual)) return actual.includes(condition.value);
        return false;
      case "gt":
        return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
      case "lt":
        return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
      default:
        return false;
    }
  }
}

// ─── LONG-TERM STORE ─────────────────────────────────────────

export interface MemoryStore {
  get(namespace: string, key: string): Promise<unknown | null>;
  set(namespace: string, key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list(namespace: string): Promise<string[]>;
}

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/** Default store. Also the fallback whenever Redis isn't configured. */
export class InMemoryStore implements MemoryStore {
  private readonly data = new Map<string, Entry>();

  private compose(namespace: string, key: string): string {
    return `${namespace}::${key}`;
  }

  async get(namespace: string, key: string): Promise<unknown | null> {
    const entry = this.data.get(this.compose(namespace, key));
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.data.delete(this.compose(namespace, key));
      return null;
    }
    return entry.value;
  }

  async set(namespace: string, key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.data.set(this.compose(namespace, key), {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.data.delete(this.compose(namespace, key));
  }

  async list(namespace: string): Promise<string[]> {
    const prefix = `${namespace}::`;
    const now = Date.now();
    const keys: string[] = [];
    for (const [composed, entry] of this.data) {
      if (!composed.startsWith(prefix)) continue;
      if (entry.expiresAt !== null && entry.expiresAt < now) continue;
      keys.push(composed.slice(prefix.length));
    }
    return keys;
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * Scopes a store to one agent + one user, so two users running the same
 * marketplace agent can never read each other's remembered state.
 */
export class AgentMemory {
  private readonly namespace: string;

  constructor(
    private readonly store: MemoryStore,
    options: { namespace: string; userId?: string | null; ttlHours?: number; enabled?: boolean }
  ) {
    this.namespace = `${options.namespace}:${options.userId ?? "anon"}`;
    this.ttlSeconds = Math.round((options.ttlHours ?? 24) * 3600);
    this.enabled = options.enabled !== false;
  }

  private readonly ttlSeconds: number;
  private readonly enabled: boolean;

  async recall(key: string): Promise<unknown | null> {
    if (!this.enabled) return null;
    return this.store.get(this.namespace, key);
  }

  async remember(key: string, value: unknown): Promise<void> {
    if (!this.enabled) return;
    await this.store.set(this.namespace, key, value, this.ttlSeconds || undefined);
  }

  async forget(key: string): Promise<void> {
    if (!this.enabled) return;
    await this.store.delete(this.namespace, key);
  }

  async keys(): Promise<string[]> {
    if (!this.enabled) return [];
    return this.store.list(this.namespace);
  }
}
