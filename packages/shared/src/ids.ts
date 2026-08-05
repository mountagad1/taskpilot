// ============================================================
// TASKPILOT — ID + SLUG HELPERS
// packages/shared/src/ids.ts
// ============================================================

/**
 * UUID v4 using the platform CSPRNG. Present in service workers, modern
 * browsers and Node 19+; the manual path covers older Node used by CI.
 */
export function newId(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalCrypto?.getRandomValues) {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Short, sortable-ish id for run steps and log lines. Not for storage keys. */
export function shortId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${rand}` : rand;
}

/** Lowercase kebab-case slug. Falls back to a random suffix if input is empty. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return base || `agent-${shortId()}`;
}

/** Stable 32-bit hash. Used for cache keys, never for security. */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** `1.2.3` → `1.2.4`. Used when publishing a new agent version. */
export function bumpPatch(version: string): string {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "1.0.0";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/** Numeric semver comparison: negative when `a` precedes `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
