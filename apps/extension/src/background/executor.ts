// ============================================================
// TASKPILOT EXTENSION — RUN EXECUTOR
// apps/extension/src/background/executor.ts
//
// Carries out a server-issued plan against a real tab. The background
// worker is the only context with tab, download and screenshot privileges,
// so DOM actions are forwarded to the content script while privileged ones
// are handled here.
//
// Every step's outcome is reported back to the API, which is what makes the
// run timeline and analytics real rather than reconstructed.
// ============================================================

import type {
  ActionPlan,
  ActionResult,
  BrowserAction,
  BrowserActionType,
  PageContext,
  PlanStep,
  RunStatus,
} from "@taskpilot/shared";

import { API_BASE, isAutomatable } from "../shared/config";
import { sendToTab, type RunState, type RunUpdate } from "../shared/messages";

export interface ExecutorDeps {
  /** Authenticated fetch against the TaskPilot API. */
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Pushes progress to any open popup or sidebar. */
  broadcast: (update: RunUpdate) => void;
  /** Resolves once the user answers a confirmation prompt. */
  requestConfirmation: (runId: string, step: PlanStep) => Promise<boolean>;
}

const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled", "timed_out"];

/** Actions the background worker performs itself rather than in the page. */
const PRIVILEGED: BrowserActionType[] = [
  "open_tab",
  "switch_tab",
  "close_tab",
  "screenshot",
  "download_file",
  "navigate",
];

/** Actions resolved by calling the backend, not by touching the DOM. */
const AI_ACTIONS: BrowserActionType[] = [
  "summarize",
  "translate",
  "rewrite",
  "generate_reply",
  "ask_ai",
  "extract_structured",
];

export class RunExecutor {
  private state: RunState = emptyState();
  private abort: AbortController | null = null;
  private pendingConfirmation: ((approved: boolean) => void) | null = null;
  /** Tabs this run opened, so close_tab can never target the user's own. */
  private readonly ownedTabs = new Set<number>();

  constructor(private readonly deps: ExecutorDeps) {}

  getState(): RunState {
    return { ...this.state, results: [...this.state.results] };
  }

  get isRunning(): boolean {
    return this.state.runId !== null && !TERMINAL.includes(this.state.status as RunStatus);
  }

  /** Resolves a pending confirmation prompt. */
  answerConfirmation(approved: boolean): void {
    this.pendingConfirmation?.(approved);
    this.pendingConfirmation = null;
  }

  cancel(): void {
    this.abort?.abort();
    this.pendingConfirmation?.(false);
    this.pendingConfirmation = null;
  }

  // ── ENTRY POINT ──────────────────────────────────────────

  /**
   * Asks the server to plan, then executes the returned steps against `tabId`.
   * Returns the final run state.
   */
  async start(options: {
    tabId: number;
    goal?: string;
    agentId?: string;
    inputs?: Record<string, unknown>;
    context: PageContext;
  }): Promise<RunState> {
    if (this.isRunning) {
      throw new Error("A run is already in progress. Cancel it before starting another.");
    }

    this.abort = new AbortController();
    this.ownedTabs.clear();

    // ── Plan ──
    const created = await this.deps.api<{
      run: { id: string | null; goal: string };
      plan: ActionPlan;
      limits: { max_steps: number; timeout_ms: number; confirm: BrowserActionType[] };
    }>("/runs", {
      method: "POST",
      body: JSON.stringify({
        goal: options.goal,
        agent_id: options.agentId,
        inputs: options.inputs,
        context: options.context,
      }),
    });

    const runId = created.run.id;
    if (!runId) throw new Error("The server did not persist this run");

    this.state = {
      runId,
      status: "running",
      goal: created.run.goal,
      plan: created.plan,
      currentStep: 0,
      results: [],
      awaitingConfirmation: null,
      output: {},
      error: null,
    };

    this.deps.broadcast({ type: "RUN_STARTED", runId, goal: created.run.goal, plan: created.plan });

    // ── Execute ──
    const deadline = Date.now() + Math.min(created.limits.timeout_ms, 600_000);
    const confirmSet = new Set(created.limits.confirm);
    const scratchpad: Record<string, unknown> = {};

    try {
      for (const [index, step] of created.plan.steps.entries()) {
        if (this.abort.signal.aborted) {
          return this.finish("cancelled", scratchpad, "Cancelled by the user");
        }
        if (Date.now() > deadline) {
          return this.finish("timed_out", scratchpad, "The run exceeded its time budget");
        }
        if (index >= created.limits.max_steps) {
          return this.finish("failed", scratchpad, "The run exceeded its step budget");
        }

        this.state.currentStep = index;

        // Terminal step: resolve the named result and stop.
        if (step.action.type === "finish") {
          const key = step.action.params?.result;
          if (typeof key === "string" && key in scratchpad) scratchpad.result = scratchpad[key];
          await this.reportStep(runId, index, { status: "succeeded", duration_ms: 0 });
          return this.finish("completed", scratchpad);
        }

        // Confirmation gate for anything that navigates or writes files.
        if (confirmSet.has(step.action.type)) {
          this.state.awaitingConfirmation = step;
          this.state.status = "awaiting_confirmation";
          this.deps.broadcast({ type: "RUN_CONFIRM", runId, step });

          const approved = await this.awaitConfirmation(runId, step);
          this.state.awaitingConfirmation = null;
          this.state.status = "running";

          if (!approved) {
            await this.reportStep(runId, index, { status: "skipped", error: "Declined by the user" });
            return this.finish("cancelled", scratchpad, `You declined the "${step.action.type}" step`);
          }
        }

        this.deps.broadcast({ type: "RUN_STEP", runId, index, step });
        await this.reportStep(runId, index, { status: "running" });

        const action = interpolate(step.action, scratchpad);
        const result = await this.dispatch(options.tabId, action, step);

        this.state.results.push({
          index,
          action: action.type,
          success: result.success,
          error: result.error,
        });

        await this.reportStep(runId, index, {
          status: result.success ? "succeeded" : "failed",
          result: result.success ? result.data : undefined,
          error: result.error,
          duration_ms: result.duration_ms,
        });

        this.deps.broadcast({ type: "RUN_STEP", runId, index, step, result });

        if (result.success) {
          if (step.save_as) scratchpad[step.save_as] = result.data;
        } else if (!step.optional) {
          return this.finish("failed", scratchpad, result.error ?? `Step "${step.id}" failed`);
        }
      }

      return this.finish("completed", scratchpad);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The run failed unexpectedly";
      return this.finish("failed", scratchpad, message);
    }
  }

  // ── DISPATCH ─────────────────────────────────────────────

  private async dispatch(
    tabId: number,
    action: BrowserAction,
    step: PlanStep
  ): Promise<ActionResult> {
    const started = Date.now();
    const attempts = Math.max(1, step.retry?.max_attempts ?? 1);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) await sleep(step.retry?.backoff_ms ?? 400);

      const result = PRIVILEGED.includes(action.type)
        ? await this.runPrivileged(tabId, action)
        : AI_ACTIONS.includes(action.type)
          ? await this.runAI(tabId, action)
          : await this.runInPage(tabId, action);

      // Only a retryable failure is worth another attempt; a missing element
      // may appear, but a malformed action never will.
      if (result.success || !result.retryable || attempt === attempts) {
        return { ...result, duration_ms: Date.now() - started };
      }
    }

    return {
      action: action.type,
      success: false,
      error: "Exhausted retries",
      duration_ms: Date.now() - started,
    };
  }

  /** Forwards a DOM action to the content script, injecting it if absent. */
  private async runInPage(tabId: number, action: BrowserAction): Promise<ActionResult> {
    let response = await sendToTab<ActionResult>(tabId, { type: "EXECUTE_ACTION", action });

    if (!response.ok && response.code === "no_content_script") {
      // The tab predates the extension, or navigated. Inject and retry once.
      const injected = await this.injectContentScript(tabId);
      if (!injected) {
        return {
          action: action.type,
          success: false,
          error: "TaskPilot cannot run on this page",
          retryable: false,
          duration_ms: 0,
        };
      }
      response = await sendToTab<ActionResult>(tabId, { type: "EXECUTE_ACTION", action });
    }

    if (!response.ok) {
      return {
        action: action.type,
        success: false,
        error: response.error,
        retryable: response.code === "no_content_script",
        duration_ms: 0,
      };
    }

    return response.data;
  }

  /** Tab, download and screenshot actions, which need extension privileges. */
  private async runPrivileged(tabId: number, action: BrowserAction): Promise<ActionResult> {
    const started = Date.now();
    const params = action.params ?? {};

    const fail = (error: string, retryable = false): ActionResult => ({
      action: action.type,
      success: false,
      error,
      retryable,
      duration_ms: Date.now() - started,
    });

    const done = (data: unknown): ActionResult => ({
      action: action.type,
      success: true,
      data,
      duration_ms: Date.now() - started,
    });

    try {
      switch (action.type) {
        case "navigate": {
          const url = safeHttpUrl(params.url);
          if (!url) return fail("navigate needs an http(s) URL");
          await chrome.tabs.update(tabId, { url });
          await waitForTabLoad(tabId);
          return done({ url });
        }

        case "open_tab": {
          const url = safeHttpUrl(params.url);
          if (!url) return fail("open_tab needs an http(s) URL");
          const tab = await chrome.tabs.create({ url, active: params.active !== false });
          if (tab.id !== undefined) {
            this.ownedTabs.add(tab.id);
            await waitForTabLoad(tab.id);
          }
          return done({ tab_id: tab.id, url });
        }

        case "switch_tab": {
          const match = typeof params.url_contains === "string" ? params.url_contains : null;
          const targetId = typeof params.tab_id === "number" ? params.tab_id : null;

          const tabs = await chrome.tabs.query({});
          const found = targetId
            ? tabs.find((t) => t.id === targetId)
            : tabs.find((t) => match && t.url?.includes(match));

          if (!found?.id) return fail("No matching tab is open", true);
          await chrome.tabs.update(found.id, { active: true });
          return done({ tab_id: found.id, url: found.url });
        }

        case "close_tab": {
          const targetId = typeof params.tab_id === "number" ? params.tab_id : null;
          if (targetId === null) return fail("close_tab needs a tab_id");
          // Refuse to close anything this run did not open.
          if (!this.ownedTabs.has(targetId)) {
            return fail("close_tab may only close tabs this run opened");
          }
          await chrome.tabs.remove(targetId);
          this.ownedTabs.delete(targetId);
          return done({ closed: targetId });
        }

        case "screenshot": {
          const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
          // The data URL can be megabytes; the run timeline only needs a handle.
          return done({ captured: true, bytes: dataUrl.length, data_url: dataUrl });
        }

        case "download_file": {
          const url = safeHttpUrl(params.url);
          if (!url) return fail("download_file needs an http(s) URL");
          const downloadId = await chrome.downloads.download({
            url,
            filename: typeof params.filename === "string" ? params.filename : undefined,
            saveAs: false,
          });
          return done({ download_id: downloadId, url });
        }

        default:
          return fail(`"${action.type}" is not a privileged action`);
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : "The browser refused this action");
    }
  }

  /** Sends captured content to the backend for an AI-only action. */
  private async runAI(tabId: number, action: BrowserAction): Promise<ActionResult> {
    const started = Date.now();

    try {
      // These actions reason over page content, so read it fresh rather than
      // trusting a snapshot taken before earlier steps mutated the page.
      let content = typeof action.params?.content === "string" ? action.params.content : "";
      if (!content) {
        const contextResponse = await sendToTab<PageContext>(tabId, { type: "READ_CONTEXT" });
        content = contextResponse.ok ? contextResponse.data.visible_text : "";
      }

      const data = await this.deps.api<{ result: unknown }>("/ai/process", {
        method: "POST",
        body: JSON.stringify({
          task: mapActionToTask(action.type),
          pageContext: { url: "", content },
          userInput: action.params?.question ?? action.params?.instruction,
          options: action.params,
        }),
      });

      return {
        action: action.type,
        success: true,
        data: data.result,
        duration_ms: Date.now() - started,
      };
    } catch (err) {
      return {
        action: action.type,
        success: false,
        error: err instanceof Error ? err.message : "The AI request failed",
        retryable: true,
        duration_ms: Date.now() - started,
      };
    }
  }

  private async injectContentScript(tabId: number): Promise<boolean> {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!isAutomatable(tab.url)) return false;

      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  // ── REPORTING ────────────────────────────────────────────

  private async reportStep(
    runId: string,
    index: number,
    report: { status: string; result?: unknown; error?: string; duration_ms?: number }
  ): Promise<void> {
    try {
      await this.deps.api(`/runs/${runId}/steps`, {
        method: "POST",
        body: JSON.stringify({ step_index: index, ...report }),
      });
    } catch {
      // Telemetry must never break execution — the user's task matters more
      // than a complete timeline.
    }
  }

  private awaitConfirmation(runId: string, step: PlanStep): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingConfirmation = resolve;
      void this.deps.requestConfirmation(runId, step).then((approved) => {
        if (this.pendingConfirmation === resolve) {
          this.pendingConfirmation = null;
          resolve(approved);
        }
      });
    });
  }

  private async finish(
    status: RunStatus,
    output: Record<string, unknown>,
    error?: string
  ): Promise<RunState> {
    this.state.status = status;
    this.state.output = output;
    this.state.error = error ?? null;

    const runId = this.state.runId;
    if (runId) {
      try {
        await this.deps.api(`/runs/${runId}`, {
          method: "PATCH",
          body: JSON.stringify({ status, output, error }),
        });
      } catch {
        // The run still finished locally; a failed report is not a failed run.
      }

      if (error) this.deps.broadcast({ type: "RUN_FAILED", runId, error });
      else this.deps.broadcast({ type: "RUN_FINISHED", runId, status, output });
    }

    this.abort = null;
    return this.getState();
  }
}

// ─── HELPERS ─────────────────────────────────────────────────

function emptyState(): RunState {
  return {
    runId: null,
    status: "idle",
    goal: "",
    plan: null,
    currentStep: 0,
    results: [],
    awaitingConfirmation: null,
    output: {},
    error: null,
  };
}

/** Substitutes `{{key}}` references in action params from the scratchpad. */
function interpolate(action: BrowserAction, scratchpad: Record<string, unknown>): BrowserAction {
  if (!action.params) return action;

  const resolve = (path: string): unknown => {
    const segments = path.split(".");
    let current: unknown = scratchpad[segments[0]];
    for (let i = 1; i < segments.length && current != null; i++) {
      current = Array.isArray(current)
        ? current[Number.parseInt(segments[i], 10)]
        : (current as Record<string, unknown>)[segments[i]];
    }
    return current;
  };

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const whole = /^\{\{\s*([\w.[\]-]+)\s*\}\}$/.exec(value);
      // A string that is only a reference yields the raw value, so an array
      // stays an array instead of becoming "[object Object]".
      if (whole) {
        const resolved = resolve(whole[1]);
        return resolved === undefined ? value : resolved;
      }
      return value.replace(/\{\{\s*([\w.[\]-]+)\s*\}\}/g, (match, path: string) => {
        const resolved = resolve(path);
        if (resolved === undefined) return match;
        return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      });
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };

  return { ...action, params: walk(action.params) as Record<string, unknown> };
}

/** Rejects anything that is not http(s) — the last line before navigation. */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function mapActionToTask(action: BrowserActionType): string {
  switch (action) {
    case "summarize":
      return "summarize";
    case "translate":
      return "translate";
    case "rewrite":
      return "rewrite";
    case "generate_reply":
      return "generate_reply";
    case "extract_structured":
      return "extract_data";
    default:
      return "custom";
  }
}

/** Resolves when the tab finishes loading, or after a 15s ceiling. */
function waitForTabLoad(tabId: number, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);

    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // A frame reporting "complete" often precedes the app rendering;
        // a short settle avoids racing the very next step.
        setTimeout(resolve, 300);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { API_BASE };
