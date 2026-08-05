// ============================================================
// TASKPILOT SDK — AGENT AUTHORING
// packages/sdk/src/define.ts
//
// `defineAgent` gives developers a typed, fluent way to describe an agent
// and get a manifest the registry will accept. Every builder call feeds the
// same validator the server runs, so `.build()` failing locally means the
// publish would have failed — caught at author time instead of deploy time.
// ============================================================

import {
  AGENT_MANIFEST_SCHEMA,
  DEFAULT_HARNESS,
  parseAgentManifest,
  slugify,
  type AgentCategory,
  type AgentInput,
  type AgentManifest,
  type AgentTrigger,
  type BrowserAction,
  type BrowserActionType,
  type ElementTarget,
  type PlanStep,
  type StepCondition,
} from "@taskpilot/shared";

export class AgentDefinitionError extends Error {
  constructor(message: string, readonly issues: Array<{ path: string; message: string }>) {
    super(`${message}\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n")}`);
    this.name = "AgentDefinitionError";
  }
}

export interface AgentInit {
  name: string;
  goal: string;
  slug?: string;
  version?: string;
  description?: string;
  category?: AgentCategory;
}

// ─── STEP BUILDER ────────────────────────────────────────────

/**
 * Collects steps for a baked workflow. Every method returns `this`, so a
 * workflow reads as a sequence of intentions rather than nested objects.
 */
export class StepBuilder {
  private readonly steps: PlanStep[] = [];
  private counter = 0;

  private push(action: BrowserAction, options: StepOptions = {}): this {
    this.counter++;
    const step: PlanStep = {
      id: options.id ?? `step_${this.counter}`,
      action,
    };
    if (options.saveAs) step.save_as = options.saveAs;
    if (options.optional) step.optional = true;
    if (options.condition) step.condition = options.condition;
    if (options.retry) step.retry = options.retry;
    if (options.dependsOn?.length) step.depends_on = options.dependsOn;

    this.steps.push(step);
    return this;
  }

  // ── Navigation ──
  navigate(url: string, options?: StepOptions): this {
    return this.push({ type: "navigate", params: { url } }, options);
  }

  openTab(url: string, options?: StepOptions): this {
    return this.push({ type: "open_tab", params: { url } }, options);
  }

  // ── Interaction ──
  click(target: TargetLike, options?: StepOptions): this {
    return this.push({ type: "click", target: toTarget(target) }, options);
  }

  type(target: TargetLike, text: string, options?: StepOptions & { clearFirst?: boolean }): this {
    return this.push(
      { type: "type", target: toTarget(target), params: { text, clear_first: options?.clearFirst !== false } },
      options
    );
  }

  select(target: TargetLike, value: string, options?: StepOptions): this {
    return this.push({ type: "select_option", target: toTarget(target), params: { value } }, options);
  }

  check(target: TargetLike, checked?: boolean, options?: StepOptions): this {
    return this.push({ type: "check", target: toTarget(target), params: { checked } }, options);
  }

  pressKey(key: string, target?: TargetLike, options?: StepOptions): this {
    return this.push(
      { type: "press_key", ...(target ? { target: toTarget(target) } : {}), params: { key } },
      options
    );
  }

  submit(target?: TargetLike, options?: StepOptions): this {
    return this.push({ type: "submit", ...(target ? { target: toTarget(target) } : {}) }, options);
  }

  scroll(to: "top" | "bottom" = "bottom", options?: StepOptions): this {
    return this.push({ type: "scroll", params: { to } }, options);
  }

  // ── Waiting ──
  waitFor(target: TargetLike, timeoutMs = 10_000, options?: StepOptions): this {
    return this.push(
      { type: "wait_for_element", target: toTarget(target), params: { timeout_ms: timeoutMs } },
      options
    );
  }

  wait(ms: number, options?: StepOptions): this {
    return this.push({ type: "wait", params: { ms } }, options);
  }

  assertText(text: string, options?: StepOptions): this {
    return this.push({ type: "assert_text", params: { text } }, options);
  }

  // ── Reading ──
  readPage(saveAs = "page", options?: StepOptions): this {
    return this.push({ type: "read_page" }, { ...options, saveAs });
  }

  extractText(target: TargetLike, saveAs: string, options?: StepOptions): this {
    return this.push({ type: "extract_text", target: toTarget(target) }, { ...options, saveAs });
  }

  extractTable(saveAs = "table", index = 0, options?: StepOptions): this {
    return this.push({ type: "extract_table", params: { index } }, { ...options, saveAs });
  }

  extractEmails(saveAs = "emails", options?: StepOptions): this {
    return this.push({ type: "extract_emails" }, { ...options, saveAs });
  }

  extractPrices(saveAs = "prices", options?: StepOptions): this {
    return this.push({ type: "extract_prices" }, { ...options, saveAs });
  }

  extractLinks(saveAs = "links", options?: StepOptions): this {
    return this.push({ type: "extract_links" }, { ...options, saveAs });
  }

  extractStructured(schema: string[], saveAs: string, options?: StepOptions): this {
    return this.push({ type: "extract_structured", params: { schema } }, { ...options, saveAs });
  }

  // ── Forms ──
  fillForm(values: Record<string, unknown>, options?: StepOptions): this {
    return this.push({ type: "fill_form", params: { values } }, options);
  }

  smartPaste(text?: string, options?: StepOptions): this {
    return this.push({ type: "smart_paste", params: text ? { text } : {} }, options);
  }

  // ── AI ──
  summarize(source = "page", saveAs = "summary", options?: StepOptions): this {
    return this.push({ type: "summarize", params: { source } }, { ...options, saveAs });
  }

  translate(targetLanguage: string, source = "page", saveAs = "translation", options?: StepOptions): this {
    return this.push(
      { type: "translate", params: { source, target_language: targetLanguage } },
      { ...options, saveAs }
    );
  }

  generateReply(tone = "professional", saveAs = "reply", options?: StepOptions): this {
    return this.push({ type: "generate_reply", params: { tone } }, { ...options, saveAs });
  }

  ask(question: string, saveAs = "answer", options?: StepOptions): this {
    return this.push({ type: "ask_ai", params: { question } }, { ...options, saveAs });
  }

  // ── Output ──
  export(
    source: string,
    format: "csv" | "json" | "excel" | "pdf" = "csv",
    options?: StepOptions & { filename?: string }
  ): this {
    return this.push(
      {
        type: "export_data",
        // `{{source}}` is resolved from the run scratchpad at execution time.
        params: { rows: `{{${source}}}`, format, filename: options?.filename },
      },
      { saveAs: "export", ...options }
    );
  }

  pushTo(provider: string, source: string, options?: StepOptions): this {
    return this.push(
      { type: "push_integration", params: { provider, records: `{{${source}}}` } },
      options
    );
  }

  notify(message: string, options?: StepOptions): this {
    return this.push({ type: "notify", params: { message } }, options);
  }

  /** Terminates the run and names the value to return. */
  finish(resultKey?: string): this {
    return this.push({ type: "finish", params: resultKey ? { result: resultKey } : {} }, { id: "finish" });
  }

  /** Escape hatch for an action the builder has no sugar for. */
  raw(action: BrowserAction, options?: StepOptions): this {
    return this.push(action, options);
  }

  toArray(): PlanStep[] {
    return [...this.steps];
  }

  /** Every distinct action used — the capability list a manifest must declare. */
  capabilities(): BrowserActionType[] {
    return [...new Set(this.steps.map((s) => s.action.type))].filter((t) => t !== "finish");
  }
}

export interface StepOptions {
  id?: string;
  saveAs?: string;
  optional?: boolean;
  condition?: StepCondition;
  retry?: { max_attempts: number; backoff_ms: number };
  dependsOn?: string[];
}

export type TargetLike = string | ElementTarget;

/** Tags common enough that a bare mention almost certainly means a selector. */
const HTML_TAG =
  /^(?:a|button|input|select|textarea|form|label|table|tr|td|th|ul|ol|li|img|h[1-6]|div|span|section|nav|header|footer|main|article|dialog|summary)$/i;

/**
 * Decides whether a bare string is a CSS selector or visible text, so
 * `click("#save")` and `click("Save changes")` both do the obvious thing.
 * Anything ambiguous falls to text, because a text match that misses fails
 * loudly, while a selector that accidentally matches clicks the wrong thing.
 */
export function looksLikeSelector(value: string): boolean {
  const text = value.trim();
  if (!text) return false;

  // Unambiguous selector openers.
  if (/^[#.[]/.test(text)) return true;
  // Combinators only appear in selectors.
  if (/[>+~]/.test(text)) return true;
  // A phrase with spaces is a label, not a selector.
  if (/\s/.test(text)) return false;

  return /[#.[\]:]/.test(text) || HTML_TAG.test(text);
}

function toTarget(target: TargetLike): ElementTarget {
  if (typeof target !== "string") return target;
  return looksLikeSelector(target)
    ? { by: "css", value: target }
    : { by: "text", value: target };
}

// ─── AGENT BUILDER ───────────────────────────────────────────

export class AgentBuilder {
  private readonly manifest: Partial<AgentManifest>;
  private readonly stepBuilder = new StepBuilder();
  private hasWorkflow = false;

  constructor(init: AgentInit) {
    this.manifest = {
      schema: AGENT_MANIFEST_SCHEMA,
      name: init.name,
      slug: init.slug ?? slugify(init.name),
      version: init.version ?? "1.0.0",
      description: init.description ?? "",
      category: init.category ?? "automation",
      goal: init.goal,
      capabilities: [],
      harness: { ...DEFAULT_HARNESS, memory: { ...DEFAULT_HARNESS.memory } },
      inputs: [],
      triggers: [],
      deploy: { targets: ["extension"], min_plan: "free" },
    };
  }

  describe(description: string): this {
    this.manifest.description = description;
    return this;
  }

  category(category: AgentCategory): this {
    this.manifest.category = category;
    return this;
  }

  /** Declares capabilities explicitly. Steps added via `workflow` are merged in. */
  can(...capabilities: BrowserActionType[]): this {
    this.manifest.capabilities = [...new Set([...(this.manifest.capabilities ?? []), ...capabilities])];
    return this;
  }

  input(input: AgentInput): this {
    this.manifest.inputs = [...(this.manifest.inputs ?? []), input];
    return this;
  }

  trigger(trigger: AgentTrigger): this {
    this.manifest.triggers = [...(this.manifest.triggers ?? []), trigger];
    return this;
  }

  /** Overrides model, budgets, timeout and confirmation policy. */
  harness(patch: Partial<AgentManifest["harness"]>): this {
    this.manifest.harness = {
      ...(this.manifest.harness as AgentManifest["harness"]),
      ...patch,
      memory: { ...(this.manifest.harness as AgentManifest["harness"]).memory, ...(patch.memory ?? {}) },
    };
    return this;
  }

  deploy(patch: Partial<AgentManifest["deploy"]>): this {
    this.manifest.deploy = { ...(this.manifest.deploy as AgentManifest["deploy"]), ...patch };
    return this;
  }

  /**
   * Bakes a deterministic step sequence. An agent with a workflow skips the
   * planning model call entirely, which makes it cheaper and repeatable.
   */
  workflow(build: (steps: StepBuilder) => void): this {
    build(this.stepBuilder);
    this.hasWorkflow = true;
    return this;
  }

  /** Validates and returns the manifest, or throws with every problem listed. */
  build(): AgentManifest {
    const draft = { ...this.manifest };

    if (this.hasWorkflow) {
      draft.workflow = this.stepBuilder.toArray();
      // Declaring capabilities by hand and then forgetting one is the most
      // common authoring mistake; derive them from the workflow instead.
      draft.capabilities = [
        ...new Set([...(draft.capabilities ?? []), ...this.stepBuilder.capabilities()]),
      ];
    }

    if (!draft.triggers?.length) {
      draft.triggers = [{ type: "manual", surface: "sidebar" }];
    }

    const parsed = parseAgentManifest(draft);
    if (!parsed.ok) {
      throw new AgentDefinitionError(`Agent "${draft.name}" is not valid`, parsed.issues);
    }

    return parsed.value;
  }

  toJSON(): AgentManifest {
    return this.build();
  }
}

/** Entry point: `defineAgent({ name, goal }).workflow(...).build()`. */
export function defineAgent(init: AgentInit): AgentBuilder {
  return new AgentBuilder(init);
}
