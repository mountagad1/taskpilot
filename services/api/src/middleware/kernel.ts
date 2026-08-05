// ============================================================
// TASKPILOT API — REQUEST KERNEL
// services/api/src/middleware/kernel.ts
//
// Resolves the caller, enforces scopes, applies rate limiting and turns
// thrown ApiErrors into the shared envelope. Handlers stay small and only
// express their own logic.
//
// The dashboard now lives on a different origin than this service, so a
// session cookie no longer reaches us. Callers authenticate with a Bearer
// token instead — either a Supabase user JWT or a TaskPilot API key. That is
// also why every route is explicit about which credential types it accepts:
// a long-lived machine key must not be able to mint more keys.
// ============================================================

import type { Context, MiddlewareHandler } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { API_SCOPES, type ApiScope, type PlanType } from "@taskpilot/shared";

import { getAdminClient, hasSupabaseCredentials } from "../lib/clients";
import { checkRateLimit } from "../lib/security";
import { ApiError, forbidden, notConfigured, rateLimited, unauthorized } from "../lib/errors";
import { extractApiKey, hashApiKey, isApiKey } from "../lib/keys";

// ─── CALLER ──────────────────────────────────────────────────

export type AuthMode = "session" | "api_key";

export interface Caller {
  userId: string;
  email: string;
  plan: PlanType;
  mode: AuthMode;
  /** Session callers hold every scope; key callers hold only what was granted. */
  scopes: ApiScope[];
  apiKeyId?: string;
  /**
   * Service-role client. The API authenticates the caller itself and then
   * filters by `userId` explicitly — there is no cookie left to scope RLS by
   * once the frontend is on another origin.
   */
  db: SupabaseClient;
}

declare module "hono" {
  interface ContextVariableMap {
    caller: Caller | null;
  }
}

// ─── AUTH RESOLUTION ─────────────────────────────────────────

async function resolveApiKeyCaller(token: string): Promise<Caller> {
  if (!hasSupabaseCredentials()) throw notConfigured("This deployment has no database configured");

  const admin = getAdminClient();
  const hash = await hashApiKey(token);

  const { data: record } = await admin
    .from("api_keys")
    .select("id, user_id, scopes, expires_at, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!record || record.revoked_at) throw unauthorized("This API key is not valid");
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    throw unauthorized("This API key has expired");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email, plan")
    .eq("id", record.user_id)
    .maybeSingle();

  // Fire-and-forget: a slow write must not add latency to the request.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", record.id);

  return {
    userId: record.user_id,
    email: profile?.email ?? "",
    plan: (profile?.plan as PlanType) ?? "free",
    mode: "api_key",
    scopes: (record.scopes ?? []) as ApiScope[],
    apiKeyId: record.id,
    db: admin,
  };
}

/**
 * Validates a Supabase access token. `getUser(jwt)` verifies the signature
 * against the project's keys — it is not a claims-only decode, so a forged
 * token is rejected here rather than deeper in a handler.
 */
async function resolveSessionCaller(token: string): Promise<Caller> {
  if (!hasSupabaseCredentials()) throw notConfigured("This deployment has no database configured");

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) throw unauthorized("Your session has expired. Sign in again.");

  const { data: profile } = await admin
    .from("profiles")
    .select("email, plan")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    userId: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    plan: (profile?.plan as PlanType) ?? "free",
    mode: "session",
    // Someone acting through the UI is not scope-limited; scopes exist to
    // constrain long-lived machine credentials.
    scopes: [...API_SCOPES],
    db: admin,
  };
}

/** Returns null when no credential is presented at all. */
export async function resolveCaller(c: Context): Promise<Caller | null> {
  const presented = extractApiKey(c.req.raw.headers);
  if (presented) return resolveApiKeyCaller(presented);

  const authorization = c.req.header("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token) return null;

  // A `tp_live_` token would have been caught above; reaching here with one
  // means it was malformed.
  if (isApiKey(token)) throw unauthorized("This API key is not valid");

  return resolveSessionCaller(token);
}

// ─── MIDDLEWARE ──────────────────────────────────────────────

export interface GuardOptions {
  /** Reject unauthenticated callers. Default true. */
  auth?: boolean;
  /** Scopes an API-key caller must hold. Ignored for session callers. */
  scopes?: ApiScope[];
  /** Requests allowed per minute, per caller. */
  rateLimit?: number;
  /** Restrict which credential types may reach this route. */
  allow?: AuthMode[];
}

/**
 * Per-route guard. Attaches the resolved caller to the context so handlers
 * read it with `caller(c)` rather than re-resolving it.
 */
export function guard(options: GuardOptions = {}): MiddlewareHandler {
  const requireAuth = options.auth !== false;

  return async (c, next) => {
    const resolved = await resolveCaller(c);

    if (requireAuth && !resolved) throw unauthorized();

    if (resolved) {
      if (options.allow && !options.allow.includes(resolved.mode)) {
        throw forbidden(
          resolved.mode === "api_key"
            ? "This endpoint cannot be called with an API key"
            : "This endpoint requires an API key"
        );
      }

      const missing = (options.scopes ?? []).filter((s) => !resolved.scopes.includes(s));
      if (missing.length) {
        throw forbidden(`This key is missing the required scope(s): ${missing.join(", ")}`);
      }
    }

    if (options.rateLimit) {
      const identity = resolved?.apiKeyId ?? resolved?.userId ?? clientIp(c);
      const result = await checkRateLimit(new URL(c.req.url).pathname, identity, options.rateLimit);
      if (!result.allowed) {
        throw rateLimited(Math.max(1, result.reset - Math.floor(Date.now() / 1000)));
      }
    }

    c.set("caller", resolved);
    await next();
  };
}

/** Reads the caller a `guard()` resolved. Throws if a route forgot the guard. */
export function caller(c: Context): Caller {
  const value = c.get("caller");
  if (!value) throw unauthorized();
  return value;
}

/** For endpoints that serve both signed-in and anonymous callers. */
export function optionalCaller(c: Context): Caller | null {
  return c.get("caller") ?? null;
}

// ─── ERROR HANDLING ──────────────────────────────────────────

/** Converts anything thrown in a handler into the shared error envelope. */
export function toErrorResponse(err: unknown, method: string, path: string): Response {
  const apiError =
    err instanceof ApiError
      ? err
      : new ApiError("internal_error", err instanceof Error ? err.message : "Unexpected error");

  // Only genuine faults are worth a stack trace; a 401 is not news.
  if (apiError.code === "internal_error") {
    console.error(`[api] ${method} ${path}`, err);
  }

  return apiError.toResponse();
}

/** Records API-key usage once the response is known. Never throws. */
export async function recordKeyUsage(
  resolved: Caller | null,
  method: string,
  path: string,
  status: number,
  durationMs: number
): Promise<void> {
  if (!resolved?.apiKeyId) return;
  try {
    await getAdminClient().from("api_key_usage").insert({
      api_key_id: resolved.apiKeyId,
      endpoint: path,
      method,
      status_code: status,
      duration_ms: durationMs,
    });
  } catch {
    // Usage analytics are not worth failing a request over.
  }
}

// ─── REQUEST HELPERS ─────────────────────────────────────────

export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

/** Parses a JSON body, converting malformed input into a 400. */
export async function readJson(c: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    throw new ApiError("bad_request", "Request body is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError("bad_request", "Request body must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

/** Same as readJson, but an absent or malformed body yields an empty object. */
export async function readOptionalJson(c: Context): Promise<Record<string, unknown>> {
  try {
    return await readJson(c);
  } catch {
    return {};
  }
}

/** Clamped pagination so a client cannot ask for the whole table. */
export function readPagination(c: Context, defaultPerPage = 25) {
  const params = new URL(c.req.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(params.get("per_page") ?? String(defaultPerPage), 10) || defaultPerPage
    )
  );
  return { page, perPage, from: (page - 1) * perPage, to: page * perPage - 1 };
}

export function query(c: Context, key: string): string | null {
  return new URL(c.req.url).searchParams.get(key);
}
