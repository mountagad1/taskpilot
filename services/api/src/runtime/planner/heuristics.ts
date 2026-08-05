// ============================================================
// TASKPILOT — HEURISTIC PLANNER
// services/api/src/runtime/planner/heuristics.ts
//
// Most of what users ask for is one of a few dozen shapes ("summarise
// this", "get all the emails", "export the table"). Matching those
// without a model call is the single biggest cost lever in the product,
// and it also makes the common path instant and deterministic.
// ============================================================

import type { PageContext, PlanStep, BrowserActionType } from "@taskpilot/shared";

export interface HeuristicMatch {
  steps: PlanStep[];
  confidence: number;
  /** Which rule fired. Surfaced in the run timeline for explainability. */
  rule: string;
}

interface Rule {
  name: string;
  /** All patterns must match somewhere in the normalised goal. */
  patterns: RegExp[];
  /** Disqualifies the rule when any of these match — cheap negative lookahead. */
  excludes?: RegExp[];
  confidence: number;
  build(goal: string, context: PageContext): PlanStep[];
}

function step(
  id: string,
  type: BrowserActionType,
  params?: Record<string, unknown>,
  saveAs?: string,
  rationale?: string
): PlanStep {
  return {
    id,
    action: { type, ...(params ? { params } : {}), ...(rationale ? { rationale } : {}) },
    ...(saveAs ? { save_as: saveAs } : {}),
  };
}

/** Pulls a target language out of "translate this to Spanish". */
function extractLanguage(goal: string): string | undefined {
  const match =
    /(?:to|into|en|in)\s+(english|french|spanish|german|italian|portuguese|dutch|polish|russian|arabic|hebrew|hindi|japanese|korean|chinese|mandarin|turkish|swedish|norwegian|danish|finnish|greek|czech|romanian|ukrainian|vietnamese|thai|indonesian)/i.exec(
      goal
    );
  return match?.[1]?.toLowerCase();
}

/** Pulls an export format out of "export as csv" / "download the xlsx". */
function extractFormat(goal: string): "csv" | "excel" | "json" | "pdf" | undefined {
  if (/\b(xlsx?|excel|spreadsheet)\b/i.test(goal)) return "excel";
  if (/\bcsv\b/i.test(goal)) return "csv";
  if (/\bjson\b/i.test(goal)) return "json";
  if (/\bpdf\b/i.test(goal)) return "pdf";
  return undefined;
}

function extractTone(goal: string): string | undefined {
  const match = /\b(professional|casual|formal|friendly|concise|detailed|polite|assertive|apologetic)\b/i.exec(goal);
  return match?.[1]?.toLowerCase();
}

const RULES: Rule[] = [
  {
    name: "summarize",
    patterns: [/\b(summari[sz]e|summary|tl;?dr|key points|gist|recap)\b/i],
    excludes: [/\btranslate\b/i],
    confidence: 0.92,
    build: (goal) => [
      step("read", "read_page", undefined, "page", "Read the page before summarising it"),
      step("summarize", "summarize", { source: "page", instruction: goal }, "summary"),
      step("done", "finish", { result: "summary" }),
    ],
  },
  {
    name: "translate",
    patterns: [/\btranslat(e|ion)\b/i],
    confidence: 0.92,
    build: (goal) => [
      step("read", "read_page", undefined, "page"),
      step(
        "translate",
        "translate",
        { source: "page", target_language: extractLanguage(goal) ?? "english" },
        "translation"
      ),
      step("done", "finish", { result: "translation" }),
    ],
  },
  {
    name: "extract_emails",
    patterns: [/\b(e-?mails?|e-?mail addresses)\b/i],
    excludes: [/\b(reply|respond|write|draft|compose|send)\b/i],
    confidence: 0.95,
    build: (goal) => {
      const format = extractFormat(goal);
      const steps = [
        step("read", "read_page", undefined, "page"),
        step("emails", "extract_emails", undefined, "emails", "Regex extraction — no model call needed"),
      ];
      if (format) {
        steps.push(step("export", "export_data", { source: "emails", format }, "export"));
      }
      steps.push(step("done", "finish", { result: format ? "export" : "emails" }));
      return steps;
    },
  },
  {
    name: "extract_prices",
    patterns: [/\b(prices?|pricing|cost(s)?|how much)\b/i],
    excludes: [/\b(subscription|upgrade|plan)\b/i],
    confidence: 0.88,
    build: (goal) => {
      const format = extractFormat(goal);
      const steps = [
        step("read", "read_page", undefined, "page"),
        step("prices", "extract_prices", undefined, "prices"),
      ];
      if (format) steps.push(step("export", "export_data", { source: "prices", format }, "export"));
      steps.push(step("done", "finish", { result: format ? "export" : "prices" }));
      return steps;
    },
  },
  {
    name: "extract_links",
    patterns: [/\b(links?|urls?|hyperlinks?)\b/i],
    excludes: [/\b(click|open|navigate|go to)\b/i],
    confidence: 0.9,
    build: (goal) => {
      const format = extractFormat(goal);
      const steps = [step("links", "extract_links", undefined, "links")];
      if (format) steps.push(step("export", "export_data", { source: "links", format }, "export"));
      steps.push(step("done", "finish", { result: format ? "export" : "links" }));
      return steps;
    },
  },
  {
    name: "extract_table",
    patterns: [/\b(table|tabular|rows?|spreadsheet|grid)\b/i],
    confidence: 0.9,
    build: (goal) => {
      const format = extractFormat(goal) ?? "csv";
      return [
        step("table", "extract_table", undefined, "table"),
        step("export", "export_data", { source: "table", format }, "export"),
        step("done", "finish", { result: "export" }),
      ];
    },
  },
  {
    name: "export_page_data",
    patterns: [/\b(export|download|save)\b/i, /\b(csv|excel|xlsx|json|pdf|spreadsheet)\b/i],
    confidence: 0.85,
    build: (goal) => [
      step("read", "read_page", undefined, "page"),
      step("table", "extract_table", undefined, "table"),
      step("export", "export_data", { source: "table", format: extractFormat(goal) ?? "csv" }, "export"),
      step("done", "finish", { result: "export" }),
    ],
  },
  {
    name: "generate_reply",
    patterns: [/\b(reply|respond|answer|draft a? ?(response|message|email))\b/i],
    confidence: 0.87,
    build: (goal) => [
      step("read", "read_page", undefined, "page"),
      step("reply", "generate_reply", { source: "page", tone: extractTone(goal) ?? "professional", instruction: goal }, "reply"),
      step("done", "finish", { result: "reply" }),
    ],
  },
  {
    name: "rewrite",
    patterns: [/\b(rewrite|rephrase|reword|improve|polish|proofread)\b/i],
    confidence: 0.87,
    build: (goal) => [
      step("read", "read_page", undefined, "page"),
      step("rewrite", "rewrite", { source: "selection_or_page", tone: extractTone(goal) ?? "professional", instruction: goal }, "rewritten"),
      step("done", "finish", { result: "rewritten" }),
    ],
  },
  {
    name: "fill_form",
    patterns: [/\b(fill|autofill|complete|populate)\b.*\b(form|fields?)\b/i],
    confidence: 0.86,
    build: () => [
      step("detect", "detect_forms", undefined, "forms"),
      step("fill", "smart_paste", { source: "clipboard" }, "filled"),
      step("done", "finish", { result: "filled" }),
    ],
  },
  {
    name: "smart_paste",
    patterns: [/\b(paste|clipboard)\b/i],
    confidence: 0.9,
    build: () => [
      step("detect", "detect_forms", undefined, "forms"),
      step("paste", "smart_paste", { source: "clipboard" }, "filled"),
      step("done", "finish", { result: "filled" }),
    ],
  },
  {
    name: "extract_contacts",
    patterns: [/\b(contacts?|leads?|people|prospects?)\b/i],
    confidence: 0.82,
    build: (goal) => {
      const format = extractFormat(goal);
      const steps = [
        step("read", "read_page", undefined, "page"),
        step(
          "contacts",
          "extract_structured",
          { schema: ["name", "email", "phone", "company", "job_title"], instruction: goal },
          "contacts"
        ),
      ];
      if (format) steps.push(step("export", "export_data", { source: "contacts", format }, "export"));
      steps.push(step("done", "finish", { result: format ? "export" : "contacts" }));
      return steps;
    },
  },
];

/**
 * Returns the highest-confidence rule whose patterns all match, or null when
 * the request needs real planning. Deliberately conservative — a wrong
 * heuristic plan is far more expensive than an extra model call.
 */
export function matchHeuristicPlan(goal: string, context: PageContext): HeuristicMatch | null {
  const normalised = goal.trim();
  if (!normalised) return null;

  // Multi-clause requests ("do X then Y and also Z") are compositional and
  // belong to the LLM planner; a single rule would silently drop clauses.
  const clauseCount = (normalised.match(/\b(then|after that|and then|next,)\b/gi) ?? []).length;
  if (clauseCount > 0) return null;

  let best: HeuristicMatch | null = null;

  for (const rule of RULES) {
    if (rule.excludes?.some((re) => re.test(normalised))) continue;
    if (!rule.patterns.every((re) => re.test(normalised))) continue;

    if (!best || rule.confidence > best.confidence) {
      best = { steps: rule.build(normalised, context), confidence: rule.confidence, rule: rule.name };
    }
  }

  return best;
}

/** Exposed for the planner's telemetry and for tests. */
export function heuristicRuleNames(): string[] {
  return RULES.map((r) => r.name);
}
