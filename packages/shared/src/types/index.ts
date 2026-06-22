// ============================================================
// TASKPILOT — CORE SHARED TYPES
// packages/shared/src/types/index.ts
// ============================================================

// ─── USER & AUTH ────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  plan: PlanType;
  created_at: string;
  updated_at: string;
  usage: UserUsage;
  settings: UserSettings;
}

export type PlanType = "free" | "pro" | "enterprise";

export interface UserUsage {
  ai_actions_used: number;
  ai_actions_limit: number;
  exports_used: number;
  exports_limit: number;
  automations_used: number;
  automations_limit: number;
  period_start: string;
  period_end: string;
}

export interface UserSettings {
  theme: "light" | "dark" | "system";
  language: string;
  sidebar_position: "left" | "right";
  shortcuts_enabled: boolean;
  notifications_enabled: boolean;
  analytics_enabled: boolean;
  smart_paste_confidence_threshold: number;
}

// ─── SESSIONS (ANONYMOUS-FIRST) ──────────────────────────────

export interface AnonymousSession {
  session_id: string;
  fingerprint: string;
  created_at: string;
  actions_used: number;
  actions_limit: number;
  expires_at: string;
}

// ─── AI ORCHESTRATION ────────────────────────────────────────

export type AIModel =
  | "gpt-4.1-mini"
  | "gpt-4.1"
  | "claude-sonnet-4-20250514"
  | "claude-haiku-4-5-20251001";

export type TaskComplexity = "simple" | "moderate" | "complex";

export interface AIRequest {
  id: string;
  session_id: string;
  user_id?: string;
  task_type: TaskType;
  input: string;
  context: PageContext;
  tools_requested?: ToolName[];
  model_override?: AIModel;
  created_at: string;
}

export interface AIResponse {
  request_id: string;
  result: unknown;
  tools_executed: ToolExecutionResult[];
  model_used: AIModel;
  tokens_used: TokenUsage;
  execution_time_ms: number;
  cached: boolean;
  confidence: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

// ─── TASK TYPES ──────────────────────────────────────────────

export type TaskType =
  | "smart_paste"
  | "summarize"
  | "translate"
  | "extract_data"
  | "extract_emails"
  | "extract_prices"
  | "extract_companies"
  | "extract_links"
  | "rewrite_text"
  | "generate_reply"
  | "autofill_form"
  | "export_csv"
  | "export_excel"
  | "export_pdf"
  | "push_to_hubspot"
  | "push_to_salesforce"
  | "push_to_notion"
  | "push_to_airtable"
  | "browser_action"
  | "custom_prompt";

// ─── TOOLS ───────────────────────────────────────────────────

export type ToolName =
  | "extract_visible_content"
  | "detect_forms"
  | "extract_tables"
  | "extract_emails"
  | "extract_prices"
  | "extract_links"
  | "autofill_fields"
  | "summarize_content"
  | "rewrite_text"
  | "translate_content"
  | "generate_reply"
  | "export_csv"
  | "export_excel"
  | "export_pdf"
  | "push_to_hubspot"
  | "push_to_salesforce"
  | "create_notion_page"
  | "create_airtable_record"
  | "click_element"
  | "type_text"
  | "scroll_page"
  | "wait_for_element"
  | "screenshot"
  | "navigate_to";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, ToolParameter>;
  requires_plan: PlanType;
  requires_ai: boolean;
  estimated_tokens: number;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolExecutionResult {
  tool: ToolName;
  success: boolean;
  data?: unknown;
  error?: string;
  execution_time_ms: number;
}

// ─── PAGE CONTEXT ────────────────────────────────────────────

export interface PageContext {
  url: string;
  title: string;
  visible_text: string;
  meta_description?: string;
  selected_text?: string;
  detected_forms: FormField[];
  detected_tables: TableData[];
  page_type: PageType;
  domain: string;
}

export type PageType =
  | "crm"
  | "email"
  | "social"
  | "ecommerce"
  | "documentation"
  | "dashboard"
  | "form"
  | "article"
  | "generic";

export interface FormField {
  id?: string;
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  confidence: number;
  semantic_type?: SemanticFieldType;
  element_selector: string;
}

export type SemanticFieldType =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "company"
  | "job_title"
  | "address"
  | "city"
  | "country"
  | "zip"
  | "url"
  | "linkedin"
  | "twitter"
  | "message"
  | "subject"
  | "date"
  | "unknown";

export interface TableData {
  headers: string[];
  rows: string[][];
  row_count: number;
  element_selector: string;
}

// ─── SMART PASTE ─────────────────────────────────────────────

export interface SmartPasteRequest {
  clipboard_text: string;
  page_context: PageContext;
  session_id: string;
}

export interface SmartPasteResult {
  mappings: FieldMapping[];
  unmapped_data: Record<string, string>;
  confidence: number;
  parsing_layers_used: ParsingLayer[];
  tokens_used?: TokenUsage;
}

export interface FieldMapping {
  field: FormField;
  value: string;
  confidence: number;
  source: ParsingLayer;
}

export type ParsingLayer = "regex" | "heuristic" | "ai";

// ─── EXPORTS ─────────────────────────────────────────────────

export type ExportFormat = "csv" | "excel" | "pdf" | "json" | "word";

export interface ExportRequest {
  format: ExportFormat;
  data_type: "table" | "contacts" | "products" | "custom";
  source_url: string;
  data: unknown;
  filename?: string;
}

// ─── INTEGRATIONS ────────────────────────────────────────────

export interface IntegrationConfig {
  provider: IntegrationProvider;
  access_token: string;
  refresh_token?: string;
  workspace_id?: string;
  connected_at: string;
}

export type IntegrationProvider =
  | "hubspot"
  | "salesforce"
  | "notion"
  | "airtable"
  | "gmail"
  | "outlook";

// ─── ANALYTICS ───────────────────────────────────────────────

export interface AnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  session_id: string;
  user_id?: string;
  timestamp: string;
  url: string;
}

export interface ProductivityMetrics {
  session_id: string;
  hours_saved: number;
  actions_completed: number;
  keystrokes_saved: number;
  forms_autofilled: number;
  data_extracted_rows: number;
  exports_created: number;
  streak_days: number;
}

// ─── WORKFLOW ────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  created_by: string;
  is_active: boolean;
  run_count: number;
  last_run_at?: string;
}

export interface WorkflowTrigger {
  type: "manual" | "url_match" | "schedule";
  config?: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  tool: ToolName;
  parameters: Record<string, unknown>;
  on_success?: string;
  on_failure?: string;
}

// ─── BILLING ─────────────────────────────────────────────────

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

export const PLAN_LIMITS: Record<PlanType, UserUsage> = {
  free: {
    ai_actions_used: 0,
    ai_actions_limit: 20,
    exports_used: 0,
    exports_limit: 3,
    automations_used: 0,
    automations_limit: 0,
    period_start: "",
    period_end: "",
  },
  pro: {
    ai_actions_used: 0,
    ai_actions_limit: -1, // unlimited
    exports_used: 0,
    exports_limit: -1,
    automations_used: 0,
    automations_limit: -1,
    period_start: "",
    period_end: "",
  },
  enterprise: {
    ai_actions_used: 0,
    ai_actions_limit: -1,
    exports_used: 0,
    exports_limit: -1,
    automations_used: 0,
    automations_limit: -1,
    period_start: "",
    period_end: "",
  },
};
