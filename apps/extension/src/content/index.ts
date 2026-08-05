// ============================================================
// TASKPILOT — CONTENT SCRIPT
// apps/extension/src/content/index.ts
//
// Runs in the page. Owns the ActionExecutor (the only code that touches the
// user's DOM), the command palette, and the injected sidebar.
//
// All UI is rendered inside a closed shadow root so the host page cannot
// style it, read it, or trick the user with a lookalike overlay.
// ============================================================

import { ActionExecutor, buildPageContext, type HostBridge } from "@taskpilot/browser-tools";
import type { ActionResult, PageContext } from "@taskpilot/shared";

import { failure, reply, type ContentMessage, type Reply } from "../shared/messages";

// Guard against double injection: the background worker injects on demand,
// and the manifest also declares this script for normal page loads.
declare global {
  interface Window {
    __taskpilotContentLoaded?: boolean;
  }
}

if (window.__taskpilotContentLoaded) {
  // Already attached — do nothing rather than register duplicate listeners.
} else {
  window.__taskpilotContentLoaded = true;
  init();
}

// ─── STATE ───────────────────────────────────────────────────

let executor: ActionExecutor | null = null;
let overlayRoot: ShadowRoot | null = null;
let paletteOpen = false;

function getExecutor(): ActionExecutor {
  if (!executor) {
    const host: HostBridge = {
      // Clipboard reads need a user gesture in some contexts; failing here is
      // recoverable, so it returns empty rather than throwing.
      readClipboard: async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return "";
        }
      },
      notify: async (message, level) => {
        showToast(message, level as ToastLevel);
      },
    };

    executor = new ActionExecutor({ doc: document, host, defaultTimeoutMs: 8000 });
  }
  return executor;
}

// ─── INIT ────────────────────────────────────────────────────

function init(): void {
  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener("keydown", handleKeydown, true);
}

function handleMessage(
  message: ContentMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: Reply<unknown>) => void
): boolean | void {
  switch (message.type) {
    case "PING":
      sendResponse(reply({ ready: true }));
      return;

    case "READ_CONTEXT":
      sendResponse(reply(readContext()));
      return;

    case "EXECUTE_ACTION":
      // Async: keep the channel open by returning true.
      getExecutor()
        .execute(message.action)
        .then((result: ActionResult) => sendResponse(reply(result)))
        .catch((err) => sendResponse(failure(err)));
      return true;

    case "TOGGLE_SIDEBAR":
      toggleSidebar(message.payload);
      sendResponse(reply({ toggled: true }));
      return;

    case "OPEN_COMMAND_PALETTE":
      togglePalette();
      sendResponse(reply({ open: paletteOpen }));
      return;

    case "HIGHLIGHT":
      highlight(message.selectors);
      sendResponse(reply({ highlighted: message.selectors.length }));
      return;

    case "SHOW_NOTIFICATION":
      showToast(message.message, message.level);
      sendResponse(reply({ shown: true }));
      return;

    case "READ_CLIPBOARD":
      navigator.clipboard
        .readText()
        .then((text) => sendResponse(reply({ text })))
        .catch((err) => sendResponse(failure(err)));
      return true;

    default:
      sendResponse(failure("Unknown message"));
      return;
  }
}

function readContext(): PageContext {
  return buildPageContext(document, 20_000);
}

// ─── KEYBOARD ────────────────────────────────────────────────

function handleKeydown(event: KeyboardEvent): void {
  // Alt+K opens the palette. Chrome commands cover this too, but a page that
  // swallows the command still leaves this path working.
  if (event.altKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    event.stopPropagation();
    togglePalette();
    return;
  }

  if (event.key === "Escape" && paletteOpen) {
    closePalette();
  }
}

// ─── OVERLAY HOST ────────────────────────────────────────────

/**
 * One closed shadow root hosts everything TaskPilot renders. Closed mode
 * means the page cannot reach into it via `element.shadowRoot`.
 */
function getOverlayRoot(): ShadowRoot {
  if (overlayRoot) return overlayRoot;

  const host = document.createElement("div");
  host.id = "taskpilot-overlay-host";
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";

  overlayRoot = host.attachShadow({ mode: "closed" });
  overlayRoot.appendChild(buildStyles());
  document.documentElement.appendChild(host);

  return overlayRoot;
}

function buildStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

    .tp-backdrop {
      position: fixed; inset: 0; background: rgba(8, 10, 20, 0.45);
      backdrop-filter: blur(2px); display: flex; align-items: flex-start;
      justify-content: center; padding-top: 14vh; z-index: 1;
    }
    .tp-palette {
      width: min(620px, 92vw); background: #14161f; color: #f4f5f8;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55); overflow: hidden;
    }
    .tp-palette-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08); }
    .tp-logo { width: 22px; height: 22px; border-radius: 6px; flex: none;
      background: linear-gradient(135deg, #6366f1, #a855f7); display: flex;
      align-items: center; justify-content: center; font-size: 12px; color: #fff; font-weight: 700; }
    .tp-input { flex: 1; background: transparent; border: none; outline: none;
      color: #f4f5f8; font-size: 15px; }
    .tp-input::placeholder { color: rgba(244,245,248,0.4); }
    .tp-hint { font-size: 11px; color: rgba(244,245,248,0.35); white-space: nowrap; }

    .tp-suggestions { max-height: 320px; overflow-y: auto; padding: 6px; }
    .tp-suggestion { display: flex; align-items: center; gap: 10px; padding: 9px 11px;
      border-radius: 9px; cursor: pointer; font-size: 13.5px; color: rgba(244,245,248,0.85); }
    .tp-suggestion:hover, .tp-suggestion[data-active="true"] { background: rgba(99,102,241,0.16); color: #fff; }
    .tp-suggestion-icon { width: 20px; text-align: center; opacity: 0.75; }

    .tp-status { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 12.5px; color: rgba(244,245,248,0.65); display: flex; align-items: center; gap: 8px; }
    .tp-spinner { width: 12px; height: 12px; border: 2px solid rgba(99,102,241,0.3);
      border-top-color: #6366f1; border-radius: 50%; animation: tp-spin 0.7s linear infinite; }
    @keyframes tp-spin { to { transform: rotate(360deg); } }

    .tp-toast-stack { position: fixed; bottom: 22px; right: 22px; display: flex;
      flex-direction: column; gap: 8px; z-index: 2; }
    .tp-toast { padding: 11px 15px; border-radius: 10px; font-size: 13.5px; color: #fff;
      background: #1c1f2b; border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 34px rgba(0,0,0,0.4); max-width: 340px;
      animation: tp-slide 180ms ease-out; }
    .tp-toast[data-level="success"] { border-left: 3px solid #22c55e; }
    .tp-toast[data-level="error"]   { border-left: 3px solid #ef4444; }
    .tp-toast[data-level="warning"] { border-left: 3px solid #f59e0b; }
    .tp-toast[data-level="info"]    { border-left: 3px solid #6366f1; }
    @keyframes tp-slide { from { opacity: 0; transform: translateX(16px); } }

    .tp-sidebar { position: fixed; top: 0; right: 0; width: 390px; height: 100vh;
      border: none; border-left: 1px solid rgba(255,255,255,0.1);
      box-shadow: -8px 0 40px rgba(0,0,0,0.3); transform: translateX(100%);
      transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1); background: #14161f; }
    .tp-sidebar[data-open="true"] { transform: translateX(0); }

    .tp-highlight { outline: 2px solid #6366f1 !important;
      outline-offset: 2px !important; transition: outline 120ms; }
  `;
  return style;
}

// ─── COMMAND PALETTE ─────────────────────────────────────────

interface Suggestion {
  icon: string;
  label: string;
  goal: string;
}

const SUGGESTIONS: Suggestion[] = [
  { icon: "S", label: "Summarize this page", goal: "Summarize this page" },
  { icon: "@", label: "Extract every email address", goal: "Extract all the email addresses on this page" },
  { icon: "#", label: "Extract the table to CSV", goal: "Extract the table on this page and export it as CSV" },
  { icon: "$", label: "Extract all prices", goal: "Extract all the prices on this page" },
  { icon: "T", label: "Translate to English", goal: "Translate this page to English" },
  { icon: "R", label: "Draft a reply", goal: "Write a professional reply to this message" },
  { icon: "V", label: "Smart paste into this form", goal: "Smart paste the clipboard into this form" },
  { icon: "C", label: "Extract contacts", goal: "Extract all the contacts on this page" },
];

let paletteElements: {
  backdrop: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
  status: HTMLElement;
} | null = null;

function togglePalette(): void {
  if (paletteOpen) closePalette();
  else openPalette();
}

function openPalette(): void {
  const root = getOverlayRoot();

  if (!paletteElements) {
    const backdrop = document.createElement("div");
    backdrop.className = "tp-backdrop";

    const palette = document.createElement("div");
    palette.className = "tp-palette";

    const header = document.createElement("div");
    header.className = "tp-palette-header";
    header.innerHTML = `<div class="tp-logo">T</div>`;

    const input = document.createElement("input");
    input.className = "tp-input";
    input.placeholder = "Tell TaskPilot what to do on this page...";
    input.autocomplete = "off";
    input.spellcheck = false;

    const hint = document.createElement("div");
    hint.className = "tp-hint";
    hint.textContent = "Enter to run - Esc to close";

    header.append(input, hint);

    const list = document.createElement("div");
    list.className = "tp-suggestions";

    const status = document.createElement("div");
    status.className = "tp-status";
    status.style.display = "none";

    palette.append(header, list, status);
    backdrop.appendChild(palette);
    root.appendChild(backdrop);

    // Clicking the backdrop closes; clicking the panel must not.
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closePalette();
    });
    palette.addEventListener("click", (event) => event.stopPropagation());

    input.addEventListener("input", () => renderSuggestions(input.value));
    input.addEventListener("keydown", handlePaletteKeys);

    paletteElements = { backdrop, input, list, status };
  }

  paletteElements.backdrop.style.display = "flex";
  paletteElements.input.value = "";
  paletteElements.status.style.display = "none";
  renderSuggestions("");
  paletteOpen = true;

  // Focus after the element is laid out, or the caret lands nowhere.
  requestAnimationFrame(() => paletteElements?.input.focus());
}

function closePalette(): void {
  if (paletteElements) paletteElements.backdrop.style.display = "none";
  paletteOpen = false;
}

function renderSuggestions(query: string): void {
  if (!paletteElements) return;

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(needle) || s.goal.toLowerCase().includes(needle))
    : SUGGESTIONS;

  paletteElements.list.replaceChildren();

  // Whatever the user typed is always the first, highlighted option — the
  // palette is a command line, not a menu.
  if (needle) {
    paletteElements.list.appendChild(
      buildSuggestionRow({ icon: ">", label: `Run: "${query.trim()}"`, goal: query.trim() }, true)
    );
  }

  matches.slice(0, needle ? 4 : 8).forEach((suggestion, index) => {
    paletteElements!.list.appendChild(buildSuggestionRow(suggestion, !needle && index === 0));
  });
}

function buildSuggestionRow(suggestion: Suggestion, active: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "tp-suggestion";
  row.dataset.active = String(active);
  row.dataset.goal = suggestion.goal;

  const icon = document.createElement("span");
  icon.className = "tp-suggestion-icon";
  icon.textContent = suggestion.icon;

  const label = document.createElement("span");
  // textContent, never innerHTML: `label` can contain the user's own typing.
  label.textContent = suggestion.label;

  row.append(icon, label);
  row.addEventListener("click", () => void runGoal(suggestion.goal));
  row.addEventListener("mouseenter", () => setActiveRow(row));

  return row;
}

function setActiveRow(target: HTMLElement): void {
  paletteElements?.list.querySelectorAll<HTMLElement>(".tp-suggestion").forEach((row) => {
    row.dataset.active = String(row === target);
  });
}

function handlePaletteKeys(event: KeyboardEvent): void {
  if (!paletteElements) return;

  const rows = [...paletteElements.list.querySelectorAll<HTMLElement>(".tp-suggestion")];
  const activeIndex = rows.findIndex((row) => row.dataset.active === "true");

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!rows.length) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = (activeIndex + delta + rows.length) % rows.length;
    setActiveRow(rows[next]);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const goal = rows[activeIndex]?.dataset.goal ?? paletteElements.input.value.trim();
    if (goal) void runGoal(goal);
  }
}

async function runGoal(goal: string): Promise<void> {
  if (!paletteElements) return;

  paletteElements.status.style.display = "flex";
  paletteElements.status.replaceChildren();

  const spinner = document.createElement("div");
  spinner.className = "tp-spinner";
  const label = document.createElement("span");
  label.textContent = `Planning: ${goal}`;
  paletteElements.status.append(spinner, label);

  try {
    const response = await chrome.runtime.sendMessage({ type: "RUN_GOAL", goal });

    if (!response?.ok) {
      label.textContent = response?.error ?? "TaskPilot could not start that task";
      spinner.remove();
      showToast(response?.error ?? "Could not start the task", "error");
      return;
    }

    closePalette();
    showToast(`Running: ${goal}`, "info");
  } catch (err) {
    spinner.remove();
    label.textContent = err instanceof Error ? err.message : "Something went wrong";
  }
}

// ─── SIDEBAR ─────────────────────────────────────────────────

let sidebarFrame: HTMLIFrameElement | null = null;

function toggleSidebar(payload?: { initial_action?: string; selected_text?: string }): void {
  const root = getOverlayRoot();

  if (!sidebarFrame) {
    sidebarFrame = document.createElement("iframe");
    sidebarFrame.className = "tp-sidebar";
    sidebarFrame.src = chrome.runtime.getURL("sidebar.html");
    root.appendChild(sidebarFrame);

    // Reveal on the next frame so the CSS transition has a start state.
    requestAnimationFrame(() => {
      sidebarFrame!.dataset.open = "true";
    });
  } else {
    sidebarFrame.dataset.open = sidebarFrame.dataset.open === "true" ? "false" : "true";
  }

  if (payload && sidebarFrame.dataset.open === "true") {
    // Target the extension origin explicitly rather than "*", so the message
    // cannot be read by a frame from the host page.
    sidebarFrame.addEventListener(
      "load",
      () => {
        sidebarFrame?.contentWindow?.postMessage(
          { type: "INITIAL_ACTION", payload },
          new URL(chrome.runtime.getURL("sidebar.html")).origin
        );
      },
      { once: true }
    );
  }
}

// ─── TOASTS + HIGHLIGHTS ─────────────────────────────────────

type ToastLevel = "info" | "success" | "warning" | "error";

let toastStack: HTMLElement | null = null;

function showToast(message: string, level: ToastLevel = "info"): void {
  const root = getOverlayRoot();

  if (!toastStack) {
    toastStack = document.createElement("div");
    toastStack.className = "tp-toast-stack";
    root.appendChild(toastStack);
  }

  const toast = document.createElement("div");
  toast.className = "tp-toast";
  toast.dataset.level = level;
  toast.textContent = message;

  toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), level === "error" ? 6000 : 3500);
}

function highlight(selectors: string[]): void {
  document
    .querySelectorAll(".tp-highlight")
    .forEach((el) => el.classList.remove("tp-highlight"));

  for (const selector of selectors.slice(0, 50)) {
    try {
      document.querySelectorAll(selector).forEach((el) => el.classList.add("tp-highlight"));
    } catch {
      // An invalid selector is a miss, not a crash.
    }
  }

  setTimeout(() => {
    document.querySelectorAll(".tp-highlight").forEach((el) => el.classList.remove("tp-highlight"));
  }, 2600);
}
