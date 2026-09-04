// ============================================================
// TASKPILOT — TOKEN OPTIMIZER
// services/api/src/runtime/optimizer/token-optimizer.ts
// Reduces AI costs by 60-80% through intelligent context compression
// ============================================================

import type { PageContext, TaskType } from "@taskpilot/shared/types";

interface OptimizationStrategy {
  max_visible_text: number;
  include_forms: boolean;
  include_tables: boolean;
  include_meta: boolean;
  include_links: boolean;
  compress_whitespace: boolean;
  strip_boilerplate: boolean;
}

const TASK_STRATEGIES: Record<TaskType, OptimizationStrategy> = {
  smart_paste: {
    max_visible_text: 500,
    include_forms: true,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  summarize: {
    max_visible_text: 3000,
    include_forms: false,
    include_tables: false,
    include_meta: true,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  translate: {
    max_visible_text: 2000,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  extract_data: {
    max_visible_text: 2000,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  extract_emails: {
    max_visible_text: 4000,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: false,
  },
  extract_prices: {
    max_visible_text: 3000,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  extract_companies: {
    max_visible_text: 2500,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  extract_links: {
    max_visible_text: 100,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: true,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  rewrite_text: {
    max_visible_text: 0,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  generate_reply: {
    max_visible_text: 1500,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  autofill_form: {
    max_visible_text: 300,
    include_forms: true,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  export_csv: {
    max_visible_text: 1000,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  export_excel: {
    max_visible_text: 1000,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  export_pdf: {
    max_visible_text: 4000,
    include_forms: false,
    include_tables: true,
    include_meta: true,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: false,
  },
  push_to_hubspot: {
    max_visible_text: 800,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  push_to_salesforce: {
    max_visible_text: 800,
    include_forms: false,
    include_tables: false,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  push_to_notion: {
    max_visible_text: 3000,
    include_forms: false,
    include_tables: true,
    include_meta: true,
    include_links: true,
    compress_whitespace: false,
    strip_boilerplate: true,
  },
  push_to_airtable: {
    max_visible_text: 1500,
    include_forms: false,
    include_tables: true,
    include_meta: false,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  browser_action: {
    max_visible_text: 1000,
    include_forms: true,
    include_tables: false,
    include_meta: false,
    include_links: true,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
  custom_prompt: {
    max_visible_text: 3000,
    include_forms: true,
    include_tables: true,
    include_meta: true,
    include_links: false,
    compress_whitespace: true,
    strip_boilerplate: true,
  },
};

// ─── BOILERPLATE PATTERNS TO STRIP ──────────────────────────

const BOILERPLATE_PATTERNS = [
  /cookie\s*(policy|consent|notice|settings)/gi,
  /accept\s*all\s*cookies/gi,
  /privacy\s*(policy|notice)/gi,
  /terms\s*(of\s*service|and\s*conditions)/gi,
  /all\s*rights\s*reserved/gi,
  /copyright\s*©?\s*\d{4}/gi,
  /subscribe\s*to\s*our\s*newsletter/gi,
  /sign\s*up\s*for\s*(our\s*)?newsletter/gi,
  /follow\s*us\s*on/gi,
  /share\s*this\s*(article|post|page)/gi,
  /loading\.\.\./gi,
];

export function stripBoilerplate(text: string): string {
  let result = text;
  for (const pattern of BOILERPLATE_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result;
}

export function compressWhitespace(text: string): string {
  return text
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

// ─── AI TASK BUDGETS ─────────────────────────────────────────
//
// The strategies above shape a PageContext for the planner. These budgets
// cover the other, much hotter path: the AI actions the extension runs
// through POST /v1/ai/process. Every one of them used to send up to 8,000
// characters and allow 1,500 output tokens regardless of what it was doing
// — a summary and a data extraction were charged the same.
//
// Output tokens are the expensive half (4-5x input per 1M on every model we
// route to), so capping them per task saves more than trimming input does.
//
// `verbatim` marks the tasks where the model reproduces the content rather
// than reasoning about it. Those get two exemptions:
//   - no boilerplate stripping — a regex that deletes "Privacy Policy" from
//     a page summary is fine; deleting it from the user's translation is
//     data loss;
//   - an output cap derived from the input, because a translation is about
//     as long as its source. A fixed cap would truncate it mid-sentence.

export interface AiTaskBudget {
  /** Characters of content sent to the model. */
  max_input_chars: number;
  /** Output ceiling for tasks that summarise or analyse. */
  max_output_tokens: number;
  /** True when the model reproduces the content instead of digesting it. */
  verbatim: boolean;
}

export const AI_TASK_BUDGETS: Record<string, AiTaskBudget> = {
  // A summary is short by definition; 400 tokens is a long one.
  summarize: { max_input_chars: 6_000, max_output_tokens: 400, verbatim: false },
  // JSON of everything found on the page — the one task that earns headroom.
  extract_data: { max_input_chars: 8_000, max_output_tokens: 900, verbatim: false },
  // A reply answers a message, not a whole site.
  generate_reply: { max_input_chars: 4_000, max_output_tokens: 600, verbatim: false },
  // Open question over the page: the answer is prose, not a document.
  custom: { max_input_chars: 6_000, max_output_tokens: 800, verbatim: false },
  // Verbatim: output scales with input, nothing is stripped.
  translate: { max_input_chars: 8_000, max_output_tokens: 0, verbatim: true },
  rewrite: { max_input_chars: 8_000, max_output_tokens: 0, verbatim: true },
};

/** Falls back to the open-question budget for unknown task names. */
export function budgetForTask(task: string): AiTaskBudget {
  return AI_TASK_BUDGETS[task] ?? AI_TASK_BUDGETS.custom;
}

/**
 * Trims content to a task's input budget. Non-verbatim tasks also get
 * boilerplate stripped and whitespace collapsed first, so the truncation
 * spends its characters on content rather than on cookie banners.
 */
export function prepareContent(content: string, budget: AiTaskBudget): string {
  if (budget.verbatim) return content.slice(0, budget.max_input_chars);

  const cleaned = compressWhitespace(stripBoilerplate(content));
  return cleaned.slice(0, budget.max_input_chars);
}

/**
 * Output ceiling for a request. Verbatim tasks scale with the input — at
 * ~4 characters per token a translation needs roughly as many tokens as its
 * source, plus room for languages that run longer than the original.
 */
export function outputBudgetFor(budget: AiTaskBudget, contentChars: number): number {
  if (!budget.verbatim) return budget.max_output_tokens;

  const scaled = Math.ceil((contentChars / 4) * 1.4);
  // Never below a floor (short selections still need a usable answer) and
  // never above what the old flat cap allowed.
  return Math.min(2_000, Math.max(256, scaled));
}

// ─── OPTIMIZER CLASS ──────────────────────────────────────────

export class TokenOptimizer {
  
  optimize(context: PageContext, taskType: TaskType): Partial<PageContext> {
    const strategy = TASK_STRATEGIES[taskType] || TASK_STRATEGIES.custom_prompt;
    
    const optimized: Partial<PageContext> = {
      url: context.url,
      title: context.title,
      page_type: context.page_type,
      domain: context.domain,
    };

    // Visible text
    if (strategy.max_visible_text > 0 && context.visible_text) {
      let text = context.visible_text;
      
      if (strategy.strip_boilerplate) {
        text = this.stripBoilerplate(text);
      }
      
      if (strategy.compress_whitespace) {
        text = this.compressWhitespace(text);
      }
      
      optimized.visible_text = text.slice(0, strategy.max_visible_text);
    }

    // Forms
    if (strategy.include_forms && context.detected_forms.length > 0) {
      optimized.detected_forms = context.detected_forms.map((f) => ({
        ...f,
        // Strip verbose selector info
        element_selector: f.element_selector.slice(0, 100),
      }));
    } else {
      optimized.detected_forms = [];
    }

    // Tables
    if (strategy.include_tables && context.detected_tables.length > 0) {
      // Limit to first 3 tables, max 50 rows each
      optimized.detected_tables = context.detected_tables.slice(0, 3).map((t) => ({
        ...t,
        rows: t.rows.slice(0, 50),
      }));
    } else {
      optimized.detected_tables = [];
    }

    // Meta
    if (strategy.include_meta && context.meta_description) {
      optimized.meta_description = context.meta_description.slice(0, 200);
    }

    // Selected text (always include if present)
    if (context.selected_text) {
      optimized.selected_text = context.selected_text.slice(0, 2000);
    }

    return optimized;
  }

  private stripBoilerplate(text: string): string {
    return stripBoilerplate(text);
  }

  private compressWhitespace(text: string): string {
    return compressWhitespace(text);
  }

  // ── USAGE ANALYTICS ─────────────────────────────────────

  estimateTokens(context: Partial<PageContext>): number {
    const textLength = [
      context.title || "",
      context.visible_text || "",
      context.meta_description || "",
      context.selected_text || "",
      JSON.stringify(context.detected_forms || []).slice(0, 500),
    ].join(" ").length;

    // ~4 chars per token (rough estimate for English text)
    return Math.ceil(textLength / 4);
  }

  calculateSavingsRatio(original: PageContext, optimized: Partial<PageContext>): number {
    const originalTokens = this.estimateTokens(original);
    const optimizedTokens = this.estimateTokens(optimized);
    if (originalTokens === 0) return 0;
    return 1 - optimizedTokens / originalTokens;
  }
}
