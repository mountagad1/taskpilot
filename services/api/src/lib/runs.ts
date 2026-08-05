// ============================================================
// TASKPILOT — RUN SERVICE
// services/api/src/lib/runs.ts
//
// The server plans; the extension executes. A run is created here with a
// plan attached, the extension pulls the steps, dispatches them against the
// live page, and reports each result back. That split is what lets an agent
// act inside the user's authenticated session without the backend ever
// holding their cookies.
// ============================================================

import {
  DEFAULT_RUN_LIMITS,
  PLAN_LIMITS,
  parseAgentManifest,
  type ActionPlan,
  type BrowserActionType,
  type PageContext,
  type PlanType,
  capabilitiesForPlan,
  gateCapabilities,
  type RunStatus,
} from "@taskpilot/shared";
import { Planner, providerRouterFromEnv } from "../runtime";

import { getAdminClient } from "./clients";
import { badRequest, forbidden, notFound, planLimit, validationFailed } from "./errors";
import type { Caller } from "../middleware/kernel";
import { asRow, type RunRow } from "./rows";

export const RUN_COLUMNS =
  "id, user_id, agent_id, workflow_id, goal, status, plan, steps_total, steps_completed, " +
  "output, error, tokens_used, cost_usd, source_url, domain, started_at, finished_at, duration_ms";

const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled", "timed_out"];

// ─── CONTEXT VALIDATION ──────────────────────────────────────

/**
 * Page context arrives from a content script on an arbitrary site, so it is
 * untrusted input. Clamp it before it reaches a prompt or the database.
 */
export function sanitisePageContext(raw: unknown): PageContext {
  const input = (raw ?? {}) as Record<string, unknown>;
  const str = (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : "";

  let domain = str(input.domain, 200);
  const url = str(input.url, 2000);
  if (!domain && url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = "";
    }
  }

  return {
    url,
    title: str(input.title, 500),
    visible_text: str(input.visible_text, 20_000),
    meta_description: str(input.meta_description, 500) || undefined,
    selected_text: str(input.selected_text, 5000) || undefined,
    detected_forms: Array.isArray(input.detected_forms)
      ? (input.detected_forms.slice(0, 100) as PageContext["detected_forms"])
      : [],
    detected_tables: Array.isArray(input.detected_tables)
      ? (input.detected_tables.slice(0, 20) as PageContext["detected_tables"])
      : [],
    page_type: (typeof input.page_type === "string"
      ? input.page_type
      : "generic") as PageContext["page_type"],
    domain,
  };
}

// ─── USAGE ───────────────────────────────────────────────────

/** Monthly action allowance. Unlimited plans use -1. */
export async function assertWithinPlanLimits(caller: Caller): Promise<void> {
  const limit = PLAN_LIMITS[caller.plan]?.ai_actions_limit ?? 0;
  if (limit < 0) return;

  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const { count } = await getAdminClient()
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", caller.userId)
    .gte("started_at", periodStart.toISOString());

  if ((count ?? 0) >= limit) {
    throw planLimit(
      `You have used all ${limit} runs on the ${caller.plan} plan this month. Upgrade for unlimited runs.`
    );
  }
}

// ─── CREATE ──────────────────────────────────────────────────

export interface CreateRunInput {
  goal?: string;
  agent_id?: string;
  workflow_id?: string;
  inputs?: Record<string, unknown>;
  context?: unknown;
  dry_run?: boolean;
}

export interface CreatedRun {
  /** Null-id placeholder when `dry_run` was requested and nothing was stored. */
  run: RunRow | { id: null; status: string; goal: string };
  plan: ActionPlan;
  limits: { max_steps: number; token_budget: number; timeout_ms: number; confirm: BrowserActionType[] };
}

export async function createRun(caller: Caller, input: CreateRunInput): Promise<CreatedRun> {
  const context = sanitisePageContext(input.context);
  if (!context.url) {
    throw validationFailed([{ path: "context.url", message: "A page URL is required to plan a run" }]);
  }

  await assertWithinPlanLimits(caller);

  const admin = getAdminClient();

  // ── Resolve the source of truth for goal, capabilities and budgets ──
  let goal = String(input.goal ?? "").trim();
  let allowedActions = capabilitiesForPlan(caller.plan);
  let workflowSteps: ActionPlan["steps"] | undefined;
  let limits = { ...DEFAULT_RUN_LIMITS };
  let agentId: string | null = null;

  if (input.agent_id) {
    const resolved = await resolveAgentForRun(caller, input.agent_id);
    agentId = resolved.agentId;
    goal = goal || resolved.manifest.goal;
    workflowSteps = resolved.manifest.workflow;

    // The agent may only use the intersection of what it declared and what
    // the caller's plan permits — never more than either allows.
    const permitted = new Set(capabilitiesForPlan(caller.plan));
    allowedActions = resolved.manifest.capabilities.filter((c) => permitted.has(c));

    limits = {
      max_steps: Math.min(resolved.manifest.harness.max_steps, DEFAULT_RUN_LIMITS.max_steps * 4),
      token_budget: resolved.manifest.harness.token_budget_per_run,
      timeout_ms: resolved.manifest.harness.timeout_ms,
      confirm: resolved.manifest.harness.require_confirmation,
    };
  }

  if (!goal) {
    throw validationFailed([{ path: "goal", message: "Say what the agent should do" }]);
  }

  // ── Plan ──
  const router = providerRouterFromEnv();
  const planner = new Planner({
    provider: router.isLive ? router.resolve("gpt-4.1-mini") : undefined,
    model: "gpt-4.1-mini",
    allowedActions,
    maxSteps: limits.max_steps,
  });

  const outcome = workflowSteps?.length
    ? {
        plan: {
          id: crypto.randomUUID(),
          goal,
          steps: workflowSteps,
          source: "workflow" as const,
          confidence: 1,
          created_at: new Date().toISOString(),
        },
        usage: null,
      }
    : await planner.plan({ goal, context, inputs: input.inputs });

  const plan = outcome.plan;

  if (plan.clarification_needed) {
    throw badRequest(plan.clarification_needed);
  }
  if (!plan.steps.length) {
    throw badRequest("Could not turn that request into browser actions. Try rephrasing it.");
  }

  // Defence in depth: even a workflow baked into a manifest is re-checked
  // against the caller's plan before it is handed to the extension.
  const { blocked } = gateCapabilities(
    plan.steps.map((s) => s.action.type),
    caller.plan
  );
  if (blocked.length) {
    throw planLimit(`This run needs ${[...new Set(blocked)].join(", ")}, which your plan does not include.`);
  }

  if (input.dry_run) {
    return { run: { id: null, status: "planning", goal }, plan, limits };
  }

  // ── Persist ──
  const { data: created, error } = await admin
    .from("agent_runs")
    .insert({
      user_id: caller.userId,
      agent_id: agentId,
      workflow_id: input.workflow_id ?? null,
      goal,
      status: "running",
      plan,
      source_url: context.url,
      domain: context.domain,
      steps_total: plan.steps.length,
      tokens_used: outcome.usage?.total_tokens ?? 0,
      cost_usd: outcome.usage?.estimated_cost_usd ?? 0,
    })
    .select(RUN_COLUMNS)
    .single();

  if (error) throw badRequest(error.message);
  const run = asRow<RunRow>(created);

  // Seed the step rows so the timeline is complete from the first render,
  // rather than appearing one row at a time as results arrive.
  const stepRows = plan.steps.map((step, index) => ({
    run_id: run.id,
    step_index: index,
    step_id: step.id,
    action: step.action.type,
    status: "pending" as const,
  }));
  await admin.from("agent_run_steps").insert(stepRows);

  if (agentId) {
    await admin.rpc("increment_agent_runs", { agent_uuid: agentId });
    await admin
      .from("agent_installs")
      .update({ last_run_at: new Date().toISOString() })
      .eq("agent_id", agentId)
      .eq("user_id", caller.userId);
  }

  return { run, plan, limits };
}

async function resolveAgentForRun(caller: Caller, agentId: string) {
  const admin = getAdminClient();

  const { data: agent } = await admin
    .from("marketplace_agents")
    .select("id, owner_id, status, visibility, price_cents, min_plan, team_id")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) throw notFound("Agent not found");

  const isOwner = agent.owner_id === caller.userId;

  if (!isOwner) {
    const { data: install } = await admin
      .from("agent_installs")
      .select("id, enabled")
      .eq("agent_id", agentId)
      .eq("user_id", caller.userId)
      .maybeSingle();

    if (!install) throw forbidden("Install this agent before running it");
    if (!install.enabled) throw forbidden("This agent is disabled in your workspace");
  }

  if (!meetsPlan(caller.plan, agent.min_plan as PlanType)) {
    throw planLimit(`This agent requires the ${agent.min_plan} plan.`);
  }

  const { data: version } = await admin
    .from("agent_versions")
    .select("manifest, version")
    .eq("agent_id", agentId)
    .eq("is_current", true)
    .maybeSingle();

  if (!version) throw badRequest("This agent has no published version yet");

  // Re-validate on every run: a manifest stored before a schema change, or
  // written directly to the database, must not reach the runtime unchecked.
  const parsed = parseAgentManifest(version.manifest);
  if (!parsed.ok) {
    throw badRequest("This agent's published manifest is no longer valid. Ask the author to republish.");
  }

  return { agentId, manifest: parsed.value };
}

function meetsPlan(actual: PlanType, required: PlanType): boolean {
  const rank: Record<PlanType, number> = { free: 0, pro: 1, enterprise: 2 };
  return rank[actual] >= rank[required];
}

// ─── STEP REPORTING ──────────────────────────────────────────

export interface StepReport {
  step_index: number;
  status: "running" | "succeeded" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  attempts?: number;
  duration_ms?: number;
}

export async function recordStep(caller: Caller, runId: string, report: StepReport) {
  const admin = getAdminClient();
  const run = await loadOwnRun(caller, runId);

  if (TERMINAL.includes(run.status as RunStatus)) {
    throw badRequest(`This run already finished with status "${run.status}"`);
  }

  if (!Number.isInteger(report.step_index) || report.step_index < 0) {
    throw validationFailed([{ path: "step_index", message: "step_index must be a non-negative integer" }]);
  }

  const { error } = await admin
    .from("agent_run_steps")
    .update({
      status: report.status,
      // Step results can be large (a scraped table); the timeline only needs
      // enough to explain what happened.
      result: truncateForStorage(report.result),
      error: report.error?.slice(0, 2000) ?? null,
      attempts: Math.max(1, Math.min(report.attempts ?? 1, 10)),
      duration_ms: Math.max(0, Math.min(report.duration_ms ?? 0, 3_600_000)),
    })
    .eq("run_id", runId)
    .eq("step_index", report.step_index);

  if (error) throw badRequest(error.message);

  return { recorded: true };
}

/** Caps a stored value at roughly 32 KB of JSON. */
function truncateForStorage(value: unknown): unknown {
  if (value === undefined) return null;
  const encoded = JSON.stringify(value ?? null);
  if (encoded && encoded.length > 32_000) {
    return { truncated: true, preview: encoded.slice(0, 4000), original_bytes: encoded.length };
  }
  return value ?? null;
}

// ─── COMPLETION ──────────────────────────────────────────────

export interface CompleteRunInput {
  status: RunStatus;
  output?: Record<string, unknown>;
  error?: string;
  tokens_used?: number;
  cost_usd?: number;
}

export async function completeRun(caller: Caller, runId: string, input: CompleteRunInput) {
  if (!TERMINAL.includes(input.status) && input.status !== "awaiting_confirmation") {
    throw validationFailed([
      { path: "status", message: `Must be one of: ${[...TERMINAL, "awaiting_confirmation"].join(", ")}` },
    ]);
  }

  const admin = getAdminClient();
  const run = await loadOwnRun(caller, runId);

  if (TERMINAL.includes(run.status as RunStatus)) {
    // Idempotent: the extension may retry the completion call after a
    // dropped connection, and that must not overwrite the recorded outcome.
    return { run, already_finished: true };
  }

  const { data, error } = await admin
    .from("agent_runs")
    .update({
      status: input.status,
      output: truncateForStorage(input.output ?? {}) as Record<string, unknown>,
      error: input.error?.slice(0, 4000) ?? null,
      tokens_used: (run.tokens_used ?? 0) + Math.max(0, input.tokens_used ?? 0),
      cost_usd: Number(run.cost_usd ?? 0) + Math.max(0, input.cost_usd ?? 0),
    })
    .eq("id", runId)
    .select(RUN_COLUMNS)
    .single();

  if (error) throw badRequest(error.message);

  if (TERMINAL.includes(input.status)) {
    await admin.rpc("notify_user", {
      target_user: caller.userId,
      kind: input.status === "completed" ? "run_completed" : "run_failed",
      subject:
        input.status === "completed"
          ? `Finished: ${truncate(run.goal, 60)}`
          : `Run failed: ${truncate(run.goal, 60)}`,
      message: input.error ?? null,
      deep_link: `/dashboard/runs/${runId}`,
    });
  }

  return { run: asRow<RunRow>(data), already_finished: false };
}

export async function cancelRun(caller: Caller, runId: string) {
  return completeRun(caller, runId, { status: "cancelled", error: "Cancelled by the user" });
}

export async function loadOwnRun(caller: Caller, runId: string) {
  const { data } = await getAdminClient()
    .from("agent_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .maybeSingle();

  if (!data) throw notFound("Run not found");
  const run = asRow<RunRow>(data);
  if (run.user_id !== caller.userId) throw forbidden("This run belongs to another user");
  return run;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
