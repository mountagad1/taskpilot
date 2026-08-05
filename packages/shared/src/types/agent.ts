// ============================================================
// TASKPILOT — AGENT REGISTRY TYPES
// packages/shared/src/types/agent.ts
//
// An *agent* is a packaged, reusable browser automation: a goal, a
// harness (model + budgets + memory), the tools it is allowed to use,
// and an optional pre-baked workflow. The manifest is the unit that
// gets published, versioned, installed and executed.
// ============================================================

import type { PlanType } from "./index";
import type { BrowserActionType, PlanStep } from "./runtime";

// ─── CATEGORIES ──────────────────────────────────────────────

export const AGENT_CATEGORIES = [
  "sales",
  "marketing",
  "extraction",
  "ecommerce",
  "writing",
  "research",
  "productivity",
  "language",
  "engineering",
  "automation",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

// ─── MANIFEST ────────────────────────────────────────────────

/** Schema identifier stamped into every manifest TaskPilot emits. */
export const AGENT_MANIFEST_SCHEMA = "taskpilot.agent/v1";

export interface AgentManifest {
  schema: typeof AGENT_MANIFEST_SCHEMA;
  name: string;
  slug: string;
  version: string;
  description: string;
  category: AgentCategory;
  /** Natural-language statement of what the agent achieves. Fed to the planner. */
  goal: string;
  /** Tools the agent may call. The runtime refuses anything outside this list. */
  capabilities: BrowserActionType[];
  harness: AgentHarness;
  inputs: AgentInput[];
  triggers: AgentTrigger[];
  /**
   * Optional deterministic workflow. When present the runtime skips the
   * planning LLM call and executes these steps directly — cheaper and
   * repeatable. When absent the planner derives steps from `goal`.
   */
  workflow?: PlanStep[];
  deploy: AgentDeployTarget;
}

export interface AgentHarness {
  model: string;
  /** Hard ceiling on tokens for a single run. The runtime aborts past it. */
  token_budget_per_run: number;
  /** Hard ceiling on executed steps. Guards against planner loops. */
  max_steps: number;
  /** Wall-clock ceiling in milliseconds. */
  timeout_ms: number;
  memory: AgentMemoryConfig;
  /** Steps that must be confirmed by a human before executing. */
  require_confirmation: BrowserActionType[];
}

export interface AgentMemoryConfig {
  /** Keyspace for long-term memory. Scoped per-user at the storage layer. */
  namespace: string;
  ttl_hours: number;
  enabled: boolean;
}

export interface AgentInput {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "url" | "select" | "file";
  required: boolean;
  default?: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface AgentTrigger {
  type: "manual" | "url_match" | "schedule" | "hotkey";
  /** For url_match: a glob such as `https://*.linkedin.com/in/*`. */
  pattern?: string;
  /** For schedule: a cron expression. */
  cron?: string;
  /** For hotkey: e.g. `Alt+Shift+1`. */
  key?: string;
  surface?: "sidebar" | "popup" | "dashboard" | "api";
}

export interface AgentDeployTarget {
  targets: Array<"extension" | "dashboard" | "api">;
  min_plan: PlanType;
}

// ─── REGISTRY RECORDS ────────────────────────────────────────

export type AgentStatus = "draft" | "listed" | "suspended" | "archived";
export type AgentVisibility = "private" | "team" | "public";

export interface AgentRecord {
  id: string;
  owner_id: string | null;
  team_id: string | null;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: AgentCategory;
  capabilities: BrowserActionType[];
  price_cents: number;
  currency: string;
  status: AgentStatus;
  visibility: AgentVisibility;
  version: string;
  install_count: number;
  run_count: number;
  sales_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentVersionRecord {
  id: string;
  agent_id: string;
  version: string;
  manifest: AgentManifest;
  changelog: string | null;
  is_current: boolean;
  created_at: string;
}

export interface AgentInstallRecord {
  id: string;
  agent_id: string;
  user_id: string;
  version: string;
  /** User-supplied values for the manifest's declared inputs. */
  settings: Record<string, unknown>;
  enabled: boolean;
  installed_at: string;
  last_run_at: string | null;
}

export interface AgentReviewRecord {
  id: string;
  agent_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
}

// ─── DEFAULTS ────────────────────────────────────────────────

export const DEFAULT_HARNESS: AgentHarness = {
  model: "gpt-4.1-mini",
  token_budget_per_run: 8000,
  max_steps: 24,
  timeout_ms: 120_000,
  memory: { namespace: "default", ttl_hours: 24, enabled: true },
  // Anything that leaves the page or touches the filesystem is confirmed
  // by default — an agent should never silently navigate or download.
  require_confirmation: ["navigate", "download_file", "upload_file"],
};
