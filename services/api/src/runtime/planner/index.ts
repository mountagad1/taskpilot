// ============================================================
// TASKPILOT — PLANNING ENGINE
// services/api/src/runtime/planner/index.ts
//
// Natural language + page context → an ActionPlan the runtime can execute.
//
//   1. Heuristic rules      (free, instant, covers the common asks)
//   2. LLM structured plan  (everything else)
//
// Whatever the source, the resulting steps go through the same manifest
// validator used for third-party agents, so an LLM cannot emit an action
// the runtime wouldn't otherwise accept.
// ============================================================

import {
  BROWSER_ACTION_TYPES,
  Validator,
  newId,
  parsePlanStep,
  type ActionPlan,
  type BrowserActionType,
  type PageContext,
  type PlanStep,
} from "@taskpilot/shared";

import { matchHeuristicPlan } from "./heuristics";
import type { LLMProvider, LLMUsage } from "../providers/types";
import { TokenOptimizer } from "../optimizer/token-optimizer";

export * from "./heuristics";

export interface PlannerOptions {
  provider?: LLMProvider;
  model?: string;
  /** Restricts what the planner may emit. Defaults to every action type. */
  allowedActions?: BrowserActionType[];
  maxSteps?: number;
  /** Skip heuristics entirely — used when a prior heuristic plan failed. */
  forceLLM?: boolean;
}

export interface PlanRequest {
  goal: string;
  context: PageContext;
  /** Values bound to the agent manifest's declared inputs. */
  inputs?: Record<string, unknown>;
  /** Why the previous plan failed, when this is a replan. */
  feedback?: string;
  signal?: AbortSignal;
}

export interface PlanOutcome {
  plan: ActionPlan;
  usage: LLMUsage | null;
}

const PLANNER_SYSTEM_PROMPT = `You are TaskPilot's planning engine. You convert a user's request into a short, executable plan of browser actions.

Rules:
- Emit ONLY actions from the allowed list you are given. Never invent an action type.
- Prefer the fewest steps that accomplish the goal. Do not add speculative steps.
- Read the page before reasoning about its contents.
- Use "save_as" to name a step's output, and reference that name in later steps' params.
- The final step must be {"action":{"type":"finish"},"...} with params.result naming the value to return.
- Target elements with the most stable strategy available: prefer "label", "role" or "testid" over brittle CSS.
- If the request is ambiguous or you are missing information you cannot obtain from the page, return a "clarification_needed" string instead of guessing.

Respond with a JSON object of exactly this shape:
{
  "steps": [
    {
      "id": "string",
      "action": { "type": "<allowed action>", "target": {"by":"css|text|label|placeholder|role|name|testid","value":"..."}, "params": {}, "rationale": "one short sentence" },
      "save_as": "optional name",
      "optional": false
    }
  ],
  "confidence": 0.0,
  "clarification_needed": null
}`;

export class Planner {
  private readonly provider?: LLMProvider;
  private readonly model: string;
  private readonly allowedActions: BrowserActionType[];
  private readonly maxSteps: number;
  private readonly forceLLM: boolean;
  private readonly optimizer = new TokenOptimizer();

  constructor(options: PlannerOptions = {}) {
    this.provider = options.provider;
    this.model = options.model ?? "gpt-4.1-mini";
    this.allowedActions = options.allowedActions ?? [...BROWSER_ACTION_TYPES];
    this.maxSteps = options.maxSteps ?? 24;
    this.forceLLM = options.forceLLM ?? false;
  }

  async plan(request: PlanRequest): Promise<PlanOutcome> {
    // A replan means the heuristic (or previous LLM) plan already failed;
    // re-running the same rules would produce the same broken plan.
    if (!this.forceLLM && !request.feedback) {
      const match = matchHeuristicPlan(request.goal, request.context);
      if (match) {
        const steps = this.enforceAllowed(match.steps);
        if (steps.length) {
          return {
            plan: this.buildPlan(request.goal, steps, "heuristic", match.confidence),
            usage: null,
          };
        }
      }
    }

    if (!this.provider) {
      return {
        plan: {
          ...this.buildPlan(request.goal, [], "llm", 0),
          clarification_needed:
            "This request needs AI planning, but no model provider is configured for this deployment.",
        },
        usage: null,
      };
    }

    return this.planWithLLM(request);
  }

  // ── LLM PATH ─────────────────────────────────────────────

  private async planWithLLM(request: PlanRequest): Promise<PlanOutcome> {
    const response = await this.provider!.complete({
      model: this.model,
      json: true,
      temperature: 0,
      max_tokens: 1600,
      signal: request.signal,
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        { role: "user", content: this.buildUserPrompt(request) },
      ],
    });

    const parsed = safeParseJSON(response.content);
    if (!parsed) {
      return {
        plan: {
          ...this.buildPlan(request.goal, [], "llm", 0),
          clarification_needed: "The planner returned a response that was not valid JSON.",
        },
        usage: response.usage,
      };
    }

    const clarification =
      typeof parsed.clarification_needed === "string" && parsed.clarification_needed.trim()
        ? parsed.clarification_needed.trim().slice(0, 500)
        : undefined;

    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps.slice(0, this.maxSteps) : [];

    // Same validator as published manifests — an LLM gets no more trust
    // than a third-party seller does.
    const validator = new Validator();
    const steps = rawSteps.map((raw, i) => parsePlanStep(raw, `steps[${i}]`, validator, `step_${i + 1}`));

    const allowed = this.enforceAllowed(steps);
    const confidence =
      typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : 0.5;

    // Drop confidence when the response needed repair, so the reasoner is
    // readier to replan rather than trusting a partially-invalid plan.
    const adjusted = validator.failed ? Math.min(confidence, 0.4) : confidence;

    const plan = this.buildPlan(request.goal, allowed, "llm", allowed.length ? adjusted : 0);
    if (clarification) plan.clarification_needed = clarification;

    return { plan, usage: response.usage };
  }

  private buildUserPrompt(request: PlanRequest): string {
    const ctx = this.optimizer.optimize(request.context, "custom_prompt");

    const parts = [
      `GOAL: ${request.goal}`,
      "",
      `ALLOWED ACTIONS: ${this.allowedActions.join(", ")}`,
      `MAX STEPS: ${this.maxSteps}`,
      "",
      "PAGE:",
      `  url: ${ctx.url ?? request.context.url}`,
      `  title: ${ctx.title ?? request.context.title}`,
      `  type: ${request.context.page_type}`,
    ];

    if (request.context.detected_forms?.length) {
      const fields = request.context.detected_forms
        .slice(0, 25)
        .map((f) => `    - ${f.label || f.name || f.placeholder || f.element_selector} (${f.type})`)
        .join("\n");
      parts.push(`  forms (${request.context.detected_forms.length} fields):`, fields);
    }

    if (request.context.detected_tables?.length) {
      const tables = request.context.detected_tables
        .slice(0, 5)
        .map((t, i) => `    - table ${i}: ${t.row_count} rows [${t.headers.slice(0, 8).join(", ")}]`)
        .join("\n");
      parts.push(`  tables:`, tables);
    }

    if (request.inputs && Object.keys(request.inputs).length) {
      parts.push("", `AGENT INPUTS: ${JSON.stringify(request.inputs).slice(0, 800)}`);
    }

    if (ctx.visible_text) {
      parts.push("", "VISIBLE TEXT (truncated):", ctx.visible_text.slice(0, 2500));
    }

    if (request.feedback) {
      parts.push(
        "",
        "PREVIOUS ATTEMPT FAILED. Produce a different plan that addresses this:",
        request.feedback.slice(0, 800)
      );
    }

    return parts.join("\n");
  }

  // ── SHARED ───────────────────────────────────────────────

  /**
   * Truncates the plan at the first disallowed action rather than filtering it
   * out: later steps usually depend on the one that was removed, so running
   * the remainder would produce a confidently wrong result.
   */
  private enforceAllowed(steps: PlanStep[]): PlanStep[] {
    const allowed = new Set<BrowserActionType>([...this.allowedActions, "finish"]);
    const kept: PlanStep[] = [];

    for (const step of steps) {
      if (!allowed.has(step.action.type)) break;
      kept.push(step);
      if (kept.length >= this.maxSteps) break;
    }

    if (kept.length && kept[kept.length - 1].action.type !== "finish") {
      const last = kept[kept.length - 1];
      kept.push({
        id: "finish",
        action: { type: "finish", params: last.save_as ? { result: last.save_as } : {} },
      });
    }

    return kept;
  }

  private buildPlan(
    goal: string,
    steps: PlanStep[],
    source: ActionPlan["source"],
    confidence: number
  ): ActionPlan {
    return {
      id: newId(),
      goal,
      steps,
      source,
      confidence,
      created_at: new Date().toISOString(),
    };
  }
}

// ─── HELPERS ─────────────────────────────────────────────────

/**
 * Models wrap JSON in prose or fences often enough that a bare JSON.parse
 * throws away otherwise-usable plans. Try strict first, then the fence, then
 * the outermost braces.
 */
export function safeParseJSON(text: string): Record<string, unknown> | null {
  const attempt = (candidate: string): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(candidate);
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(text.trim());
  if (direct) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    const parsed = attempt(fenced[1].trim());
    if (parsed) return parsed;
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return attempt(text.slice(first, last + 1));
  }

  return null;
}

/** Builds a plan directly from a manifest's baked workflow — no model call. */
export function planFromWorkflow(goal: string, steps: PlanStep[]): ActionPlan {
  return {
    id: newId(),
    goal,
    steps,
    source: "workflow",
    confidence: 1,
    created_at: new Date().toISOString(),
  };
}
