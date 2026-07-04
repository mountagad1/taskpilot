// ============================================================
// TASKPILOT — CONTENT SCRIPT
// apps/extension/src/content/index.ts
// Injects sidebar, handles Smart Paste, DOM interaction
// ============================================================

import { detectFormFields } from "@taskpilot/browser-tools/smart-paste";
import type { PageContext, FormField, TableData, PageType } from "@taskpilot/shared/types";

// ─── STATE ───────────────────────────────────────────────────

let sidebarInjected = false;
let sidebarVisible = false;
let sidebarFrame: HTMLIFrameElement | null = null;

// ─── INIT ────────────────────────────────────────────────────

function init() {
  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Context menu support
  document.addEventListener("mouseup", handleTextSelection);
  
  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeydown);
  
  // Auto-detect page type for proactive suggestions
  requestIdleCallback(analyzePageContext);
}

// ─── MESSAGE HANDLER ─────────────────────────────────────────

function handleMessage(
  message: { type: string; payload?: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    case "TOGGLE_SIDEBAR":
      toggleSidebar(message.payload as SidebarInitialAction | undefined);
      sendResponse({ success: true });
      return;

    case "SMART_PASTE":
      handleSmartPaste(message.payload as string).then(sendResponse);
      return true; // async response

    case "GET_PAGE_CONTEXT":
      sendResponse(buildPageContext());
      return;

    case "AUTOFILL_FIELDS":
      autofillFields(message.payload as Array<{ selector: string; value: string }>);
      sendResponse({ success: true });
      return;

    case "EXTRACT_CONTENT":
      sendResponse({
        text: getVisibleText(),
        forms: detectFormFields(document),
        tables: extractTables(),
      });
      return;

    case "EXECUTE_ACTION":
      executeAction(message.payload as { action: string; params: unknown })
        .then(sendResponse);
      return true;

    case "SHOW_NOTIFICATION":
      showTaskPilotNotification(message.payload as { message: string; type: string });
      sendResponse({ success: true });
      return;

    case "HIGHLIGHT_FIELDS":
      highlightFormFields(message.payload as string[]);
      sendResponse({ success: true });
      return;

    default:
      return;
  }
}

// ─── SIDEBAR ─────────────────────────────────────────────────

interface SidebarInitialAction {
  initial_action?: string;
  selected_text?: string;
  user_input?: string;
}

function toggleSidebar(initialAction?: SidebarInitialAction) {
  if (!sidebarInjected) {
    injectSidebar(initialAction);
  } else {
    sidebarVisible = !sidebarVisible;
    if (sidebarFrame) {
      sidebarFrame.style.transform = sidebarVisible
        ? "translateX(0)"
        : "translateX(100%)";
    }
    if (initialAction) {
      sidebarFrame?.contentWindow?.postMessage(
        { type: "INITIAL_ACTION", payload: initialAction },
        chrome.runtime.getURL("sidebar.html")
      );
    }
  }
}

function injectSidebar(initialAction?: SidebarInitialAction) {
  // Create container
  const container = document.createElement("div");
  container.id = "taskpilot-sidebar-container";
  container.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 380px;
    height: 100vh;
    z-index: 2147483647;
    pointer-events: none;
    font-family: inherit;
  `;

  // Create shadow root for style isolation
  const shadow = container.attachShadow({ mode: "closed" });

  // Inject sidebar iframe
  sidebarFrame = document.createElement("iframe");
  sidebarFrame.src = chrome.runtime.getURL("sidebar.html");
  sidebarFrame.style.cssText = `
    width: 380px;
    height: 100vh;
    border: none;
    border-left: 1px solid rgba(255,255,255,0.1);
    box-shadow: -8px 0 40px rgba(0,0,0,0.3);
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: all;
    background: transparent;
    border-radius: 12px 0 0 12px;
  `;

  shadow.appendChild(sidebarFrame);
  document.body.appendChild(container);
  
  sidebarInjected = true;

  // Show after mount
  setTimeout(() => {
    if (sidebarFrame) {
      sidebarFrame.style.transform = "translateX(0)";
      sidebarVisible = true;
    }
  }, 50);

  // Pass page context (and optionally an initial action) to the sidebar
  sidebarFrame.addEventListener("load", () => {
    sidebarFrame?.contentWindow?.postMessage(
      { type: "PAGE_CONTEXT", payload: buildPageContext() },
      chrome.runtime.getURL("sidebar.html")
    );
    if (initialAction) {
      sidebarFrame?.contentWindow?.postMessage(
        { type: "INITIAL_ACTION", payload: initialAction },
        chrome.runtime.getURL("sidebar.html")
      );
    }
  });
}

// ─── SMART PASTE ─────────────────────────────────────────────

async function handleSmartPaste(clipboardText?: string): Promise<{
  success: boolean;
  mappings_count: number;
  confidence: number;
}> {
  try {
    // Read clipboard if not provided
    const text = clipboardText || (await navigator.clipboard.readText());
    if (!text.trim()) {
      showTaskPilotNotification({
        message: "Clipboard is empty",
        type: "warning",
      });
      return { success: false, mappings_count: 0, confidence: 0 };
    }

    // Show loading state on fields
    const fields = detectFormFields(document);
    if (fields.length === 0) {
      showTaskPilotNotification({
        message: "No form fields detected on this page",
        type: "info",
      });
      return { success: false, mappings_count: 0, confidence: 0 };
    }

    // Call background for AI processing
    const result = await chrome.runtime.sendMessage({
      type: "PROCESS_SMART_PASTE",
      payload: {
        clipboard_text: text,
        page_context: buildPageContext(),
      },
    });

    if (result.mappings && result.mappings.length > 0) {
      // Animate fill
      await animatedAutofill(result.mappings);
      
      showTaskPilotNotification({
        message: `✓ Filled ${result.mappings.length} fields (${Math.round(result.confidence * 100)}% confidence)`,
        type: "success",
      });

      return {
        success: true,
        mappings_count: result.mappings.length,
        confidence: result.confidence,
      };
    }

    showTaskPilotNotification({
      message: "Couldn't map clipboard data to form fields",
      type: "warning",
    });
    return { success: false, mappings_count: 0, confidence: 0 };
  } catch (err) {
    console.error("[TaskPilot] Smart Paste error:", err);
    return { success: false, mappings_count: 0, confidence: 0 };
  }
}

// ─── ANIMATED AUTOFILL ───────────────────────────────────────

async function animatedAutofill(
  mappings: Array<{ field: { element_selector: string }; value: string; confidence: number }>
) {
  for (const mapping of mappings) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      mapping.field.element_selector
    );
    if (!el) continue;

    // Highlight field
    const originalOutline = el.style.outline;
    const originalTransition = el.style.transition;
    el.style.transition = "all 0.2s ease";
    el.style.outline = "2px solid rgba(99, 102, 241, 0.8)";
    el.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.15)";

    // Simulate typing effect
    await typeValue(el, mapping.value);

    // Flash success
    el.style.outline = "2px solid rgba(16, 185, 129, 0.8)";
    el.style.boxShadow = "0 0 0 4px rgba(16, 185, 129, 0.15)";

    await sleep(300);

    // Restore
    el.style.outline = originalOutline;
    el.style.boxShadow = "";
    el.style.transition = originalTransition;
  }
}

async function typeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  if (el.tagName === "SELECT") {
    (el as HTMLSelectElement).value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // Use React/Vue compatible value setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }

  // Dispatch events for React/Vue/Angular compatibility
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
}

// ─── AUTOFILL FIELDS ─────────────────────────────────────────

function autofillFields(
  mappings: Array<{ selector: string; value: string }>
) {
  mappings.forEach(({ selector, value }) => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) typeValue(el, value);
  });
}

// ─── PAGE CONTEXT BUILDER ────────────────────────────────────

function buildPageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    visible_text: getVisibleText(),
    meta_description: getMetaDescription(),
    selected_text: window.getSelection()?.toString() || undefined,
    detected_forms: detectFormFields(document),
    detected_tables: extractTables(),
    page_type: detectPageType(),
    domain: window.location.hostname,
  };
}

function getVisibleText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  
  // Remove script, style, hidden elements
  const toRemove = clone.querySelectorAll(
    "script, style, noscript, [hidden], [aria-hidden='true'], .sr-only"
  );
  toRemove.forEach((el) => el.remove());
  
  return (clone.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

function getMetaDescription(): string | undefined {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ||
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
  );
}

function extractTables(): TableData[] {
  const tables: TableData[] = [];
  
  document.querySelectorAll("table").forEach((table, index) => {
    const headerRow = table.querySelector("thead tr");
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll("th, td")).map(
          (th) => th.textContent?.trim() || ""
        )
      : [];
    
    const rows: string[][] = [];
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td, th")).map(
        (td) => td.textContent?.trim() || ""
      );
      if (cells.some((c) => c)) rows.push(cells);
    });

    if (rows.length > 0) {
      tables.push({
        headers,
        rows: rows.slice(0, 100), // max 100 rows
        row_count: rows.length,
        element_selector: `table:nth-of-type(${index + 1})`,
      });
    }
  });

  return tables.slice(0, 5); // max 5 tables
}

function detectPageType(): PageType {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();

  if (url.includes("hubspot") || url.includes("salesforce") || url.includes("crm")) return "crm";
  if (url.includes("gmail") || url.includes("outlook") || url.includes("mail")) return "email";
  if (url.includes("linkedin") || url.includes("twitter") || url.includes("x.com")) return "social";
  if (url.includes("shopify") || url.includes("amazon") || url.includes("shop")) return "ecommerce";
  if (document.querySelectorAll("form input").length > 3) return "form";
  if (document.querySelectorAll("article, .article, .post").length > 0) return "article";
  if (url.includes("docs") || url.includes("wiki")) return "documentation";
  return "generic";
}

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────

function handleKeydown(e: KeyboardEvent) {
  // Alt+V = Smart Paste
  if (e.altKey && e.key === "v") {
    e.preventDefault();
    handleSmartPaste();
  }
  // Alt+S = Toggle Sidebar
  if (e.altKey && e.key === "s") {
    e.preventDefault();
    toggleSidebar();
  }
  // Escape = Close Sidebar
  if (e.key === "Escape" && sidebarVisible) {
    toggleSidebar();
  }
}

// ─── TEXT SELECTION (context menu trigger) ───────────────────

function handleTextSelection() {
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 20) {
    chrome.runtime.sendMessage({
      type: "TEXT_SELECTED",
      payload: { text: selection, url: window.location.href },
    });
  }
}

// ─── FIELD HIGHLIGHTS ────────────────────────────────────────

function highlightFormFields(selectors: string[]) {
  selectors.forEach((selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.style.outline = "2px solid rgba(99, 102, 241, 0.6)";
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

// ─── PAGE ANALYSIS ───────────────────────────────────────────

function analyzePageContext() {
  const forms = detectFormFields(document);
  const tables = extractTables();
  const pageType = detectPageType();

  chrome.runtime.sendMessage({
    type: "PAGE_ANALYZED",
    payload: {
      url: window.location.href,
      page_type: pageType,
      has_forms: forms.length > 0,
      form_count: forms.length,
      has_tables: tables.length > 0,
      table_count: tables.length,
    },
  }).catch(() => {
    // Background may not be ready yet, ignore
  });
}

// ─── NOTIFICATION SYSTEM ─────────────────────────────────────

function showTaskPilotNotification(opts: { message: string; type: string }) {
  // Remove existing
  document.querySelector("#taskpilot-notification")?.remove();

  const colors = {
    success: { bg: "#10b981", icon: "✓" },
    warning: { bg: "#f59e0b", icon: "⚠" },
    error: { bg: "#ef4444", icon: "✕" },
    info: { bg: "#6366f1", icon: "ℹ" },
  };

  const config = colors[opts.type as keyof typeof colors] || colors.info;

  const notification = document.createElement("div");
  notification.id = "taskpilot-notification";
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.1);
    border-left: 3px solid ${config.bg};
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: taskpilot-slide-in 0.2s ease;
    max-width: 320px;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes taskpilot-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  notification.appendChild(style);

  const icon = document.createElement("span");
  icon.style.cssText = `background: ${config.bg}; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0;`;
  icon.textContent = config.icon;

  const text = document.createElement("span");
  text.textContent = opts.message;

  notification.appendChild(icon);
  notification.appendChild(text);
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(100%)";
    notification.style.transition = "all 0.2s ease";
    setTimeout(() => notification.remove(), 200);
  }, 3000);
}

// ─── BROWSER ACTIONS ─────────────────────────────────────────

async function executeAction(payload: {
  action: string;
  params: unknown;
}): Promise<{ success: boolean; result?: unknown }> {
  const params = payload.params as Record<string, unknown>;
  
  switch (payload.action) {
    case "click": {
      const el = document.querySelector<HTMLElement>(params.selector as string);
      if (el) { el.click(); return { success: true }; }
      return { success: false };
    }

    case "type": {
      const el = document.querySelector<HTMLInputElement>(params.selector as string);
      if (el) {
        await typeValue(el, params.text as string);
        return { success: true };
      }
      return { success: false };
    }

    case "scroll": {
      window.scrollBy({
        top: (params.y as number) || 300,
        behavior: "smooth",
      });
      return { success: true };
    }

    case "extract_text": {
      return { success: true, result: getVisibleText() };
    }

    case "extract_emails": {
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const emails = [...new Set(document.body.innerText.match(emailRegex) || [])];
      return { success: true, result: emails };
    }

    case "extract_prices": {
      const priceRegex = /[$€£¥]\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*[$€£¥]/g;
      const prices = [...new Set(document.body.innerText.match(priceRegex) || [])];
      return { success: true, result: prices };
    }

    case "wait_for_element": {
      const found = await waitForElement(params.selector as string, params.timeout as number);
      return { success: found };
    }

    default:
      return { success: false, result: "Unknown action" };
  }
}

function waitForElement(selector: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) return resolve(true);

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
  });
}

// ─── UTILITIES ───────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── BOOTSTRAP ───────────────────────────────────────────────

init();
