// ============================================================
// TASKPILOT API — RUN ROUTES
// services/api/src/routes/runs.ts
//
// The server plans; the extension executes. These routes hand out a plan,
// take back per-step results, and record the outcome.
// ============================================================

import { Hono } from "hono";

import {
  RUN_COLUMNS,
  cancelRun,
  completeRun,
  createRun,
  loadOwnRun,
  recordStep,
  type CompleteRunInput,
  type CreateRunInput,
  type StepReport,
} from "../lib/runs";
import { badRequest, ok, okList } from "../lib/errors";
import { caller, guard, readJson, readPagination, query } from "../middleware/kernel";
import { getAdminClient } from "../lib/clients";

export const runRoutes = new Hono();

runRoutes.get("/", guard({ scopes: ["runs:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const { from, to, page, perPage } = readPagination(c);

  let request = me.db
    .from("agent_runs")
    .select(RUN_COLUMNS, { count: "exact" })
    .eq("user_id", me.userId)
    .order("started_at", { ascending: false })
    .range(from, to);

  const status = query(c, "status");
  const agentId = query(c, "agent_id");
  if (status) request = request.eq("status", status);
  if (agentId) request = request.eq("agent_id", agentId);

  const { data, error, count } = await request;
  if (error) throw badRequest(error.message);

  return okList(data ?? [], { total: count ?? 0, page, per_page: perPage });
});

/**
 * Plans a run and returns the steps for the caller to execute. With
 * `dry_run` nothing is stored — useful for previewing what an agent would do.
 */
runRoutes.post("/", guard({ scopes: ["runs:write"], rateLimit: 60 }), async (c) => {
  const body = await readJson(c);
  const result = await createRun(caller(c), body as unknown as CreateRunInput);
  return ok(result, { status: body.dry_run ? 200 : 201 });
});

runRoutes.get("/:id", guard({ scopes: ["runs:read"], rateLimit: 240 }), async (c) => {
  const id = c.req.param("id");
  const run = await loadOwnRun(caller(c), id);

  const { data: steps, error } = await getAdminClient()
    .from("agent_run_steps")
    .select("step_index, step_id, action, status, result, error, attempts, duration_ms")
    .eq("run_id", id)
    .order("step_index", { ascending: true });

  if (error) throw badRequest(error.message);
  return ok({ ...run, steps: steps ?? [] });
});

/** Records the run's final outcome. Idempotent — retries never overwrite it. */
runRoutes.patch("/:id", guard({ scopes: ["runs:write"], rateLimit: 120 }), async (c) => {
  const body = await readJson(c);
  return ok(await completeRun(caller(c), c.req.param("id"), body as unknown as CompleteRunInput));
});

/**
 * One step's outcome. Called once per step, so it is deliberately cheap and
 * generously rate-limited rather than batched.
 */
runRoutes.post("/:id/steps", guard({ scopes: ["runs:write"], rateLimit: 600 }), async (c) => {
  const body = await readJson(c);
  return ok(await recordStep(caller(c), c.req.param("id"), body as unknown as StepReport));
});

runRoutes.post("/:id/cancel", guard({ scopes: ["runs:write"], rateLimit: 60 }), async (c) =>
  ok(await cancelRun(caller(c), c.req.param("id")))
);
