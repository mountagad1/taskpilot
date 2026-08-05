// ============================================================
// TASKPILOT EXTENSION — MESSAGE CONTRACT
// apps/extension/src/shared/messages.ts
//
// One typed union for every message crossing a boundary (popup/sidebar →
// background → content script). Chrome's messaging API is untyped, so this
// is the only thing keeping the three contexts in agreement.
// ============================================================

import type {
  ActionPlan,
  ActionResult,
  BrowserAction,
  PageContext,
  PlanStep,
  RunStatus,
} from "@taskpilot/shared";

// ─── UI → BACKGROUND ─────────────────────────────────────────

export type UiMessage =
  | { type: "GET_SESSION" }
  | { type: "CLEAR_SESSION" }
  | { type: "GET_PAGE_CONTEXT"; tabId?: number }
  /** Natural-language command from the command bar. */
  | { type: "RUN_GOAL"; goal: string; tabId?: number }
  /** Run an installed agent against the active tab. */
  | { type: "RUN_AGENT"; agentId: string; inputs?: Record<string, unknown>; tabId?: number }
  | { type: "CANCEL_RUN"; runId: string }
  | { type: "CONFIRM_STEP"; runId: string; approved: boolean }
  | { type: "LIST_AGENTS" }
  | { type: "INSTALL_AGENT"; agentId: string }
  | { type: "BROWSE_MARKETPLACE"; query?: string; category?: string }
  | { type: "GET_RUN_STATE" }
  | { type: "SMART_PASTE"; tabId?: number };

// ─── BACKGROUND → CONTENT ────────────────────────────────────

export type ContentMessage =
  | { type: "PING" }
  | { type: "READ_CONTEXT" }
  | { type: "EXECUTE_ACTION"; action: BrowserAction }
  | { type: "TOGGLE_SIDEBAR"; payload?: { initial_action?: string; selected_text?: string } }
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "HIGHLIGHT"; selectors: string[] }
  | { type: "SHOW_NOTIFICATION"; message: string; level: "info" | "success" | "warning" | "error" }
  | { type: "READ_CLIPBOARD" };

// ─── BACKGROUND → UI (broadcast) ─────────────────────────────

export type RunUpdate =
  | { type: "RUN_STARTED"; runId: string; goal: string; plan: ActionPlan }
  | { type: "RUN_STEP"; runId: string; index: number; step: PlanStep; result?: ActionResult }
  | { type: "RUN_CONFIRM"; runId: string; step: PlanStep }
  | { type: "RUN_LOG"; runId: string; message: string }
  | { type: "RUN_FINISHED"; runId: string; status: RunStatus; output: Record<string, unknown> }
  | { type: "RUN_FAILED"; runId: string; error: string };

// ─── RESPONSES ───────────────────────────────────────────────

export interface SessionState {
  session_id: string;
  user_id?: string;
  email?: string;
  auth_token?: string;
  plan: "free" | "pro" | "enterprise";
  fingerprint: string;
}

export interface RunState {
  runId: string | null;
  status: RunStatus | "idle";
  goal: string;
  plan: ActionPlan | null;
  currentStep: number;
  results: Array<{ index: number; action: string; success: boolean; error?: string }>;
  awaitingConfirmation: PlanStep | null;
  output: Record<string, unknown>;
  error: string | null;
}

/** Every background reply carries this envelope so callers branch once. */
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function reply<T>(data: T): Reply<T> {
  return { ok: true, data };
}

export function failure(error: unknown, code?: string): Reply<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error ?? "Unknown error"),
    code,
  };
}

// ─── TYPED SENDERS ───────────────────────────────────────────

/** Promise wrapper over chrome.runtime.sendMessage that surfaces lastError. */
export function sendToBackground<T>(message: UiMessage): Promise<Reply<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: Reply<T>) => {
      if (chrome.runtime.lastError) {
        resolve(failure(chrome.runtime.lastError.message, "disconnected"));
        return;
      }
      resolve(response ?? failure("No response from the background worker"));
    });
  });
}

/**
 * Sends to a tab's content script. A missing receiver is the normal case on
 * pages loaded before the extension, so it resolves rather than rejecting —
 * the caller decides whether to inject and retry.
 */
export function sendToTab<T>(tabId: number, message: ContentMessage): Promise<Reply<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: Reply<T>) => {
      if (chrome.runtime.lastError) {
        resolve(failure(chrome.runtime.lastError.message, "no_content_script"));
        return;
      }
      resolve(response ?? failure("The page did not respond"));
    });
  });
}

export type { PageContext };
