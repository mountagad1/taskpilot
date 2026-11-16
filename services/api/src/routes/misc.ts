// ============================================================
// TASKPILOT API — ANALYTICS, EXPORTS, AI PROXY, BILLING, WORKER
// services/api/src/routes/misc.ts
// ============================================================

import { Hono } from "hono";

import { getAdminClient, hasStripeCredentials, hasSupabaseCredentials } from "../lib/clients";
import { createAgentCheckout } from "../lib/marketplace";
import {
  WebhookSignatureError,
  appOrigin,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
  hasEverSubscribed,
  hasLiveSubscription,
  priceForPlan,
  proTrialDays,
} from "../lib/billing";
import { processJobs } from "../lib/worker";
import { getSemanticCache, providerRouterFromEnv } from "../runtime";
import { ApiError, badRequest, conflict, notConfigured, ok, validationFailed } from "../lib/errors";
import { caller, guard, readJson, query } from "../middleware/kernel";
import { toRows, toCSV, toJSON } from "@taskpilot/browser-tools/export";
import { SmartPasteEngine } from "@taskpilot/browser-tools/smart-paste";

// ─── ANALYTICS ───────────────────────────────────────────────

export const analyticsRoutes = new Hono();

interface RunSlice {
  status: string;
  agent_id: string | null;
  domain: string | null;
  tokens_used: number;
  cost_usd: number | string;
  duration_ms: number | null;
  started_at: string;
}

/**
 * Aggregated here rather than in the database: the row counts are per-user
 * and small, and keeping it in code lets the shape change without a migration.
 */
analyticsRoutes.get("/", guard({ scopes: ["runs:read"], rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const days = clamp(Number(query(c, "days") ?? 30), 1, 365);
  const since = new Date(Date.now() - days * 86_400_000);
  const admin = getAdminClient();

  const [runsResult, agentsResult] = await Promise.all([
    admin
      .from("agent_runs")
      .select("status, agent_id, domain, tokens_used, cost_usd, duration_ms, started_at")
      .eq("user_id", me.userId)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: true })
      .limit(5000),
    admin
      .from("marketplace_agents")
      .select("id, name, slug, install_count, run_count, sales_count, price_cents, rating_avg")
      .eq("owner_id", me.userId),
  ]);

  if (runsResult.error) throw badRequest(runsResult.error.message);

  const runs = (runsResult.data ?? []) as RunSlice[];
  const agents = agentsResult.data ?? [];

  const completed = runs.filter((r) => r.status === "completed");
  const failed = runs.filter((r) => r.status === "failed" || r.status === "timed_out");

  const durations = completed
    .map((r) => r.duration_ms ?? 0)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  return ok({
    period_days: days,
    totals: {
      runs: runs.length,
      completed: completed.length,
      failed: failed.length,
      success_rate: runs.length ? Math.round((completed.length / runs.length) * 1000) / 10 : null,
      tokens: runs.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0),
      cost_usd: round(runs.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0), 4),
      avg_duration_ms: durations.length ? Math.round(mean(durations)) : null,
      // The median is far more representative here: one pathological run
      // skews the mean badly.
      median_duration_ms: durations.length ? median(durations) : null,
    },
    daily: buildDailySeries(runs, days),
    top_domains: topBy(runs, (r) => r.domain).slice(0, 8),
    published: {
      agents: agents.length,
      installs: agents.reduce((sum, a) => sum + (a.install_count ?? 0), 0),
      runs: agents.reduce((sum, a) => sum + (a.run_count ?? 0), 0),
      sales: agents.reduce((sum, a) => sum + (a.sales_count ?? 0), 0),
      gross_cents: agents.reduce((sum, a) => sum + (a.sales_count ?? 0) * (a.price_cents ?? 0), 0),
      top: agents
        .slice()
        .sort((a, b) => (b.run_count ?? 0) - (a.run_count ?? 0))
        .slice(0, 5),
    },
  });
});

function buildDailySeries(runs: RunSlice[], days: number) {
  const buckets = new Map<
    string,
    { date: string; runs: number; completed: number; failed: number; cost_usd: number }
  >();

  // Seed every day in range so the chart series is continuous.
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    buckets.set(date, { date, runs: 0, completed: 0, failed: 0, cost_usd: 0 });
  }

  for (const run of runs) {
    const bucket = buckets.get(run.started_at.slice(0, 10));
    if (!bucket) continue;
    bucket.runs++;
    if (run.status === "completed") bucket.completed++;
    if (run.status === "failed" || run.status === "timed_out") bucket.failed++;
    bucket.cost_usd += Number(run.cost_usd ?? 0);
  }

  return [...buckets.values()].map((b) => ({ ...b, cost_usd: round(b.cost_usd, 4) }));
}

function topBy(runs: RunSlice[], key: (run: RunSlice) => string | null) {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const value = key(run);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

/** `values` must already be sorted ascending. */
function median(values: number[]): number {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// ─── EXPORTS ─────────────────────────────────────────────────

export const exportRoutes = new Hono();

exportRoutes.post("/", guard({ scopes: ["exports:write"], rateLimit: 30 }), async (c) => {
  const body = await readJson(c);
  const format = String(body.format ?? "csv").toLowerCase();
  const rows = toRows(body.data ?? body.rows);
  const filename = typeof body.filename === "string" ? body.filename : "taskpilot-export";
  const headers = Array.isArray(body.headers) ? (body.headers as string[]) : undefined;

  if (!rows.length) throw badRequest("There is nothing to export");

  if (format === "csv") {
    return new Response(toCSV(rows, headers), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  if (format === "json") {
    return new Response(toJSON(rows), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}.json"`,
      },
    });
  }

  if (format === "excel") {
    // Loaded on demand: the xlsx encoder is large and most exports are CSV.
    const XLSX = await import("xlsx");
    const columns = headers ?? Object.keys(rows[0]);
    const sheet = XLSX.utils.aoa_to_sheet([
      columns,
      ...rows.map((row) => columns.map((col) => (row as Record<string, unknown>)[col] ?? "")),
    ]);

    sheet["!cols"] = columns.map((col) => ({
      wch: Math.min(
        Math.max(col.length, ...rows.map((r) => String((r as Record<string, unknown>)[col] ?? "").length)) + 2,
        50
      ),
    }));

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "TaskPilot Export");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  throw validationFailed([{ path: "format", message: `Unsupported format: ${format}` }]);
});

// ─── AI PROXY ────────────────────────────────────────────────

export const aiRoutes = new Hono();

const TASK_PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  summarize: (ctx) => `Summarize the following webpage content concisely:\n\n${ctx.content}`,
  translate: (ctx) =>
    `Translate the following content to ${ctx.target_language || "English"}:\n\n${ctx.content}`,
  extract_data: (ctx) =>
    `Extract all structured data from the following content. Return JSON.\n\n${ctx.content}`,
  generate_reply: (ctx) =>
    `Write a ${ctx.tone || "professional"} reply to the following:\n\n${ctx.content}`,
  rewrite: (ctx) =>
    `Rewrite the following text in a ${ctx.tone || "professional"} tone:\n\n${ctx.content}`,
  custom: (ctx) => `${ctx.question || ctx.instruction || ""}\n\nContent:\n${ctx.content}`,
};

/**
 * Runs an AI-only action for the extension. The API key stays server-side —
 * this is the whole reason the extension proxies through here rather than
 * calling a model provider directly.
 */
aiRoutes.post("/process", guard({ scopes: ["runs:write"], rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);

  const task = String(body.task ?? "custom");
  const builder = TASK_PROMPTS[task] ?? TASK_PROMPTS.custom;

  const pageContext = (body.pageContext ?? {}) as Record<string, unknown>;
  const options = (body.options ?? {}) as Record<string, unknown>;

  const content = String(pageContext.content ?? "").slice(0, 8000);
  if (!content) throw badRequest("There is no page content to work with");

  const router = providerRouterFromEnv();
  if (!router.isLive) {
    throw notConfigured("No AI provider is configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }

  const promptContext: Record<string, string> = {
    content,
    question: String(body.userInput ?? options.question ?? ""),
    instruction: String(options.instruction ?? ""),
    tone: String(options.tone ?? ""),
    target_language: String(options.target_language ?? ""),
  };

  const prompt = builder(promptContext);
  const model = task === "custom" || task === "generate_reply" ? "gpt-4.1" : "gpt-4.1-mini";

  const cache = getSemanticCache();
  const cacheKey = cache.generateKey({
    scope: me.userId,
    task,
    model,
    pageContent: content,
    userInput: promptContext.question,
    url: String(pageContext.url ?? ""),
    options: {
      instruction: promptContext.instruction,
      tone: promptContext.tone,
      target_language: promptContext.target_language,
    },
  });

  const cached = await cache.get(cacheKey);
  if (cached) return ok({ result: cached, cached: true, task });

  const response = await router.complete({
    model,
    max_tokens: 1500,
    temperature: 0.2,
    json: task === "extract_data",
    messages: [
      {
        role: "system",
        content:
          "You are TaskPilot, an AI assistant embedded in the browser. Be concise and accurate, and answer in the same language as the content.",
      },
      { role: "user", content: prompt },
    ],
  });

  await cache.set(cacheKey, response.content, {
    task,
    model,
    tokensUsed: response.usage.total_tokens,
  });

  // Cost attribution: without this row a user's analytics undercount every
  // AI action the extension performed.
  await getAdminClient()
    .from("ai_requests")
    .insert({
      user_id: me.userId,
      task_type: task === "custom" ? "custom_prompt" : task,
      model_used: response.model,
      total_tokens: response.usage.total_tokens,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      cost_usd: response.usage.estimated_cost_usd,
      url: String(pageContext.url ?? ""),
      cached: false,
    })
    .then(
      () => undefined,
      () => undefined
    );

  return ok({
    result: response.content,
    cached: false,
    task,
    model: response.model,
    tokens_used: response.usage.total_tokens,
  });
});

/**
 * Parses pasted text into typed contact fields. Pure regex and heuristics —
 * no model call, so it is free, instant, and safe to run on every keystroke
 * in the playground.
 */
aiRoutes.post("/smart-paste", guard({ scopes: ["runs:write"], rateLimit: 120 }), async (c) => {
  const body = await readJson(c);
  const text = String(body.clipboardText ?? body.text ?? "").slice(0, 5000);

  if (!text.trim()) throw badRequest("There is no text to parse");

  const pageContext = (body.pageContext ?? {}) as Record<string, unknown>;

  const engine = new SmartPasteEngine();
  const result = engine.parse({
    clipboard_text: text,
    session_id: "playground",
    page_context: {
      url: String(pageContext.url ?? ""),
      title: String(pageContext.title ?? ""),
      visible_text: "",
      detected_forms: Array.isArray(pageContext.forms)
        ? (pageContext.forms as never[])
        : Array.isArray(pageContext.detected_forms)
          ? (pageContext.detected_forms as never[])
          : [],
      detected_tables: [],
      page_type: "form",
      domain: "",
    },
  });

  return ok({
    mappings: result.mappings,
    unmapped: result.unmapped_data,
    confidence: result.confidence,
    layers: result.parsing_layers_used,
  });
});

// ─── BILLING ─────────────────────────────────────────────────

export const billingRoutes = new Hono();

billingRoutes.post("/checkout", guard({ allow: ["session"], rateLimit: 20 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);
  const agentId = String(body.agentId ?? body.agent_id ?? "");

  if (!agentId) throw badRequest("An agentId is required");
  if (!hasStripeCredentials()) throw notConfigured("Billing is not configured for this deployment");

  // Never the request's Origin header: the buyer lands on this URL after
  // paying, so a caller-supplied origin would be an open redirect.
  const result = await createAgentCheckout({
    agentId,
    buyerId: me.userId,
    buyerEmail: me.email,
    appOrigin: appOrigin(),
  });

  if ("error" in result) throw new ApiError(statusToCode(result.status), result.error);
  return ok(result);
});

/**
 * Starts a subscription Checkout. Body: { plan: "pro" | "enterprise",
 * interval?: "monthly" | "annual" }. Returns { url } to redirect the browser
 * to. Session-only: a machine key must not be able to start a subscription.
 */
billingRoutes.post("/subscribe", guard({ allow: ["session"], rateLimit: 10 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);

  const plan = body.plan;
  if (plan !== "pro" && plan !== "enterprise") throw badRequest('plan must be "pro" or "enterprise"');

  const interval = body.interval ?? "monthly";
  if (interval !== "monthly" && interval !== "annual") {
    throw badRequest('interval must be "monthly" or "annual"');
  }
  if (plan === "enterprise" && interval === "annual") {
    throw badRequest("Enterprise is billed monthly");
  }

  if (!hasStripeCredentials()) throw notConfigured("Billing is not configured for this deployment");

  const priceId = priceForPlan(plan, interval);
  if (!priceId) throw notConfigured(`The ${plan} ${interval} plan is not available on this deployment`);

  // A second Checkout would create a second, parallel subscription; plan
  // changes and cancellation go through the portal instead.
  if (await hasLiveSubscription(me.userId)) {
    throw conflict("You already have an active subscription. Use the billing portal to change plans.");
  }

  // One trial per user, Pro only. Enterprise is sold through sales.
  const trialDays = plan === "pro" && !(await hasEverSubscribed(me.userId)) ? proTrialDays() : 0;

  const app = appOrigin();
  const { url } = await createCheckoutSession({
    userId: me.userId,
    email: me.email,
    priceId,
    trialDays,
    successUrl: `${app}/dashboard/settings?billing=success`,
    cancelUrl: `${app}/dashboard/settings?billing=canceled`,
  });

  return ok({ url });
});

/**
 * Opens the Stripe customer portal (change plan, payment method, invoices,
 * cancel). No body. Returns { url }. 404 if the user has never subscribed.
 */
billingRoutes.post("/portal", guard({ allow: ["session"], rateLimit: 20 }), async (c) => {
  const me = caller(c);
  if (!hasStripeCredentials()) throw notConfigured("Billing is not configured for this deployment");

  const { url } = await createPortalSession({
    userId: me.userId,
    returnUrl: `${appOrigin()}/dashboard/settings`,
  });

  return ok({ url });
});

/**
 * Stripe webhook. Unauthenticated by design — Stripe cannot present a user
 * token; the signature header is the credential, verified in handleWebhookEvent.
 */
billingRoutes.post("/webhook", async (c) => {
  if (!hasStripeCredentials()) throw notConfigured("Billing is not configured");

  const signature = c.req.header("stripe-signature");
  if (!signature) throw badRequest("Missing stripe-signature header");

  // The raw body is required: Stripe signs the exact bytes, so parsing and
  // re-serialising would invalidate the signature.
  const raw = await c.req.text();

  // A bad signature is the caller's fault (400). Any other failure is ours
  // and propagates as a 5xx so Stripe retries the delivery — the event's
  // idempotency claim was released, so the retry is processed afresh.
  let result: { duplicate: boolean };
  try {
    result = await handleWebhookEvent(raw, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) throw badRequest(err.message);
    throw err;
  }

  return ok({ received: true, duplicate: result.duplicate });
});

function statusToCode(status: number) {
  const map: Record<number, ApiError["code"]> = {
    400: "bad_request",
    402: "payment_required",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    500: "internal_error",
  };
  return map[status] ?? "bad_request";
}

// ─── WORKER ──────────────────────────────────────────────────

export const workerRoutes = new Hono();

/**
 * Drains one batch of background jobs. Authenticated by a shared secret
 * rather than a user token — there is no user behind a cron tick.
 */
workerRoutes.all("/", async (c) => {
  const secret = process.env.WORKER_SECRET;

  // Refuse to run unauthenticated: otherwise anyone could drive the queue,
  // including replaying scheduled workflows at will.
  if (!secret) throw notConfigured("Set WORKER_SECRET before enabling the background worker");

  const presented =
    c.req.header("x-worker-secret") ??
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!timingSafeEqual(presented, secret)) {
    throw new ApiError("unauthorized", "Invalid worker credentials");
  }

  if (!hasSupabaseCredentials()) throw notConfigured("No database is configured");

  // Normalisation lives in resolveBatchSize, so the route does not have to
  // re-derive what counts as a usable value.
  return ok(await processJobs({ batchSize: query(c, "batch") }));
});

/** Constant-time comparison so the secret cannot be recovered by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
