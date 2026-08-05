// ============================================================
// TASKPILOT — REASONING LAYER
// services/api/src/runtime/reasoner/index.ts
//
// After every step the runtime asks: given what just happened, what now?
// Most answers are obvious and are decided by rules (a step succeeded →
// continue; a retryable failure with attempts left → retry). Only the
// genuinely ambiguous cases cost a model call.
// ============================================================

import type { ActionResult, PlanStep, ReasoningDecision } from "@taskpilot/shared";

import { safeParseJSON } from "../planner";
import type { LLMProvider, LLMUsage } from "../providers/types";

export interface ReasoningInput {
  goal: string;
  step: PlanStep;
  result: ActionResult;
  /** 0-based position of `step` within the plan. */
  index: number;
  totalSteps: number;
  attempt: number;
  /** Values accumulated by earlier steps. */
  scratchpad: Record<string, unknown>;
  /** Failures so far in this run, across all steps. */
  consecutiveFailures: number;
  signal?: AbortSignal;
}

export interface ReasoningOutcome {
  decision: ReasoningDecision;
  usage: LLMUsage | null;
}

const REASONER_SYSTEM_PROMPT = `You are TaskPilot's execution supervisor. A browser automation step just finished. Decide what the runtime should do next.

Verdicts:
- "continue": the step did what it should; move to the next step.
- "retry": the failure looks transient (element not ready, slow load).
- "replan": the page is not what the plan assumed; a new plan is needed.
- "skip": this step is not required for the goal; move on.
- "finish": the goal is already satisfied; stop early.
- "fail": the goal cannot be achieved; stop with an error.

Respond with JSON: {"verdict":"...","reason":"one sentence","feedback":"only for replan — what the planner got wrong","confidence":0.0}`;

export class Reasoner {
  private readonly provider?: LLMProvider;
  private readonly model: string;
  private readonly maxRetriesPerStep: number;
  private readonly maxConsecutiveFailures: number;

  constructor(options: {
    provider?: LLMProvider;
    model?: string;
    maxRetriesPerStep?: number;
    maxConsecutiveFailures?: number;
  } = {}) {
    this.provider = options.provider;
    this.model = options.model ?? "gpt-4.1-mini";
    this.maxRetriesPerStep = options.maxRetriesPerStep ?? 2;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? 3;
  }

  async decide(input: ReasoningInput): Promise<ReasoningOutcome> {
    const fast = this.decideByRule(input);
    if (fast) return { decision: fast, usage: null };

    if (!this.provider) {
      // No model available: fail closed rather than looping on a failure
      // we don't understand.
      return {
        decision: {
          verdict: "fail",
          reason: `Step "${input.step.id}" failed and no reasoning model is configured: ${input.result.error ?? "unknown error"}`,
          confidence: 0.3,
        },
        usage: null,
      };
    }

    return this.decideWithLLM(input);
  }

  // ── RULES (no model call) ────────────────────────────────

  private decideByRule(input: ReasoningInput): ReasoningDecision | null {
    const { result, step, index, totalSteps, attempt, consecutiveFailures } = input;

    if (result.success) {
      if (step.action.type === "finish" || index >= totalSteps - 1) {
        return { verdict: "finish", reason: "Final step completed successfully.", confidence: 0.99 };
      }
      return { verdict: "continue", reason: "Step succeeded.", confidence: 0.99 };
    }

    // An optional step that failed never blocks the run.
    if (step.optional) {
      return { verdict: "skip", reason: "Optional step failed; continuing.", confidence: 0.95 };
    }

    const allowedAttempts = step.retry?.max_attempts ?? this.maxRetriesPerStep;
    if (result.retryable && attempt < allowedAttempts) {
      return {
        verdict: "retry",
        reason: `Transient failure (attempt ${attempt} of ${allowedAttempts}).`,
        confidence: 0.9,
      };
    }

    // Repeated unexplained failures mean the plan is wrong about the page,
    // not that the next step will fare better.
    if (consecutiveFailures >= this.maxConsecutiveFailures) {
      return {
        verdict: "fail",
        reason: `${consecutiveFailures} consecutive step failures; stopping to avoid a loop.`,
        confidence: 0.85,
      };
    }

    // Everything else is genuinely ambiguous → ask the model.
    return null;
  }

  // ── LLM PATH ─────────────────────────────────────────────

  private async decideWithLLM(input: ReasoningInput): Promise<ReasoningOutcome> {
    const scratchKeys = Object.keys(input.scratchpad);

    const prompt = [
      `GOAL: ${input.goal}`,
      `STEP ${input.index + 1} of ${input.totalSteps}: ${input.step.action.type}`,
      input.step.action.target
        ? `TARGET: ${input.step.action.target.by}="${input.step.action.target.value}"`
        : "TARGET: none",
      input.step.action.rationale ? `WHY: ${input.step.action.rationale}` : "",
      "",
      `OUTCOME: failed after ${input.attempt} attempt(s)`,
      `ERROR: ${(input.result.error ?? "unknown").slice(0, 400)}`,
      `RETRYABLE: ${input.result.retryable ? "yes" : "no"}`,
      input.result.url ? `CURRENT URL: ${input.result.url}` : "",
      "",
      scratchKeys.length
        ? `ALREADY COLLECTED: ${scratchKeys.join(", ")}`
        : "ALREADY COLLECTED: nothing",
      `CONSECUTIVE FAILURES: ${input.consecutiveFailures}`,
    ]
      .filter(Boolean)
      .join("\n");

    let response;
    try {
      response = await this.provider!.complete({
        model: this.model,
        json: true,
        temperature: 0,
        max_tokens: 300,
        signal: input.signal,
        messages: [
          { role: "system", content: REASONER_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
    } catch (err) {
      // If the supervisor itself is unavailable, stop — continuing blind
      // through a failing plan is worse than surfacing the error.
      return {
        decision: {
          verdict: "fail",
          reason: `Reasoning call failed: ${err instanceof Error ? err.message : "unknown"}`,
          confidence: 0.2,
        },
        usage: null,
      };
    }

    const parsed = safeParseJSON(response.content);
    const verdict = normaliseVerdict(parsed?.verdict);

    if (!verdict) {
      return {
        decision: {
          verdict: "fail",
          reason: "Supervisor returned an unrecognised verdict.",
          confidence: 0.2,
        },
        usage: response.usage,
      };
    }

    const decision: ReasoningDecision = {
      verdict,
      reason:
        typeof parsed?.reason === "string" ? parsed.reason.slice(0, 400) : "No reason given.",
      confidence:
        typeof parsed?.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
          ? parsed.confidence
          : 0.5,
    };

    if (verdict === "replan") {
      decision.feedback =
        typeof parsed?.feedback === "string" && parsed.feedback.trim()
          ? parsed.feedback.slice(0, 600)
          : `Step "${input.step.id}" (${input.step.action.type}) failed: ${input.result.error ?? "unknown"}`;
    }

    return { decision, usage: response.usage };
  }
}

const VERDICTS = [
  "continue",
  "retry",
  "replan",
  "skip",
  "finish",
  "fail",
  "await_confirmation",
] as const;

function normaliseVerdict(value: unknown): ReasoningDecision["verdict"] | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase().trim();
  return (VERDICTS as readonly string[]).includes(lower)
    ? (lower as ReasoningDecision["verdict"])
    : null;
}
