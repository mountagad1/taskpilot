// ============================================================
// TASKPILOT — CAPABILITY CATALOG
// packages/shared/src/capabilities.ts
//
// Metadata for every action the runtime can perform. This is public
// information -- buyers read it before installing an agent -- so it lives in
// the shared package rather than behind the private runtime. One source of
// truth behind the capability picker, plan-tier gating, the marketplace
// listing UI and the generated developer docs.
// ============================================================

import { BROWSER_ACTION_TYPES, type BrowserActionType } from "./types/runtime";
import type { PlanType } from "./types/index";

export type CapabilityGroup =
  | "navigation"
  | "interaction"
  | "reading"
  | "forms"
  | "files"
  | "ai"
  | "output"
  | "control";

export interface CapabilityDefinition {
  action: BrowserActionType;
  group: CapabilityGroup;
  label: string;
  description: string;
  /** Lowest plan that may execute this action. */
  min_plan: PlanType;
  /** Whether executing it costs an AI call. Drives cost estimates. */
  uses_ai: boolean;
  /** Whether it changes the page or leaves it — surfaced in the install prompt. */
  mutating: boolean;
  /** Named params the action understands, for the studio's form builder. */
  params?: Array<{ name: string; type: string; required: boolean; description: string }>;
}

const DEFS: CapabilityDefinition[] = [
  // ── Navigation ──
  {
    action: "navigate",
    group: "navigation",
    label: "Navigate",
    description: "Load a URL in the current tab.",
    min_plan: "free",
    uses_ai: false,
    mutating: true,
    params: [{ name: "url", type: "url", required: true, description: "Absolute http(s) URL" }],
  },
  { action: "go_back", group: "navigation", label: "Go back", description: "Return to the previous page.", min_plan: "free", uses_ai: false, mutating: true },
  { action: "reload", group: "navigation", label: "Reload", description: "Reload the current page.", min_plan: "free", uses_ai: false, mutating: true },
  {
    action: "open_tab",
    group: "navigation",
    label: "Open tab",
    description: "Open a URL in a new browser tab.",
    min_plan: "pro",
    uses_ai: false,
    mutating: false,
    params: [
      { name: "url", type: "url", required: true, description: "Absolute http(s) URL" },
      { name: "active", type: "boolean", required: false, description: "Focus the new tab" },
    ],
  },
  { action: "switch_tab", group: "navigation", label: "Switch tab", description: "Focus another open tab by id or URL match.", min_plan: "pro", uses_ai: false, mutating: false },
  { action: "close_tab", group: "navigation", label: "Close tab", description: "Close a tab this run opened.", min_plan: "pro", uses_ai: false, mutating: true },

  // ── Interaction ──
  { action: "click", group: "interaction", label: "Click", description: "Click an element.", min_plan: "free", uses_ai: false, mutating: true },
  {
    action: "type",
    group: "interaction",
    label: "Type",
    description: "Type text into an input, textarea or contenteditable.",
    min_plan: "free",
    uses_ai: false,
    mutating: true,
    params: [
      { name: "text", type: "string", required: true, description: "Text to enter" },
      { name: "clear_first", type: "boolean", required: false, description: "Clear the field before typing" },
    ],
  },
  { action: "clear", group: "interaction", label: "Clear field", description: "Empty an input's value.", min_plan: "free", uses_ai: false, mutating: true },
  {
    action: "select_option",
    group: "interaction",
    label: "Select option",
    description: "Choose an option in a <select>.",
    min_plan: "free",
    uses_ai: false,
    mutating: true,
    params: [{ name: "value", type: "string", required: true, description: "Option value or visible label" }],
  },
  { action: "check", group: "interaction", label: "Check / uncheck", description: "Toggle a checkbox or radio.", min_plan: "free", uses_ai: false, mutating: true },
  { action: "hover", group: "interaction", label: "Hover", description: "Hover an element to reveal menus.", min_plan: "free", uses_ai: false, mutating: false },
  {
    action: "press_key",
    group: "interaction",
    label: "Press key",
    description: "Send a keyboard key such as Enter or Escape.",
    min_plan: "free",
    uses_ai: false,
    mutating: true,
    params: [{ name: "key", type: "string", required: true, description: "Key name, e.g. Enter" }],
  },
  { action: "submit", group: "interaction", label: "Submit form", description: "Submit the form containing the target.", min_plan: "free", uses_ai: false, mutating: true },
  {
    action: "scroll",
    group: "interaction",
    label: "Scroll",
    description: "Scroll the page or an element into view.",
    min_plan: "free",
    uses_ai: false,
    mutating: false,
    params: [{ name: "to", type: "string", required: false, description: "top | bottom | element" }],
  },

  // ── Waiting ──
  { action: "wait_for_element", group: "control", label: "Wait for element", description: "Pause until an element appears.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "wait_for_navigation", group: "control", label: "Wait for navigation", description: "Pause until the page URL changes.", min_plan: "free", uses_ai: false, mutating: false },
  {
    action: "wait",
    group: "control",
    label: "Wait",
    description: "Pause for a fixed number of milliseconds.",
    min_plan: "free",
    uses_ai: false,
    mutating: false,
    params: [{ name: "ms", type: "number", required: true, description: "Milliseconds, max 30000" }],
  },
  { action: "assert_text", group: "control", label: "Assert text", description: "Fail the run unless the page contains given text.", min_plan: "free", uses_ai: false, mutating: false },

  // ── Reading ──
  { action: "read_page", group: "reading", label: "Read page", description: "Capture the page's visible text and structure.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "extract_text", group: "reading", label: "Extract text", description: "Read the text of a specific element.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "extract_table", group: "reading", label: "Extract table", description: "Turn an HTML table into rows and headers.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "extract_links", group: "reading", label: "Extract links", description: "Collect every hyperlink on the page.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "extract_emails", group: "reading", label: "Extract emails", description: "Collect and dedupe email addresses.", min_plan: "free", uses_ai: false, mutating: false },
  { action: "extract_prices", group: "reading", label: "Extract prices", description: "Collect monetary values with their currency.", min_plan: "free", uses_ai: false, mutating: false },
  {
    action: "extract_structured",
    group: "reading",
    label: "Extract structured data",
    description: "Pull records matching a named schema out of the page.",
    min_plan: "free",
    uses_ai: true,
    mutating: false,
    params: [{ name: "schema", type: "array", required: true, description: "Field names to extract" }],
  },
  { action: "screenshot", group: "reading", label: "Screenshot", description: "Capture the visible tab as an image.", min_plan: "pro", uses_ai: false, mutating: false },

  // ── Forms ──
  { action: "detect_forms", group: "forms", label: "Detect forms", description: "Find and classify the page's form fields.", min_plan: "free", uses_ai: false, mutating: false },
  {
    action: "fill_form",
    group: "forms",
    label: "Fill form",
    description: "Write values into named form fields.",
    min_plan: "free",
    uses_ai: false,
    mutating: true,
    params: [{ name: "values", type: "object", required: true, description: "Field name → value" }],
  },
  { action: "smart_paste", group: "forms", label: "Smart paste", description: "Map clipboard text onto the page's form fields.", min_plan: "free", uses_ai: true, mutating: true },

  // ── Files ──
  {
    action: "upload_file",
    group: "files",
    label: "Upload file",
    description: "Attach a file to a file input.",
    min_plan: "pro",
    uses_ai: false,
    mutating: true,
    params: [{ name: "file_id", type: "string", required: true, description: "Id of a file stored by TaskPilot" }],
  },
  {
    action: "download_file",
    group: "files",
    label: "Download file",
    description: "Download a linked file and store it against the run.",
    min_plan: "pro",
    uses_ai: false,
    mutating: true,
    params: [{ name: "url", type: "url", required: false, description: "Defaults to the target's href" }],
  },

  // ── AI ──
  { action: "summarize", group: "ai", label: "Summarize", description: "Summarise captured content.", min_plan: "free", uses_ai: true, mutating: false },
  { action: "translate", group: "ai", label: "Translate", description: "Translate captured content.", min_plan: "free", uses_ai: true, mutating: false },
  { action: "rewrite", group: "ai", label: "Rewrite", description: "Rewrite text in a requested tone.", min_plan: "free", uses_ai: true, mutating: false },
  { action: "generate_reply", group: "ai", label: "Generate reply", description: "Draft a reply to the open message or thread.", min_plan: "free", uses_ai: true, mutating: false },
  { action: "ask_ai", group: "ai", label: "Ask AI", description: "Answer a free-form question about the captured content.", min_plan: "free", uses_ai: true, mutating: false },

  // ── Output ──
  {
    action: "export_data",
    group: "output",
    label: "Export data",
    description: "Write collected rows to CSV, Excel, JSON or PDF.",
    min_plan: "free",
    uses_ai: false,
    mutating: false,
    params: [
      { name: "source", type: "string", required: true, description: "Scratchpad key holding the rows" },
      { name: "format", type: "string", required: true, description: "csv | excel | json | pdf" },
    ],
  },
  {
    action: "push_integration",
    group: "output",
    label: "Push to integration",
    description: "Send records to a connected CRM or workspace.",
    min_plan: "pro",
    uses_ai: false,
    mutating: true,
    params: [{ name: "provider", type: "string", required: true, description: "hubspot | salesforce | notion | airtable" }],
  },
  { action: "notify", group: "output", label: "Notify", description: "Raise an in-app notification for the user.", min_plan: "free", uses_ai: false, mutating: false },

  // ── Control ──
  { action: "finish", group: "control", label: "Finish", description: "End the run and return a named result.", min_plan: "free", uses_ai: false, mutating: false },
];

const BY_ACTION = new Map<BrowserActionType, CapabilityDefinition>(DEFS.map((d) => [d.action, d]));

export function getCapability(action: BrowserActionType): CapabilityDefinition | undefined {
  return BY_ACTION.get(action);
}

export function listCapabilities(): CapabilityDefinition[] {
  return [...DEFS];
}

export function capabilitiesByGroup(): Record<CapabilityGroup, CapabilityDefinition[]> {
  const grouped = {} as Record<CapabilityGroup, CapabilityDefinition[]>;
  for (const def of DEFS) {
    (grouped[def.group] ??= []).push(def);
  }
  return grouped;
}

/** Capabilities a given plan is allowed to execute. */
export function capabilitiesForPlan(plan: PlanType): BrowserActionType[] {
  const rank: Record<PlanType, number> = { free: 0, pro: 1, enterprise: 2 };
  return DEFS.filter((d) => rank[d.min_plan] <= rank[plan]).map((d) => d.action);
}

/** Capabilities in `requested` that `plan` may not run. */
export function gateCapabilities(
  requested: BrowserActionType[],
  plan: PlanType
): { allowed: BrowserActionType[]; blocked: BrowserActionType[] } {
  const permitted = new Set(capabilitiesForPlan(plan));
  const allowed: BrowserActionType[] = [];
  const blocked: BrowserActionType[] = [];
  for (const action of requested) {
    (permitted.has(action) ? allowed : blocked).push(action);
  }
  return { allowed, blocked };
}

/**
 * Guards against an action being added to the runtime without catalog
 * metadata, which would silently make it un-gateable and undocumented.
 */
export function findUncatalogedActions(): BrowserActionType[] {
  return BROWSER_ACTION_TYPES.filter((action) => !BY_ACTION.has(action));
}
