// ============================================================
// TASKPILOT API — APPLICATION
// services/api/src/app.ts
//
// Builds the Hono app. Exported separately from the server entry point so
// tests can drive it with `app.request(...)` — no port, no process, no
// network — which is what makes the route tests fast and deterministic.
// ============================================================

import { Hono } from "hono";
import { API_SCOPES } from "@taskpilot/shared";

import { agentRoutes } from "./routes/agents";
import { authRoutes } from "./routes/auth";
import { integrationRoutes } from "./routes/integrations";
import { runRoutes } from "./routes/runs";
import {
  keyRoutes,
  marketplaceRoutes,
  notificationRoutes,
  teamRoutes,
  workflowRoutes,
} from "./routes/platform";
import {
  aiRoutes,
  analyticsRoutes,
  billingRoutes,
  exportRoutes,
  workerRoutes,
} from "./routes/misc";
import { caller, guard, recordKeyUsage, resolveCaller, toErrorResponse } from "./middleware/kernel";
import { ok } from "./lib/errors";
import { hasSupabaseCredentials } from "./lib/clients";

/** Origins allowed to call this API from a browser. */
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  // The extension's origin is unpredictable per install, so the scheme is
  // what is trusted here; Chrome guarantees only an installed extension can
  // present it.
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;

  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.includes(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)*taskpilot\.cc$/.test(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;

  return false;
}

export function createApp(): Hono {
  const app = new Hono();

  // ── CORS ──
  app.use("*", async (c, next): Promise<Response | void> => {
    const origin = c.req.header("origin") ?? "";
    const allowed = isAllowedOrigin(origin);

    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowed ? origin : "null",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-API-Key, X-Extension-Version, X-Session-ID, X-Worker-Secret",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    await next();

    if (allowed) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set("Vary", "Origin");
    }
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("Referrer-Policy", "no-referrer");
  });

  // ── Observability + key usage ──
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();

    const duration = Date.now() - started;
    c.res.headers.set("X-Response-Time", `${duration}ms`);

    // The guard already resolved the caller; re-resolving here would double
    // every auth round trip, so only do it when a key was actually presented.
    if (c.req.header("x-api-key") ?? c.req.header("authorization")?.includes("tp_live_")) {
      const resolved = c.get("caller") ?? null;
      void recordKeyUsage(
        resolved,
        c.req.method,
        new URL(c.req.url).pathname,
        c.res.status,
        duration
      );
    }
  });

  // ── Health ──
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "taskpilot-api",
      version: process.env.npm_package_version ?? "1.0.0",
      database: hasSupabaseCredentials() ? "configured" : "unconfigured",
      ai: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ? "configured" : "unconfigured",
      time: new Date().toISOString(),
    })
  );

  // ── Discovery ──
  app.get("/v1", (c) =>
    c.json({
      data: {
        name: "TaskPilot API",
        version: "1.0.0",
        documentation: "https://taskpilot.cc/docs/api",
        authentication: {
          scheme: "Bearer",
          api_key: "Authorization: Bearer tp_live_...",
          user_session: "Authorization: Bearer <supabase-access-token>",
          alternative_header: "X-API-Key",
          obtain_at: "https://taskpilot.cc/dashboard/developers",
          scopes: API_SCOPES,
        },
        resources: {
          agents: {
            list: "GET /v1/agents",
            create: "POST /v1/agents",
            get: "GET /v1/agents/{id}",
            update: "PATCH /v1/agents/{id}",
            publish: "POST /v1/agents/{id}/publish",
            install: "POST /v1/agents/{id}/install",
            manifest: "GET /v1/agents/{id}/manifest",
          },
          runs: {
            list: "GET /v1/runs",
            create: "POST /v1/runs",
            get: "GET /v1/runs/{id}",
            report_step: "POST /v1/runs/{id}/steps",
            complete: "PATCH /v1/runs/{id}",
            cancel: "POST /v1/runs/{id}/cancel",
          },
          workflows: { list: "GET /v1/workflows", create: "POST /v1/workflows" },
          integrations: {
            list: "GET /v1/integrations",
            status: "GET /v1/integrations/status",
            authorize: "POST /v1/integrations/{provider}/authorize",
            callback: "GET /v1/integrations/{provider}/callback",
            push: "POST /v1/integrations/{provider}/push",
            disconnect: "DELETE /v1/integrations/{provider}",
          },
          marketplace: { browse: "GET /v1/marketplace/agents" },
          exports: { create: "POST /v1/exports" },
          auth: {
            login: "POST /v1/auth/login",
            signup: "POST /v1/auth/signup",
            refresh: "POST /v1/auth/refresh",
            logout: "POST /v1/auth/logout",
          },
        },
        conventions: {
          success: '{ "data": ... }',
          list: '{ "data": [...], "meta": { "total": n, "page": n, "per_page": n } }',
          error: '{ "error": { "code": "...", "message": "...", "issues": [...] } }',
          pagination: "page and per_page query parameters; per_page is capped at 100",
          rate_limits: "Per-caller, per-endpoint. 429 responses carry a Retry-After header.",
        },
        sdk: { javascript: "@taskpilot/sdk", install: "npm install @taskpilot/sdk" },
      },
    })
  );

  // ── Identity ──
  // The dashboard calls this right after sign-in: it confirms the token this
  // service will accept and returns the plan the UI gates features on.
  v1Me(app);

  // ── Resources ──
  // One mount serves both the dashboard and the public developer API: a
  // single implementation is what keeps the documented API from drifting
  // away from what the product actually does.
  const v1 = new Hono();
  v1.route("/auth", authRoutes);
  v1.route("/agents", agentRoutes);
  v1.route("/runs", runRoutes);
  v1.route("/workflows", workflowRoutes);
  v1.route("/notifications", notificationRoutes);
  v1.route("/teams", teamRoutes);
  v1.route("/keys", keyRoutes);
  v1.route("/integrations", integrationRoutes);
  v1.route("/marketplace", marketplaceRoutes);
  v1.route("/analytics", analyticsRoutes);
  v1.route("/exports", exportRoutes);
  v1.route("/ai", aiRoutes);
  v1.route("/billing", billingRoutes);
  v1.route("/jobs/worker", workerRoutes);

  app.route("/v1", v1);

  // ── Errors ──
  app.notFound((c) =>
    c.json(
      { error: { code: "not_found", message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } },
      404
    )
  );

  app.onError((err, c) => toErrorResponse(err, c.req.method, new URL(c.req.url).pathname));

  return app;
}

/** Mounted before the resource routers so `/v1/me` is not shadowed. */
function v1Me(app: Hono): void {
  app.get("/v1/me", guard({ rateLimit: 120 }), (c) => {
    const me = caller(c);
    return ok({
      user_id: me.userId,
      email: me.email,
      plan: me.plan,
      auth_mode: me.mode,
      scopes: me.scopes,
    });
  });
}

export type App = ReturnType<typeof createApp>;
export { resolveCaller };
