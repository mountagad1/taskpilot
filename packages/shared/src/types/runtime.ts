// ============================================================
// TASKPILOT — AI RUNTIME + BROWSER AUTOMATION TYPES
// packages/shared/src/types/runtime.ts
//
// The contract between the three layers that actually do the work:
//
//   Planner   natural language + page context  →  ActionPlan
//   Runtime   ActionPlan                       →  BrowserAction stream
//   Executor  BrowserAction                    →  ActionResult (touches the DOM)
//
// Nothing here imports a DOM type. The runtime is environment-agnostic so
// the same plan can run inside the extension, in a test harness, or against
// a headless driver on the server.
// ============================================================

import type { PageContext } from "./index";

// ─── BROWSER ACTIONS ─────────────────────────────────────────

export const BROWSER_ACTION_TYPES = [
  // Navigation
  "navigate",
  "go_back",
  "reload",
  "open_tab",
  "switch_tab",
  "close_tab",
  // Interaction
  "click",
  "type",
  "clear",
  "select_option",
  "check",
  "hover",
  "press_key",
  "submit",
  "scroll",
  // Waiting / assertions
  "wait_for_element",
  "wait_for_navigation",
  "wait",
  "assert_text",
  // Reading
  "read_page",
  "extract_text",
  "extract_table",
  "extract_links",
  "extract_emails",
  "extract_prices",
  "extract_structured",
  "screenshot",
  // Forms
  "detect_forms",
  "fill_form",
  "smart_paste",
  // Files
  "upload_file",
  "download_file",
  // AI-side (no DOM contact)
  "summarize",
  "translate",
  "rewrite",
  "generate_reply",
  "ask_ai",
  // Output
  "export_data",
  "push_integration",
  "notify",
  // Control flow
  "finish",
] as const;

export type BrowserActionType = (typeof BROWSER_ACTION_TYPES)[number];

/** Actions that mutate the page or leave it. Used for confirmation gating. */
export const MUTATING_ACTIONS: readonly BrowserActionType[] = [
  "navigate",
  "go_back",
  "reload",
  "click",
  "type",
  "clear",
  "select_option",
  "check",
  "press_key",
  "submit",
  "fill_form",
  "smart_paste",
  "upload_file",
  "download_file",
  "push_integration",
  "close_tab",
];

/** Actions the executor resolves without any DOM access. */
export const AI_ONLY_ACTIONS: readonly BrowserActionType[] = [
  "summarize",
  "translate",
  "rewrite",
  "generate_reply",
  "ask_ai",
];

// ─── TARGETING ───────────────────────────────────────────────

/**
 * How to find an element. Strategies are tried in order of `by`, and the
 * executor falls back through `fallbacks` when the primary misses — real
 * pages change their DOM between the plan and the click.
 */
export interface ElementTarget {
  by: "css" | "text" | "label" | "placeholder" | "role" | "name" | "testid";
  value: string;
  /** Disambiguates when a strategy matches several elements. 0-based. */
  index?: number;
  fallbacks?: Array<{ by: ElementTarget["by"]; value: string }>;
  /** Human-readable description, used in confirmation prompts and logs. */
  description?: string;
}

// ─── ACTIONS ─────────────────────────────────────────────────

export interface BrowserAction {
  type: BrowserActionType;
  target?: ElementTarget;
  /** Action-specific arguments. Shape is validated per action type. */
  params?: Record<string, unknown>;
  /** Why the planner chose this step. Shown in the run timeline. */
  rationale?: string;
}

export interface ActionResult {
  action: BrowserActionType;
  success: boolean;
  /** Whatever the action produced — extracted rows, generated text, etc. */
  data?: unknown;
  error?: string;
  /** Set when the action failed but retrying could plausibly succeed. */
  retryable?: boolean;
  duration_ms: number;
  /** Page URL after the action, so the runtime can notice navigation. */
  url?: string;
}

// ─── PLANNING ────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  action: BrowserAction;
  /** Steps that must succeed first. Empty means "runs in sequence order". */
  depends_on?: string[];
  /** Skip this step unless the expression evaluates truthy. */
  condition?: StepCondition;
  retry?: { max_attempts: number; backoff_ms: number };
  /** Store this step's result under this key in the run scratchpad. */
  save_as?: string;
  optional?: boolean;
}

/**
 * Conditions are intentionally a small closed set rather than an expression
 * language — an LLM-authored `eval` string is not something to run in a
 * privileged extension context.
 */
export interface StepCondition {
  /** Scratchpad key to test, e.g. the `save_as` of an earlier step. */
  key: string;
  op: "exists" | "not_exists" | "equals" | "not_equals" | "contains" | "gt" | "lt";
  value?: string | number | boolean;
}

export type PlanSource = "heuristic" | "llm" | "workflow" | "manual";

export interface ActionPlan {
  id: string;
  /** The user's original words. Preserved verbatim for replan context. */
  goal: string;
  steps: PlanStep[];
  source: PlanSource;
  /** Planner's self-assessed 0..1 confidence that these steps meet the goal. */
  confidence: number;
  /** Present when the planner needs something before it can act. */
  clarification_needed?: string;
  created_at: string;
}

// ─── REASONING ───────────────────────────────────────────────

export type ReasoningVerdict =
  | "continue"
  | "retry"
  | "replan"
  | "skip"
  | "finish"
  | "fail"
  | "await_confirmation";

export interface ReasoningDecision {
  verdict: ReasoningVerdict;
  reason: string;
  /** For `replan`: what to tell the planner about why the last plan failed. */
  feedback?: string;
  confidence: number;
}

// ─── RUNS ────────────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface RunRequest {
  /** Natural-language instruction, or the agent's goal when running an agent. */
  goal: string;
  agent_id?: string;
  workflow_id?: string;
  /** Values for the agent manifest's declared inputs. */
  inputs?: Record<string, unknown>;
  context: PageContext;
  /** Overrides the agent harness. Clamped to the caller's plan limits. */
  limits?: Partial<RunLimits>;
  dry_run?: boolean;
}

export interface RunLimits {
  max_steps: number;
  token_budget: number;
  timeout_ms: number;
  /** Ask the user before executing these. */
  confirm: BrowserActionType[];
}

export interface RunRecord {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  workflow_id: string | null;
  goal: string;
  status: RunStatus;
  plan: ActionPlan | null;
  steps_total: number;
  steps_completed: number;
  /** Values saved by steps via `save_as`. The run's working memory. */
  output: Record<string, unknown>;
  error: string | null;
  tokens_used: number;
  cost_usd: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface RunStepRecord {
  id: string;
  run_id: string;
  step_index: number;
  step_id: string;
  action: BrowserActionType;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  result: unknown;
  error: string | null;
  attempts: number;
  duration_ms: number;
  created_at: string;
}

// ─── RUNTIME EVENTS (streamed to the UI) ─────────────────────

export type RuntimeEvent =
  | { type: "run_started"; run_id: string; goal: string }
  | { type: "planning"; run_id: string }
  | { type: "plan_ready"; run_id: string; plan: ActionPlan }
  | { type: "step_started"; run_id: string; step: PlanStep; index: number }
  | { type: "step_finished"; run_id: string; step_id: string; result: ActionResult }
  | { type: "step_skipped"; run_id: string; step_id: string; reason: string }
  | { type: "confirmation_required"; run_id: string; step: PlanStep }
  | { type: "reasoning"; run_id: string; decision: ReasoningDecision }
  | { type: "replanning"; run_id: string; feedback: string }
  | { type: "run_finished"; run_id: string; status: RunStatus; output: Record<string, unknown> }
  | { type: "run_failed"; run_id: string; error: string }
  | { type: "log"; run_id: string; level: "debug" | "info" | "warn" | "error"; message: string };

export type RuntimeEventHandler = (event: RuntimeEvent) => void | Promise<void>;

// ─── DISPATCHER ──────────────────────────────────────────────

/**
 * Bridges the runtime to whatever can actually touch a browser. The
 * extension implements this over `chrome.tabs.sendMessage`; tests
 * implement it with an in-memory fake.
 */
export interface ActionDispatcher {
  dispatch(action: BrowserAction, signal?: AbortSignal): Promise<ActionResult>;
  /** Fresh page context, re-read after navigation or DOM mutation. */
  readContext?(): Promise<PageContext>;
}

// ─── DEFAULTS ────────────────────────────────────────────────

export const DEFAULT_RUN_LIMITS: RunLimits = {
  max_steps: 24,
  token_budget: 8000,
  timeout_ms: 120_000,
  confirm: ["navigate", "download_file", "upload_file", "push_integration"],
};
