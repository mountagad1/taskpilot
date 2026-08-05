// ============================================================
// TASKPILOT — DATABASE ROW SHAPES
// services/api/src/lib/rows.ts
//
// supabase-js infers a result type by parsing the `select()` string at
// compile time. Our column lists are shared constants rather than inline
// literals, so inference yields `GenericStringError`. Declaring the shapes
// here and pairing them with `.returns<T>()` restores real typing at every
// call site, and gives one place to update when the schema changes.
// ============================================================

import type {
  ActionPlan,
  AgentCategory,
  AgentStatus,
  AgentVisibility,
  BrowserActionType,
  PlanStep,
  PlanType,
  RunStatus,
} from "@taskpilot/shared";

/**
 * Narrows an untyped Postgrest result to a known row shape. The cast is real
 * — the database is the source of truth and TypeScript cannot see it — so
 * keeping it in one named function makes every such assumption greppable
 * rather than scattered as inline `as` expressions.
 */
export function asRow<T>(value: unknown): T {
  return value as T;
}

export function asRows<T>(value: unknown): T[] {
  return (value ?? []) as T[];
}

export interface AgentRow {
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
  goal: string | null;
  min_plan: PlanType;
  install_count: number;
  run_count: number;
  sales_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  workflow_id: string | null;
  goal: string;
  status: RunStatus;
  plan: ActionPlan | null;
  steps_total: number;
  steps_completed: number;
  output: Record<string, unknown>;
  error: string | null;
  tokens_used: number;
  cost_usd: number;
  source_url: string | null;
  domain: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface RunStepRow {
  step_index: number;
  step_id: string;
  action: BrowserActionType;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  result: unknown;
  error: string | null;
  attempts: number;
  duration_ms: number;
}

export interface WorkflowRow {
  id: string;
  user_id: string;
  team_id: string | null;
  agent_id: string | null;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: PlanStep[];
  is_active: boolean;
  run_count: number;
  last_run_at: string | null;
  schedule_cron: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersionRow {
  id: string;
  version: string;
  changelog: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
