// ============================================================
// TASKPILOT EXTENSION — MESSAGE SENDER POLICY
// apps/extension/src/background/sender-policy.ts
//
// chrome.runtime.onMessage delivers messages from two very different kinds
// of sender:
//
//   - extension pages (popup, options, sidebar): our own code, served from
//     chrome-extension://<id>/, which the page underneath cannot touch;
//   - content scripts: injected into every website. They run in an isolated
//     world, but they live in the website's renderer process and handle
//     input the website controls, so they are treated as semi-trusted.
//
// A content script may only start a run in its own tab. Everything that
// reads the session, approves a confirmation, cancels a run, installs an
// agent or signs out is reserved for extension pages.
// ============================================================

import type { SessionState, UiMessage } from "../shared/messages";

export type SenderKind = "extension_page" | "content_script" | "untrusted";

/** The subset of chrome.runtime.MessageSender this policy reads. */
export interface SenderInfo {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

/**
 * Classifies a sender. `extensionId` and `extensionOrigin` are passed in
 * (chrome.runtime.id and chrome.runtime.getURL("")) so this stays testable.
 */
export function classifySender(
  sender: SenderInfo,
  extensionId: string,
  extensionOrigin: string
): SenderKind {
  // onMessage only carries our own extension's messages, but checking the
  // id costs nothing and keeps this correct if that ever changes.
  if (sender.id !== extensionId) return "untrusted";
  if (sender.url && sender.url.startsWith(extensionOrigin)) return "extension_page";
  if (sender.tab?.id !== undefined) return "content_script";
  return "untrusted";
}

/** Messages a content script is allowed to send. */
const CONTENT_SCRIPT_MESSAGES: ReadonlySet<UiMessage["type"]> = new Set(["RUN_GOAL"]);

export type PolicyDecision =
  | { allowed: true; message: UiMessage }
  | { allowed: false; reason: string };

/**
 * Decides whether `message` may be handled for this sender, and returns the
 * message to handle. A content script's RUN_GOAL is pinned to the tab the
 * script lives in, whatever tabId it asked for.
 */
export function authorizeMessage(
  message: UiMessage,
  kind: SenderKind,
  senderTabId: number | undefined
): PolicyDecision {
  if (kind === "extension_page") return { allowed: true, message };

  if (kind === "content_script" && CONTENT_SCRIPT_MESSAGES.has(message.type)) {
    if (senderTabId === undefined) return { allowed: false, reason: "No sender tab" };
    return { allowed: true, message: { ...message, tabId: senderTabId } as UiMessage };
  }

  return { allowed: false, reason: `"${message?.type}" is not allowed from this context` };
}

/** What UI pages receive for GET_SESSION: everything except the credential. */
export type PublicSession = Omit<SessionState, "auth_token"> & { signed_in: boolean };

export function publicSession(session: SessionState): PublicSession {
  const { auth_token, ...rest } = session;
  return { ...rest, signed_in: Boolean(auth_token) };
}
