// ============================================================
// TASKPILOT — BROWSER ACTION EXECUTOR
// packages/browser-tools/src/actions/executor.ts
//
// Executes a single BrowserAction against a Document. This is the only
// place in the codebase that mutates a user's page, so every handler:
//   - resolves its target through the shared resolver (visibility checked)
//   - reports failures as ActionResult, never as a thrown exception
//   - marks failures retryable only when a retry could plausibly differ
//
// Actions that need privileged APIs (tabs, downloads, screenshots) are
// delegated to a host bridge the extension supplies; without one they fail
// cleanly rather than pretending to work.
// ============================================================

import type {
  ActionResult,
  BrowserAction,
  BrowserActionType,
  ElementTarget,
  PageContext,
} from "@taskpilot/shared";

import { describeTarget, isDisabled, resolveElement } from "../dom/resolver";
import {
  buildPageContext,
  extractEmails,
  extractLinks,
  extractPrices,
  extractTables,
  getVisibleText,
  tableToRecords,
} from "../extract";
import { serialiseExport, toRows } from "../export";
import { SmartPasteEngine, detectFormFields } from "../smart-paste";

// ─── HOST BRIDGE ─────────────────────────────────────────────

/**
 * Capabilities a plain content script cannot provide. Implemented by the
 * extension background worker; absent in tests and on the server.
 */
export interface HostBridge {
  openTab?(url: string, active: boolean): Promise<{ tab_id: number }>;
  switchTab?(match: { tab_id?: number; url_contains?: string }): Promise<{ tab_id: number }>;
  closeTab?(tabId: number): Promise<void>;
  screenshot?(): Promise<{ data_url: string }>;
  downloadFile?(url: string, filename?: string): Promise<{ file_id: string; filename: string }>;
  /** Resolves a stored file id to something assignable to a file input. */
  resolveFile?(fileId: string): Promise<File>;
  readClipboard?(): Promise<string>;
  /** Runs an AI-only action (summarize, translate, …) through the backend. */
  runAI?(action: BrowserActionType, params: Record<string, unknown>): Promise<unknown>;
  pushIntegration?(provider: string, records: unknown): Promise<unknown>;
  notify?(message: string, level: string): Promise<void>;
  /** Persists an export and returns a download handle. */
  saveExport?(payload: {
    filename: string;
    contentType: string;
    content?: string;
    format: string;
    rows: unknown;
  }): Promise<{ file_id?: string; url?: string; filename: string }>;
}

export interface ExecutorOptions {
  doc?: Document;
  host?: HostBridge;
  /** How long to wait for a target before giving up. */
  defaultTimeoutMs?: number;
  /** Cap on characters captured by read_page. */
  maxTextChars?: number;
  /**
   * Ceiling for an explicit `wait` step. Should be set below the run's
   * remaining wall-clock budget so a plan can't sleep through it.
   */
  maxWaitMs?: number;
}

// ─── ERRORS ──────────────────────────────────────────────────

class ActionFailure extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ActionFailure";
  }
}

const retryable = (message: string) => new ActionFailure(message, true);
const fatal = (message: string) => new ActionFailure(message, false);

// ─── EXECUTOR ────────────────────────────────────────────────

export class ActionExecutor {
  private readonly doc: Document;
  private readonly host: HostBridge;
  private readonly defaultTimeoutMs: number;
  private readonly maxTextChars: number;
  private readonly maxWaitMs: number;
  private readonly smartPaste = new SmartPasteEngine();
  /** Tabs this run opened, so close_tab can't be aimed at the user's own tabs. */
  private readonly ownedTabs = new Set<number>();

  constructor(options: ExecutorOptions = {}) {
    const doc = options.doc ?? (typeof document !== "undefined" ? document : undefined);
    if (!doc) throw new Error("ActionExecutor requires a Document");
    this.doc = doc;
    this.host = options.host ?? {};
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.maxTextChars = options.maxTextChars ?? 20_000;
    this.maxWaitMs = options.maxWaitMs ?? 30_000;
  }

  /** Never throws — every outcome is an ActionResult. */
  async execute(action: BrowserAction, signal?: AbortSignal): Promise<ActionResult> {
    const started = Date.now();

    try {
      if (signal?.aborted) throw fatal("Run was cancelled");
      const data = await this.run(action, signal);
      return {
        action: action.type,
        success: true,
        data,
        duration_ms: Date.now() - started,
        url: this.doc.location?.href,
      };
    } catch (err) {
      const failure = err instanceof ActionFailure ? err : null;
      return {
        action: action.type,
        success: false,
        error: err instanceof Error ? err.message : "Action failed",
        retryable: failure?.retryable ?? false,
        duration_ms: Date.now() - started,
        url: this.doc.location?.href,
      };
    }
  }

  /** Adapts this executor to the runtime's dispatcher interface. */
  asDispatcher() {
    return {
      dispatch: (action: BrowserAction, signal?: AbortSignal) => this.execute(action, signal),
      readContext: async (): Promise<PageContext> => buildPageContext(this.doc, this.maxTextChars),
    };
  }

  // ── ROUTER ───────────────────────────────────────────────

  private async run(action: BrowserAction, signal?: AbortSignal): Promise<unknown> {
    const params = action.params ?? {};

    switch (action.type) {
      // ── Navigation ──
      case "navigate":
        return this.navigate(params);
      case "go_back":
        this.doc.defaultView?.history.back();
        return { navigated: "back" };
      case "reload":
        this.doc.defaultView?.location.reload();
        return { reloaded: true };
      case "open_tab":
        return this.openTab(params);
      case "switch_tab":
        return this.switchTab(params);
      case "close_tab":
        return this.closeTab(params);

      // ── Interaction ──
      case "click":
        return this.click(action.target, signal);
      case "type":
        return this.type(action.target, params, signal);
      case "clear":
        return this.clear(action.target, signal);
      case "select_option":
        return this.selectOption(action.target, params, signal);
      case "check":
        return this.check(action.target, params, signal);
      case "hover":
        return this.hover(action.target, signal);
      case "press_key":
        return this.pressKey(action.target, params, signal);
      case "submit":
        return this.submit(action.target, signal);
      case "scroll":
        return this.scroll(action.target, params, signal);

      // ── Waiting ──
      case "wait":
        return this.wait(params, signal);
      case "wait_for_element":
        return this.waitForElement(action.target, params, signal);
      case "wait_for_navigation":
        return this.waitForNavigation(params, signal);
      case "assert_text":
        return this.assertText(params);

      // ── Reading ──
      case "read_page":
        return buildPageContext(this.doc, this.maxTextChars);
      case "extract_text":
        return this.extractText(action.target, signal);
      case "extract_table":
        return this.extractTable(params);
      case "extract_links":
        return extractLinks(this.doc);
      case "extract_emails":
        return extractEmails(getVisibleText(this.doc, this.maxTextChars));
      case "extract_prices":
        return extractPrices(getVisibleText(this.doc, this.maxTextChars));
      case "extract_structured":
        return this.delegateAI("extract_structured", {
          ...params,
          content: getVisibleText(this.doc, this.maxTextChars),
        });
      case "screenshot":
        return this.screenshot();

      // ── Forms ──
      case "detect_forms":
        return detectFormFields(this.doc);
      case "fill_form":
        return this.fillForm(params);
      case "smart_paste":
        return this.doSmartPaste(params);

      // ── Files ──
      case "upload_file":
        return this.uploadFile(action.target, params, signal);
      case "download_file":
        return this.downloadFile(action.target, params, signal);

      // ── AI ──
      case "summarize":
      case "translate":
      case "rewrite":
      case "generate_reply":
      case "ask_ai":
        return this.delegateAI(action.type, {
          ...params,
          content: this.resolveContent(params),
        });

      // ── Output ──
      case "export_data":
        return this.exportData(params);
      case "push_integration":
        return this.pushIntegration(params);
      case "notify":
        return this.notify(params);

      case "finish":
        return params.result ?? null;

      default: {
        const exhaustive: never = action.type;
        throw fatal(`Unsupported action: ${String(exhaustive)}`);
      }
    }
  }

  // ── TARGETING ────────────────────────────────────────────

  private async require(
    target: ElementTarget | undefined,
    action: string,
    signal?: AbortSignal
  ): Promise<HTMLElement> {
    if (!target) throw fatal(`${action} requires a target element`);

    const result = await resolveElement(target, {
      root: this.doc,
      timeoutMs: this.defaultTimeoutMs,
      requireVisible: true,
    });

    if (!result.element) {
      // `strategy` set with no element means it matched but was invisible —
      // worth retrying, since an overlay may still be animating away.
      if (result.strategy) {
        throw retryable(`Found ${describeTarget(target)} but it is not visible`);
      }
      throw retryable(`Could not find ${describeTarget(target)}`);
    }

    if (signal?.aborted) throw fatal("Run was cancelled");
    return result.element;
  }

  // ── NAVIGATION ───────────────────────────────────────────

  private navigate(params: Record<string, unknown>) {
    const url = this.requireHttpUrl(params.url, "navigate");
    const view = this.doc.defaultView;
    if (!view) throw fatal("No window is associated with this document");
    view.location.assign(url);
    return { url };
  }

  private async openTab(params: Record<string, unknown>) {
    const url = this.requireHttpUrl(params.url, "open_tab");
    if (!this.host.openTab) throw fatal("open_tab is not available in this environment");
    const { tab_id } = await this.host.openTab(url, params.active !== false);
    this.ownedTabs.add(tab_id);
    return { tab_id, url };
  }

  private async switchTab(params: Record<string, unknown>) {
    if (!this.host.switchTab) throw fatal("switch_tab is not available in this environment");
    const match = {
      tab_id: typeof params.tab_id === "number" ? params.tab_id : undefined,
      url_contains: typeof params.url_contains === "string" ? params.url_contains : undefined,
    };
    if (match.tab_id === undefined && !match.url_contains) {
      throw fatal("switch_tab needs a tab_id or url_contains");
    }
    return this.host.switchTab(match);
  }

  private async closeTab(params: Record<string, unknown>) {
    if (!this.host.closeTab) throw fatal("close_tab is not available in this environment");
    const tabId = params.tab_id;
    if (typeof tabId !== "number") throw fatal("close_tab needs a numeric tab_id");
    // Refuse to close a tab this run didn't open — an agent should never be
    // able to close the user's other work.
    if (!this.ownedTabs.has(tabId)) {
      throw fatal("close_tab may only close tabs this run opened");
    }
    await this.host.closeTab(tabId);
    this.ownedTabs.delete(tabId);
    return { closed: tabId };
  }

  // ── INTERACTION ──────────────────────────────────────────

  private async click(target: ElementTarget | undefined, signal?: AbortSignal) {
    const element = await this.require(target, "click", signal);
    if (isDisabled(element)) throw retryable(`${describeTarget(target!)} is disabled`);

    element.scrollIntoView?.({ block: "center" });
    // Dispatch the full sequence — many UI libraries listen for pointerdown
    // or mousedown rather than click.
    this.fire(element, "pointerdown");
    this.fire(element, "mousedown");
    this.fire(element, "mouseup");
    element.click();

    return { clicked: describeTarget(target!) };
  }

  private async type(target: ElementTarget | undefined, params: Record<string, unknown>, signal?: AbortSignal) {
    const element = await this.require(target, "type", signal);
    const text = typeof params.text === "string" ? params.text : String(params.text ?? "");

    if (params.clear_first !== false) this.setValue(element, "");
    this.setValue(element, text, true);

    return { typed: text.length, target: describeTarget(target!) };
  }

  private async clear(target: ElementTarget | undefined, signal?: AbortSignal) {
    const element = await this.require(target, "clear", signal);
    this.setValue(element, "");
    return { cleared: describeTarget(target!) };
  }

  private async selectOption(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    const element = await this.require(target, "select_option", signal);
    if (!(element instanceof this.window().HTMLSelectElement)) {
      throw fatal(`${describeTarget(target!)} is not a <select>`);
    }

    const wanted = String(params.value ?? "");
    const normalised = wanted.trim().toLowerCase();

    // Match by value first, then by visible label — a plan written from the
    // rendered page will usually name the label.
    const option =
      [...element.options].find((o) => o.value === wanted) ??
      [...element.options].find((o) => o.text.trim().toLowerCase() === normalised) ??
      [...element.options].find((o) => o.text.trim().toLowerCase().includes(normalised));

    if (!option) {
      const available = [...element.options].map((o) => o.text.trim()).slice(0, 10);
      throw fatal(`No option matching "${wanted}". Available: ${available.join(", ")}`);
    }

    element.value = option.value;
    this.fire(element, "input");
    this.fire(element, "change");

    return { selected: option.value, label: option.text.trim() };
  }

  private async check(target: ElementTarget | undefined, params: Record<string, unknown>, signal?: AbortSignal) {
    const element = await this.require(target, "check", signal);
    if (!(element instanceof this.window().HTMLInputElement)) {
      throw fatal(`${describeTarget(target!)} is not an input`);
    }
    if (element.type !== "checkbox" && element.type !== "radio") {
      throw fatal(`${describeTarget(target!)} is a ${element.type}, not a checkbox or radio`);
    }

    const desired = params.checked === undefined ? !element.checked : params.checked === true;

    if (element.checked !== desired) {
      // click() natively flips `checked` and fires input+change, which is what
      // framework handlers listen for. Assigning `checked` as well would flip
      // it a second time and land on the wrong state.
      element.click();

      // A handler may have called preventDefault, reverting the toggle. Fall
      // back to a direct write so the requested state still holds.
      if (element.checked !== desired) {
        element.checked = desired;
        this.fire(element, "input");
        this.fire(element, "change");
      }
    }

    return { checked: element.checked };
  }

  private async hover(target: ElementTarget | undefined, signal?: AbortSignal) {
    const element = await this.require(target, "hover", signal);
    this.fire(element, "pointerover");
    this.fire(element, "mouseover");
    this.fire(element, "mouseenter", false);
    return { hovered: describeTarget(target!) };
  }

  private async pressKey(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    const key = typeof params.key === "string" ? params.key : "";
    if (!key) throw fatal("press_key needs a key name");

    const element = target
      ? await this.require(target, "press_key", signal)
      : (this.doc.activeElement as HTMLElement | null) ?? this.doc.body;

    const view = this.window();
    for (const type of ["keydown", "keypress", "keyup"]) {
      element.dispatchEvent(
        new view.KeyboardEvent(type, { key, bubbles: true, cancelable: true })
      );
    }

    return { pressed: key };
  }

  private async submit(target: ElementTarget | undefined, signal?: AbortSignal) {
    const view = this.window();
    let form: HTMLFormElement | null = null;

    if (target) {
      const element = await this.require(target, "submit", signal);
      form =
        element instanceof view.HTMLFormElement
          ? element
          : (element.closest("form") as HTMLFormElement | null);
    } else {
      form = this.doc.querySelector("form");
    }

    if (!form) throw fatal("No form found to submit");
    // requestSubmit runs validation and fires submit handlers; form.submit()
    // bypasses both, which silently breaks most modern forms.
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();

    return { submitted: form.id || form.name || "form" };
  }

  private async scroll(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    const view = this.doc.defaultView;

    if (target) {
      const element = await this.require(target, "scroll", signal);
      element.scrollIntoView?.({ block: "center" });
      return { scrolled_to: describeTarget(target) };
    }

    const to = String(params.to ?? "bottom");
    if (!view) throw fatal("No window is associated with this document");

    if (to === "top") view.scrollTo?.(0, 0);
    else if (to === "bottom") view.scrollTo?.(0, this.doc.body?.scrollHeight ?? 0);
    else if (typeof params.y === "number") view.scrollTo?.(0, params.y);

    return { scrolled_to: to };
  }

  // ── WAITING ──────────────────────────────────────────────

  private async wait(params: Record<string, unknown>, signal?: AbortSignal) {
    const requested = typeof params.ms === "number" ? params.ms : 500;
    // Cap the pause: an agent that sleeps for minutes burns the run's
    // wall-clock budget for nothing.
    const ms = Math.min(Math.max(requested, 0), this.maxWaitMs);
    await sleep(ms, signal);
    return { waited_ms: ms };
  }

  private async waitForElement(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    if (!target) throw fatal("wait_for_element requires a target");
    const timeoutMs = Math.min(typeof params.timeout_ms === "number" ? params.timeout_ms : 10_000, 60_000);

    const result = await resolveElement(target, { root: this.doc, timeoutMs, requireVisible: true });
    if (!result.element) throw retryable(`Timed out waiting for ${describeTarget(target)}`);
    if (signal?.aborted) throw fatal("Run was cancelled");

    return { found: describeTarget(target), strategy: result.strategy };
  }

  private async waitForNavigation(params: Record<string, unknown>, signal?: AbortSignal) {
    const timeoutMs = Math.min(typeof params.timeout_ms === "number" ? params.timeout_ms : 10_000, 60_000);
    const startUrl = this.doc.location?.href;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (signal?.aborted) throw fatal("Run was cancelled");
      await sleep(150, signal);
      if (this.doc.location?.href !== startUrl) {
        return { from: startUrl, to: this.doc.location?.href };
      }
    }

    throw retryable(`Page did not navigate away from ${startUrl} within ${timeoutMs}ms`);
  }

  private assertText(params: Record<string, unknown>) {
    const expected = String(params.text ?? "");
    if (!expected) throw fatal("assert_text needs text to look for");

    const haystack = getVisibleText(this.doc, this.maxTextChars).toLowerCase();
    const found = haystack.includes(expected.toLowerCase());
    if (!found) throw fatal(`Page does not contain "${expected}"`);

    return { asserted: expected };
  }

  // ── READING ──────────────────────────────────────────────

  private async extractText(target: ElementTarget | undefined, signal?: AbortSignal) {
    if (!target) return getVisibleText(this.doc, this.maxTextChars);
    const element = await this.require(target, "extract_text", signal);
    return (element.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  private extractTable(params: Record<string, unknown>) {
    const tables = extractTables(this.doc);
    if (!tables.length) throw fatal("No tables found on this page");

    const index = typeof params.index === "number" ? params.index : 0;
    const table = tables[index];
    if (!table) throw fatal(`Table index ${index} is out of range (${tables.length} found)`);

    // Records rather than raw rows: this is what export and integrations want,
    // and it keeps header alignment out of every downstream consumer.
    return { headers: table.headers, rows: tableToRecords(table), row_count: table.row_count };
  }

  private async screenshot() {
    if (!this.host.screenshot) throw fatal("Screenshots are not available in this environment");
    return this.host.screenshot();
  }

  // ── FORMS ────────────────────────────────────────────────

  private async fillForm(params: Record<string, unknown>) {
    const values = params.values;
    if (!values || typeof values !== "object") throw fatal("fill_form needs a values object");

    const fields = detectFormFields(this.doc);
    const filled: string[] = [];
    const missed: string[] = [];

    for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
      const needle = name.toLowerCase();
      const field = fields.find(
        (f) =>
          f.name?.toLowerCase() === needle ||
          f.id?.toLowerCase() === needle ||
          f.label?.toLowerCase().includes(needle) ||
          f.semantic_type === needle
      );

      if (!field) {
        missed.push(name);
        continue;
      }

      const element = this.doc.querySelector<HTMLElement>(field.element_selector);
      if (!element) {
        missed.push(name);
        continue;
      }

      this.setValue(element, String(value ?? ""), true);
      filled.push(name);
    }

    if (!filled.length) {
      throw fatal(`None of the requested fields were found: ${missed.join(", ")}`);
    }

    return { filled, missed };
  }

  private async doSmartPaste(params: Record<string, unknown>) {
    let text = typeof params.text === "string" ? params.text : "";
    if (!text && this.host.readClipboard) text = await this.host.readClipboard();
    if (!text) throw fatal("smart_paste has no text to work from");

    const context = buildPageContext(this.doc, this.maxTextChars);
    if (!context.detected_forms.length) throw fatal("No form fields detected on this page");

    const parsed = this.smartPaste.parse({
      clipboard_text: text,
      page_context: context,
      session_id: String(params.session_id ?? "local"),
    });

    const applied: string[] = [];
    for (const mapping of parsed.mappings) {
      const element = this.doc.querySelector<HTMLElement>(mapping.field.element_selector);
      if (!element) continue;
      this.setValue(element, mapping.value, true);
      applied.push(mapping.field.element_selector);
    }

    return {
      applied: applied.length,
      confidence: parsed.confidence,
      layers: parsed.parsing_layers_used,
      unmapped: parsed.unmapped_data,
    };
  }

  // ── FILES ────────────────────────────────────────────────

  private async uploadFile(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    if (!this.host.resolveFile) throw fatal("File uploads are not available in this environment");

    const fileId = params.file_id;
    if (typeof fileId !== "string" || !fileId) throw fatal("upload_file needs a file_id");

    const element = target
      ? await this.require(target, "upload_file", signal)
      : this.doc.querySelector<HTMLInputElement>("input[type=file]");

    const view = this.window();
    if (!(element instanceof view.HTMLInputElement) || element.type !== "file") {
      throw fatal("upload_file needs a file input as its target");
    }

    const file = await this.host.resolveFile(fileId);

    // A file input's `files` is read-only; DataTransfer is the supported way
    // to populate it programmatically.
    const transfer = new view.DataTransfer();
    transfer.items.add(file);
    element.files = transfer.files;

    this.fire(element, "input");
    this.fire(element, "change");

    return { uploaded: file.name, size: file.size };
  }

  private async downloadFile(
    target: ElementTarget | undefined,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    if (!this.host.downloadFile) throw fatal("Downloads are not available in this environment");

    let url = typeof params.url === "string" ? params.url : "";
    if (!url && target) {
      const element = await this.require(target, "download_file", signal);
      url =
        element.getAttribute("href") ??
        element.getAttribute("src") ??
        element.getAttribute("data-href") ??
        "";
    }
    if (!url) throw fatal("download_file needs a url or a target with an href");

    const absolute = this.requireHttpUrl(url, "download_file");
    const filename = typeof params.filename === "string" ? params.filename : undefined;

    return this.host.downloadFile(absolute, filename);
  }

  // ── AI / OUTPUT ──────────────────────────────────────────

  private resolveContent(params: Record<string, unknown>): string {
    if (typeof params.content === "string" && params.content) return params.content;
    if (typeof params.text === "string" && params.text) return params.text;
    return getVisibleText(this.doc, this.maxTextChars);
  }

  private async delegateAI(action: BrowserActionType, params: Record<string, unknown>) {
    if (!this.host.runAI) {
      throw fatal(`"${action}" needs an AI backend, which is not configured here`);
    }
    return this.host.runAI(action, params);
  }

  private async exportData(params: Record<string, unknown>) {
    const format = String(params.format ?? "csv").toLowerCase();
    const rows = toRows(params.rows ?? params.data ?? params.source);
    if (!rows.length) throw fatal("There is nothing to export");

    const filename = typeof params.filename === "string" ? params.filename : "taskpilot-export";

    // Binary formats need an encoder that doesn't belong in a content script.
    if (format === "excel" || format === "pdf") {
      if (!this.host.saveExport) {
        throw fatal(`"${format}" export requires the TaskPilot export service`);
      }
      return this.host.saveExport({
        filename,
        contentType: format === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
        format,
        rows,
      });
    }

    if (format !== "csv" && format !== "json" && format !== "markdown") {
      throw fatal(`Unsupported export format: ${format}`);
    }

    const serialised = serialiseExport(format, rows, { filename });

    if (this.host.saveExport) {
      return this.host.saveExport({ ...serialised, format, rows });
    }

    return {
      filename: serialised.filename,
      content_type: serialised.contentType,
      content: serialised.content,
      row_count: rows.length,
    };
  }

  private async pushIntegration(params: Record<string, unknown>) {
    if (!this.host.pushIntegration) throw fatal("No integration bridge is configured");
    const provider = String(params.provider ?? "");
    if (!provider) throw fatal("push_integration needs a provider");
    return this.host.pushIntegration(provider, params.records ?? params.data ?? params.rows);
  }

  private async notify(params: Record<string, unknown>) {
    const message = String(params.message ?? "");
    if (!message) throw fatal("notify needs a message");
    await this.host.notify?.(message, String(params.level ?? "info"));
    return { notified: message };
  }

  // ── DOM HELPERS ──────────────────────────────────────────

  private window(): Window & typeof globalThis {
    const view = this.doc.defaultView;
    if (!view) throw fatal("No window is associated with this document");
    return view as Window & typeof globalThis;
  }

  /**
   * Writes a value the way a user would, so framework-controlled inputs
   * notice. React overrides the `value` property on the element instance and
   * tracks the last value it wrote; assigning `el.value` directly updates the
   * DOM but leaves React's copy stale, and the change is discarded on the
   * next render. Going through the prototype setter is what makes it stick.
   */
  private setValue(element: HTMLElement, value: string, append = false): void {
    const view = this.window();

    if (element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement) {
      const next = append ? `${element.value}${value}` : value;
      const prototype =
        element instanceof view.HTMLInputElement
          ? view.HTMLInputElement.prototype
          : view.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

      if (setter) setter.call(element, next);
      else element.value = next;

      this.fire(element, "input");
      this.fire(element, "change");
      return;
    }

    // Check the attribute as well as the property: `isContentEditable` is
    // absent in some non-browser DOM implementations, and inheriting the
    // attribute from an ancestor still makes this element editable.
    if (element.isContentEditable || element.closest("[contenteditable]:not([contenteditable='false'])")) {
      element.textContent = append ? `${element.textContent ?? ""}${value}` : value;
      this.fire(element, "input");
      return;
    }

    throw fatal("Target is not a text input, textarea or contenteditable element");
  }

  private fire(element: HTMLElement, type: string, bubbles = true): void {
    element.dispatchEvent(new (this.window().Event)(type, { bubbles, cancelable: true }));
  }

  private requireHttpUrl(value: unknown, action: string): string {
    if (typeof value !== "string" || !value) throw fatal(`${action} needs a url`);

    let parsed: URL;
    try {
      parsed = new URL(value, this.doc.location?.href);
    } catch {
      throw fatal(`${action} received an unparseable url`);
    }

    // Blocking non-http schemes here is what stops a plan from turning
    // `navigate` into script execution on the current origin.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw fatal(`${action} refuses the "${parsed.protocol}" scheme`);
    }

    return parsed.toString();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
