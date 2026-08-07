// ============================================================
// TASKPILOT API — RATE LIMITING & ABUSE DETECTION
// services/api/src/lib/security.ts
//
// Everything Next-specific (CSP headers, CORS, request fingerprinting) now
// lives in the Hono app and its middleware; what remains here is the part
// that is genuinely about protecting the backend from load and abuse.
// ============================================================

interface RateLimitConfig {
  requests: number;
  window: number; // seconds
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/ai/smart-paste": { requests: 30, window: 60 },
  "/api/ai/process": { requests: 60, window: 60 },
  "/api/auth/session": { requests: 10, window: 60 },
  "/api/stripe": { requests: 20, window: 60 },
  "/api/export": { requests: 10, window: 60 },
  default: { requests: 100, window: 60 },
};

/**
 * Per-process fallback counter. Used when Upstash is not configured, which
 * is the normal state in local development and CI. It is not shared across
 * serverless instances, so it under-counts in production — that is why the
 * Redis path exists — but it beats not limiting at all.
 */
const localWindows = new Map<string, { count: number; resetAt: number }>();

/**
 * Test seam: clears the in-process counters.
 *
 * Windows are keyed by path and caller and last a full minute, so without
 * this one test that exercises a limit starves every later test in the same
 * file — a failure that looks like a broken route rather than a shared
 * counter.
 */
export function resetRateLimits(): void {
  localWindows.clear();
}

function localRateLimit(key: string, config: RateLimitConfig) {
  const now = Date.now();
  const existing = localWindows.get(key);

  if (!existing || existing.resetAt <= now) {
    const entry = { count: 1, resetAt: now + config.window * 1000 };
    localWindows.set(key, entry);

    // Opportunistic sweep so a long-lived instance doesn't accumulate keys.
    if (localWindows.size > 5000) {
      for (const [k, v] of localWindows) if (v.resetAt <= now) localWindows.delete(k);
    }

    return { allowed: true, remaining: config.requests - 1, reset: Math.floor(entry.resetAt / 1000) };
  }

  existing.count++;
  return {
    allowed: existing.count <= config.requests,
    remaining: Math.max(0, config.requests - existing.count),
    reset: Math.floor(existing.resetAt / 1000),
  };
}

export async function checkRateLimit(
  path: string,
  identifier: string,
  requestsPerMinute?: number
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const config: RateLimitConfig = requestsPerMinute
    ? { requests: requestsPerMinute, window: 60 }
    : RATE_LIMITS[path] || RATE_LIMITS["default"];

  const key = `rl:${path}:${identifier}`;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!upstashUrl || !upstashToken) return localRateLimit(key, config);

  try {
    const response = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, config.window],
        ["TTL", key],
      ]),
    });

    if (!response.ok) return localRateLimit(key, config);

    const pipeline = (await response.json()) as Array<[unknown, number]>;
    const count = Number(pipeline[0]?.[1] ?? 0);
    const ttl = Number(pipeline[2]?.[1] ?? 0);
    const remaining = Math.max(0, config.requests - count);
    const reset = Math.floor(Date.now() / 1000) + (ttl || config.window);

    return { allowed: count <= config.requests, remaining, reset };
  } catch {
    // Redis unreachable: degrade to the local counter rather than removing
    // the limit entirely.
    return localRateLimit(key, config);
  }
}

// ─── ABUSE DETECTION ─────────────────────────────────────────

export async function detectAbuse(
  identifier: string,
  action: string
): Promise<{ abuse: boolean; reason?: string }> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL!;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN!;

  try {
    // Check burst patterns (more than 10 requests in 5 seconds)
    const burstKey = `burst:${identifier}`;
    const burstResponse = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", burstKey],
        ["EXPIRE", burstKey, 5],
      ]),
    });
    const burst = (await burstResponse.json()) as Array<[unknown, number]>;
    const burstCount = Number(burst[0]?.[1] ?? 0);
    if (burstCount > 15) {
      return { abuse: true, reason: "burst_detected" };
    }

    // Check if identifier is blocked
    const blockResponse = await fetch(`${upstashUrl}/get/blocked:${identifier}`, {
      headers: { Authorization: `Bearer ${upstashToken}` },
    });
    const blockData = (await blockResponse.json()) as { result?: unknown };
    if (blockData.result) {
      return { abuse: true, reason: "blocked" };
    }

    return { abuse: false };
  } catch {
    return { abuse: false };
  }
}

