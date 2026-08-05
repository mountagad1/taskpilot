// ============================================================
// TASKPILOT — QUEUE WORKER
// services/api/src/lib/worker.ts
//
// Drains the job queue one batch at a time. Invoked by a cron trigger
// (Vercel Cron, an external scheduler, or `pnpm worker`), which keeps the
// deployment serverless — there is no long-lived process to supervise.
//
// Every handler is expected to be idempotent: a job can be delivered twice
// if a worker dies after doing the work but before reporting success.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobType } from "@taskpilot/shared";

import { getAdminClient } from "./clients";
import { nextCronRun } from "./cron";

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export interface WorkerResult {
  claimed: number;
  succeeded: number;
  failed: number;
  requeued_stalled: number;
  details: Array<{ id: string; type: JobType; ok: boolean; error?: string }>;
}

type JobHandler = (job: JobRow, db: SupabaseClient) => Promise<void>;

// ─── HANDLERS ────────────────────────────────────────────────

/**
 * Materialises a run for a scheduled workflow. The steps are stored ready to
 * execute; the browser picks them up when the user is next online, since a
 * server cannot drive their authenticated session on its own.
 */
const runScheduledWorkflow: JobHandler = async (job, db) => {
  const workflowId = String(job.payload.workflow_id ?? "");
  if (!workflowId) throw new Error("scheduled_workflow job has no workflow_id");

  const { data: workflow } = await db
    .from("workflows")
    .select("id, user_id, name, steps, schedule_cron, is_active, agent_id")
    .eq("id", workflowId)
    .maybeSingle();

  if (!workflow) throw new Error(`Workflow ${workflowId} no longer exists`);

  // Deactivated between enqueue and execution: drop it quietly rather than
  // running work the user has switched off.
  if (!workflow.is_active) {
    await db.from("workflows").update({ next_run_at: null }).eq("id", workflowId);
    return;
  }

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];

  const { data: run } = await db
    .from("agent_runs")
    .insert({
      user_id: workflow.user_id,
      workflow_id: workflow.id,
      agent_id: workflow.agent_id,
      goal: `Scheduled run: ${workflow.name}`,
      status: "queued",
      plan: {
        id: crypto.randomUUID(),
        goal: workflow.name,
        steps,
        source: "workflow",
        confidence: 1,
        created_at: new Date().toISOString(),
      },
      steps_total: steps.length,
    })
    .select("id")
    .single();

  if (run) {
    const rows = steps.map((step: { id?: string; action?: { type?: string } }, index: number) => ({
      run_id: run.id,
      step_index: index,
      step_id: step.id ?? `step_${index + 1}`,
      action: step.action?.type ?? "finish",
      status: "pending" as const,
    }));
    if (rows.length) await db.from("agent_run_steps").insert(rows);
  }

  await db
    .from("workflows")
    .update({
      run_count: (await currentRunCount(db, workflowId)) + 1,
      last_run_at: new Date().toISOString(),
      // Schedule the following occurrence now, so a worker outage doesn't
      // leave the workflow permanently unscheduled.
      next_run_at: workflow.schedule_cron ? nextCronRun(workflow.schedule_cron).toISOString() : null,
    })
    .eq("id", workflowId);

  await db.rpc("notify_user", {
    target_user: workflow.user_id,
    kind: "run_completed",
    subject: `${workflow.name} is queued`,
    message: "Your scheduled workflow is ready to run the next time you open the browser.",
    deep_link: run ? `/dashboard/runs/${run.id}` : "/dashboard/workflows",
  });
};

async function currentRunCount(db: SupabaseClient, workflowId: string): Promise<number> {
  const { data } = await db.from("workflows").select("run_count").eq("id", workflowId).maybeSingle();
  return data?.run_count ?? 0;
}

/** Rolls yesterday's runs into the per-user usage counters. */
const rollUpUsage: JobHandler = async (_job, db) => {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const { data: runs } = await db
    .from("agent_runs")
    .select("user_id, tokens_used, cost_usd")
    .gte("started_at", since.toISOString());

  const totals = new Map<string, { actions: number; tokens: number; cost: number }>();
  for (const run of runs ?? []) {
    if (!run.user_id) continue;
    const entry = totals.get(run.user_id) ?? { actions: 0, tokens: 0, cost: 0 };
    entry.actions += 1;
    entry.tokens += run.tokens_used ?? 0;
    entry.cost += Number(run.cost_usd ?? 0);
    totals.set(run.user_id, entry);
  }

  const periodEnd = new Date(since);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  for (const [userId, totalsForUser] of totals) {
    await db.from("usage_periods").upsert(
      {
        user_id: userId,
        period_start: since.toISOString(),
        period_end: periodEnd.toISOString(),
        ai_actions_used: totalsForUser.actions,
        tokens_used: totalsForUser.tokens,
        cost_usd: totalsForUser.cost,
      },
      { onConflict: "user_id,period_start" }
    );
  }
};

/** Deletes expired export artefacts so storage doesn't grow without bound. */
const sweepExpiredFiles: JobHandler = async (_job, db) => {
  await db.from("stored_files").delete().lt("expires_at", new Date().toISOString());
};

/** Placeholder delivery hook — email/push providers plug in here. */
const dispatchNotification: JobHandler = async (job, db) => {
  const userId = String(job.payload.user_id ?? "");
  if (!userId) throw new Error("notification_dispatch job has no user_id");

  await db.rpc("notify_user", {
    target_user: userId,
    kind: String(job.payload.type ?? "system"),
    subject: String(job.payload.title ?? "TaskPilot"),
    message: job.payload.body ? String(job.payload.body) : null,
    deep_link: job.payload.link ? String(job.payload.link) : null,
  });
};

const HANDLERS: Partial<Record<JobType, JobHandler>> = {
  scheduled_workflow: runScheduledWorkflow,
  usage_rollup: rollUpUsage,
  cache_sweep: sweepExpiredFiles,
  notification_dispatch: dispatchNotification,
};

// ─── SCHEDULING ──────────────────────────────────────────────

/**
 * Enqueues a job for every workflow whose next_run_at has passed. The dedupe
 * key makes a double tick harmless — a second insert for the same minute is
 * rejected by the unique index rather than running the workflow twice.
 */
export async function enqueueDueWorkflows(db: SupabaseClient): Promise<number> {
  const now = new Date();

  const { data: due } = await db
    .from("workflows")
    .select("id, next_run_at")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .limit(100);

  let enqueued = 0;

  for (const workflow of due ?? []) {
    const bucket = new Date(workflow.next_run_at).toISOString().slice(0, 16);
    const { error } = await db.from("job_queue").insert({
      type: "scheduled_workflow",
      payload: { workflow_id: workflow.id },
      dedupe_key: `workflow:${workflow.id}:${bucket}`,
      priority: 5,
    });

    // A duplicate key here means another tick already queued this occurrence.
    if (!error) enqueued++;
  }

  return enqueued;
}

// ─── DRAIN ───────────────────────────────────────────────────

export async function processJobs(options: { workerId?: string; batchSize?: number } = {}): Promise<WorkerResult> {
  const db = getAdminClient();
  const workerId = options.workerId ?? `worker-${Math.random().toString(36).slice(2, 8)}`;
  const batchSize = Math.min(Math.max(options.batchSize ?? 10, 1), 50);

  const { data: requeued } = await db.rpc("requeue_stalled_jobs", { stall_minutes: 15 });
  await enqueueDueWorkflows(db);

  const { data: claimed, error } = await db.rpc("claim_jobs", {
    worker: workerId,
    batch_size: batchSize,
  });

  if (error) throw new Error(`Could not claim jobs: ${error.message}`);

  const jobs = (claimed ?? []) as JobRow[];
  const result: WorkerResult = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    requeued_stalled: requeued ?? 0,
    details: [],
  };

  for (const job of jobs) {
    const handler = HANDLERS[job.type];

    if (!handler) {
      // An unknown type will never succeed; burn its attempts immediately
      // rather than retrying it on a backoff for hours.
      await db.rpc("fail_job", { job_id: job.id, reason: `No handler for job type "${job.type}"` });
      result.failed++;
      result.details.push({ id: job.id, type: job.type, ok: false, error: "no handler" });
      continue;
    }

    try {
      await handler(job, db);
      await db.rpc("complete_job", { job_id: job.id });
      result.succeeded++;
      result.details.push({ id: job.id, type: job.type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed";
      await db.rpc("fail_job", { job_id: job.id, reason: message.slice(0, 1000) });
      result.failed++;
      result.details.push({ id: job.id, type: job.type, ok: false, error: message });
    }
  }

  return result;
}
