// ============================================================
// TASKPILOT — AGENT RUNTIME
// services/api/src/runtime/runtime/index.ts
//
// The execution loop: plan → dispatch a step → observe → reason → repeat,
// under hard budgets for steps, tokens and wall-clock time.
//
// The runtime never touches the DOM. It hands BrowserActions to an
// ActionDispatcher, which the extension implements over chrome messaging
// and tests implement with a fake. That separation is what makes the
// control flow here testable at all.
// ============================================================

import {
  DEFAULT_RUN_LIMITS,
  MUTATING_ACTIONS,
  newId,
  type ActionDispatcher,
  type ActionPlan,
  type ActionResult,
  type BrowserActionType,
  type PageContext,
  type PlanStep,
  type RunLimits,
  type RunRecord,
  type RunStatus,
  type RuntimeEvent,
  type RuntimeEventHandler,
} from "@taskpilot/shared";

import { Planner, planFromWorkflow } from "./planner";
import { Reasoner } from "./reasoner";
import { Scratchpad, InMemoryStore, AgentMemory, type MemoryStore } from "./memory";
import type { LLMUsage } from "./providers/types";

export interface AgentRuntimeOptions {
  planner: Planner;
  reasoner: Reasoner;
  dispatcher: ActionDispatcher;
  memoryStore?: MemoryStore;
  limits?: Partial<RunLimits>;
  onEvent?: RuntimeEventHandler;
  /**
   * Called before a confirmation-gated action. Return false to refuse.
   * Absent means "never auto-confirm" — the run pauses and reports
   * `awaiting_confirmation` rather than silently proceeding.
   */
  confirm?: (step: PlanStep) => Promise<boolean>;
  /** Identity used to scope long-term memory. */
  userId?: string | null;
  /** How many times a failing plan may be regenerated. */
  maxReplans?: number;
}

export interface RunOptions {
  goal: string;
  context: PageContext;
  agentId?: string | null;
  workflowId?: string | null;
  inputs?: Record<string, unknown>;
  /** Pre-baked steps from an agent manifest. Skips the planning call. */
  workflow?: PlanStep[];
  memoryNamespace?: string;
  signal?: AbortSignal;
}

export interface RunOutcome {
  run: RunRecord;
  plan: ActionPlan | null;
  events: RuntimeEvent[];
  /** Steps that never ran because the user must confirm them first. */
  pendingConfirmation: PlanStep | null;
}

export class AgentRuntime {
  private readonly planner: Planner;
  private readonly reasoner: Reasoner;
  private readonly dispatcher: ActionDispatcher;
  private readonly memoryStore: MemoryStore;
  private readonly limits: RunLimits;
  private readonly onEvent?: RuntimeEventHandler;
  private readonly confirm?: (step: PlanStep) => Promise<boolean>;
  private readonly userId: string | null;
  private readonly maxReplans: number;

  constructor(options: AgentRuntimeOptions) {
    this.planner = options.planner;
    this.reasoner = options.reasoner;
    this.dispatcher = options.dispatcher;
    this.memoryStore = options.memoryStore ?? new InMemoryStore();
    this.limits = { ...DEFAULT_RUN_LIMITS, ...options.limits };
    this.onEvent = options.onEvent;
    this.confirm = options.confirm;
    this.userId = options.userId ?? null;
    this.maxReplans = options.maxReplans ?? 1;
  }

  async run(options: RunOptions): Promise<RunOutcome> {
    const runId = newId();
    const startedAt = Date.now();
    const events: RuntimeEvent[] = [];
    const scratchpad = new Scratchpad();

    const memory = new AgentMemory(this.memoryStore, {
      namespace: options.memoryNamespace ?? "default",
      userId: this.userId,
    });

    let tokensUsed = 0;
    let costUsd = 0;
    let stepsCompleted = 0;
    let replans = 0;
    let error: string | null = null;
    let pendingConfirmation: PlanStep | null = null;

    const emit = async (event: RuntimeEvent) => {
      events.push(event);
      await this.onEvent?.(event);
    };

    const chargeTokens = (usage: LLMUsage | null) => {
      if (!usage) return;
      tokensUsed += usage.total_tokens;
      costUsd += usage.estimated_cost_usd;
    };

    // Wall-clock ceiling. Combined with the caller's signal so either can stop the run.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.limits.timeout_ms);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    const finish = (finalStatus: RunStatus, plan: ActionPlan | null): RunOutcome => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);
      const finishedAt = Date.now();
      return {
        run: {
          id: runId,
          user_id: this.userId,
          agent_id: options.agentId ?? null,
          workflow_id: options.workflowId ?? null,
          goal: options.goal,
          status: finalStatus,
          plan,
          steps_total: plan?.steps.length ?? 0,
          steps_completed: stepsCompleted,
          output: scratchpad.toObject(),
          error,
          tokens_used: tokensUsed,
          cost_usd: Number(costUsd.toFixed(6)),
          started_at: new Date(startedAt).toISOString(),
          finished_at: new Date(finishedAt).toISOString(),
          duration_ms: finishedAt - startedAt,
        },
        plan,
        events,
        pendingConfirmation,
      };
    };

    await emit({ type: "run_started", run_id: runId, goal: options.goal });

    // ── PLAN ────────────────────────────────────────────────
    let plan: ActionPlan;
    if (options.workflow?.length) {
      plan = planFromWorkflow(options.goal, options.workflow);
    } else {
      await emit({ type: "planning", run_id: runId });
      try {
        const outcome = await this.planner.plan({
          goal: options.goal,
          context: options.context,
          inputs: options.inputs,
          signal: controller.signal,
        });
        chargeTokens(outcome.usage);
        plan = outcome.plan;
      } catch (err) {
        error = err instanceof Error ? err.message : "Planning failed";
        await emit({ type: "run_failed", run_id: runId, error });
        return finish("failed", null);
      }
    }

    if (plan.clarification_needed) {
      error = plan.clarification_needed;
      await emit({ type: "run_failed", run_id: runId, error });
      return finish("failed", plan);
    }

    if (!plan.steps.length) {
      error = "The planner produced no executable steps for this request.";
      await emit({ type: "run_failed", run_id: runId, error });
      return finish("failed", plan);
    }

    await emit({ type: "plan_ready", run_id: runId, plan });

    // ── EXECUTE ─────────────────────────────────────────────
    let index = 0;
    let attempt = 1;
    let consecutiveFailures = 0;
    let executedSteps = 0;

    while (index < plan.steps.length) {
      if (controller.signal.aborted) {
        error = options.signal?.aborted ? "Run cancelled." : "Run exceeded its time budget.";
        await emit({ type: "run_failed", run_id: runId, error });
        return finish(options.signal?.aborted ? "cancelled" : "timed_out", plan);
      }

      if (executedSteps >= this.limits.max_steps) {
        error = `Run exceeded its step budget (${this.limits.max_steps}).`;
        await emit({ type: "run_failed", run_id: runId, error });
        return finish("failed", plan);
      }

      if (tokensUsed >= this.limits.token_budget) {
        error = `Run exceeded its token budget (${this.limits.token_budget}).`;
        await emit({ type: "run_failed", run_id: runId, error });
        return finish("failed", plan);
      }

      const step = plan.steps[index];

      // Guard: skip when the step's condition isn't met.
      if (step.condition && !scratchpad.evaluate(step.condition)) {
        await emit({
          type: "step_skipped",
          run_id: runId,
          step_id: step.id,
          reason: `Condition on "${step.condition.key}" not met.`,
        });
        index++;
        attempt = 1;
        continue;
      }

      // Guard: dependencies must have produced values.
      const unmet = (step.depends_on ?? []).filter((key) => !scratchpad.has(key));
      if (unmet.length) {
        await emit({
          type: "step_skipped",
          run_id: runId,
          step_id: step.id,
          reason: `Missing dependencies: ${unmet.join(", ")}.`,
        });
        index++;
        attempt = 1;
        continue;
      }

      // Guard: confirmation for anything destructive or navigational.
      if (this.requiresConfirmation(step.action.type) && attempt === 1) {
        const approved = this.confirm ? await this.confirm(step) : false;
        if (!approved) {
          pendingConfirmation = step;
          await emit({ type: "confirmation_required", run_id: runId, step });
          error = this.confirm
            ? `User declined the "${step.action.type}" step.`
            : `Step "${step.action.type}" needs confirmation and no confirmation handler is attached.`;
          return finish("awaiting_confirmation", plan);
        }
      }

      // Terminal step: resolve the named result and stop.
      if (step.action.type === "finish") {
        const key = step.action.params?.result;
        if (typeof key === "string" && scratchpad.has(key)) {
          scratchpad.set("result", scratchpad.get(key));
        }
        stepsCompleted++;
        await emit({ type: "run_finished", run_id: runId, status: "completed", output: scratchpad.toObject() });
        return finish("completed", plan);
      }

      await emit({ type: "step_started", run_id: runId, step, index });

      // Wire earlier outputs into this step's params.
      const action = {
        ...step.action,
        ...(step.action.params ? { params: scratchpad.interpolate(step.action.params) } : {}),
      };

      const stepStart = Date.now();
      let result: ActionResult;
      try {
        result = await this.dispatcher.dispatch(action, controller.signal);
      } catch (err) {
        result = {
          action: action.type,
          success: false,
          error: err instanceof Error ? err.message : "Dispatcher threw",
          retryable: false,
          duration_ms: Date.now() - stepStart,
        };
      }
      executedSteps++;

      await emit({ type: "step_finished", run_id: runId, step_id: step.id, result });

      if (result.success) {
        stepsCompleted++;
        consecutiveFailures = 0;
        if (step.save_as) {
          scratchpad.set(step.save_as, result.data);
          // Persist named outputs so a later run of the same agent can see
          // what the previous one produced.
          await memory.remember(`last:${step.save_as}`, result.data);
        }
      } else {
        consecutiveFailures++;
      }

      // ── REASON ────────────────────────────────────────────
      const reasoning = await this.reasoner.decide({
        goal: options.goal,
        step,
        result,
        index,
        totalSteps: plan.steps.length,
        attempt,
        scratchpad: scratchpad.toObject(),
        consecutiveFailures,
        signal: controller.signal,
      });
      chargeTokens(reasoning.usage);
      await emit({ type: "reasoning", run_id: runId, decision: reasoning.decision });

      switch (reasoning.decision.verdict) {
        case "continue":
          index++;
          attempt = 1;
          break;

        case "retry": {
          attempt++;
          const backoff = step.retry?.backoff_ms ?? 400;
          if (backoff > 0) await sleep(backoff, controller.signal);
          break;
        }

        case "skip":
          index++;
          attempt = 1;
          break;

        case "finish":
          await emit({
            type: "run_finished",
            run_id: runId,
            status: "completed",
            output: scratchpad.toObject(),
          });
          return finish("completed", plan);

        case "replan": {
          if (replans >= this.maxReplans) {
            error = `Replanned ${replans} time(s) without success: ${reasoning.decision.reason}`;
            await emit({ type: "run_failed", run_id: runId, error });
            return finish("failed", plan);
          }
          replans++;
          const feedback = reasoning.decision.feedback ?? reasoning.decision.reason;
          await emit({ type: "replanning", run_id: runId, feedback });

          // Re-read the page: the reason we're replanning is usually that
          // it no longer matches what the last plan assumed.
          let context = options.context;
          if (this.dispatcher.readContext) {
            try {
              context = await this.dispatcher.readContext();
            } catch {
              // Keep the stale context rather than aborting the replan.
            }
          }

          // Passing `feedback` makes the planner skip its heuristic rules,
          // which is what we want — those already produced the failing plan.
          const outcome = await this.planner.plan({
            goal: options.goal,
            context,
            inputs: options.inputs,
            feedback,
            signal: controller.signal,
          });
          chargeTokens(outcome.usage);

          if (!outcome.plan.steps.length) {
            error = outcome.plan.clarification_needed ?? "Replanning produced no executable steps.";
            await emit({ type: "run_failed", run_id: runId, error });
            return finish("failed", plan);
          }

          plan = outcome.plan;
          await emit({ type: "plan_ready", run_id: runId, plan });
          index = 0;
          attempt = 1;
          consecutiveFailures = 0;
          break;
        }

        case "await_confirmation":
          pendingConfirmation = step;
          await emit({ type: "confirmation_required", run_id: runId, step });
          return finish("awaiting_confirmation", plan);

        case "fail":
        default:
          error = reasoning.decision.reason || result.error || "Run failed.";
          await emit({ type: "run_failed", run_id: runId, error });
          return finish("failed", plan);
      }
    }

    // Plan ran to completion without an explicit finish step.
    await emit({ type: "run_finished", run_id: runId, status: "completed", output: scratchpad.toObject() });
    return finish("completed", plan);
  }

  private requiresConfirmation(action: BrowserActionType): boolean {
    return this.limits.confirm.includes(action) && MUTATING_ACTIONS.includes(action);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
