// ============================================================
// TASKPILOT — BACKGROUND SERVICE WORKER
// apps/extension/src/background/index.ts
//
// The extension's privileged core: session management, the authenticated
// API bridge, run orchestration, context menus and keyboard commands.
//
// A Manifest V3 worker is terminated whenever it goes idle, so nothing here
// may rely on in-memory state surviving. Session data lives in
// chrome.storage; the executor's state is intentionally ephemeral, because a
// run whose worker was evicted cannot be resumed anyway.
// ============================================================

import type { PageContext } from "@taskpilot/shared";

import { API_BASE, EXTENSION_VERSION, isAutomatable, isTrustedOrigin } from "../shared/config";
import {
  failure,
  reply,
  sendToTab,
  type ContentMessage,
  type Reply,
  type RunState,
  type RunUpdate,
  type SessionState,
  type UiMessage,
} from "../shared/messages";
import { RunExecutor } from "./executor";

// ─── SESSION ─────────────────────────────────────────────────

let cachedSession: SessionState | null = null;

async function getSession(): Promise<SessionState> {
  if (cachedSession) return cachedSession;

  const stored = await chrome.storage.local.get("session");
  if (stored.session) {
    cachedSession = stored.session as SessionState;
    return cachedSession;
  }

  // A local id is enough until the user signs in: the API service issues no
  // anonymous credential, so this only correlates local telemetry.
  const fingerprint = await generateFingerprint();
  const sessionId: string = crypto.randomUUID();

  cachedSession = { session_id: sessionId, plan: "free", fingerprint };
  await chrome.storage.local.set({ session: cachedSession });
  return cachedSession;
}

async function updateSession(patch: Partial<SessionState>): Promise<SessionState> {
  const current = await getSession();
  cachedSession = { ...current, ...patch };
  await chrome.storage.local.set({ session: cachedSession });
  return cachedSession;
}

async function clearSession(): Promise<void> {
  cachedSession = null;
  await chrome.storage.local.remove("session");
}

async function generateFingerprint(): Promise<string> {
  const raw = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join(":");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// ─── API BRIDGE ──────────────────────────────────────────────

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authenticated fetch against the TaskPilot API. Attaches the signed-in
 * user's token when present, and the anonymous session id otherwise.
 */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": session.session_id,
      "X-Extension-Version": EXTENSION_VERSION,
      ...(session.auth_token ? { Authorization: `Bearer ${session.auth_token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? `http_${response.status}`,
      error?.message ?? `Request failed (${response.status})`
    );
  }

  return ((payload as { data?: T } | null)?.data ?? payload) as T;
}

// ─── RUN ORCHESTRATION ───────────────────────────────────────

/** Broadcasts to any open popup or sidebar; no receiver is the normal case. */
function broadcast(update: RunUpdate): void {
  chrome.runtime.sendMessage(update).catch(() => {});
  void updateBadgeForRun(update);
}

const executor = new RunExecutor({
  api,
  broadcast,
  // The popup drives confirmation via CONFIRM_STEP; this promise is settled
  // by `executor.answerConfirmation`. Opening the popup programmatically is
  // best-effort — Chrome only allows it in response to a user gesture.
  requestConfirmation: async (_runId, step) => {
    await chrome.action.setBadgeText({ text: "?" });
    await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
    await notifyUser(`TaskPilot needs approval to ${step.action.type.replace(/_/g, " ")}`);
    return new Promise<boolean>(() => {
      // Deliberately never self-resolves: the user's answer arrives through
      // CONFIRM_STEP, and the run's own timeout is the backstop.
    });
  },
});

async function startRun(options: {
  tabId?: number;
  goal?: string;
  agentId?: string;
  inputs?: Record<string, unknown>;
}): Promise<RunState> {
  const tab = await resolveTab(options.tabId);
  if (!tab.id) throw new Error("No active tab");
  if (!isAutomatable(tab.url)) {
    throw new Error("TaskPilot cannot run on this page. Open a normal website and try again.");
  }

  const context = await readContext(tab.id);

  return executor.start({
    tabId: tab.id,
    goal: options.goal,
    agentId: options.agentId,
    inputs: options.inputs,
    context,
  });
}

async function resolveTab(tabId?: number): Promise<chrome.tabs.Tab> {
  if (tabId !== undefined) return chrome.tabs.get(tabId);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active) throw new Error("No active tab");
  return active;
}

/** Reads page context, injecting the content script if it isn't there yet. */
async function readContext(tabId: number): Promise<PageContext> {
  let response = await sendToTab<PageContext>(tabId, { type: "READ_CONTEXT" });

  if (!response.ok && response.code === "no_content_script") {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
      response = await sendToTab<PageContext>(tabId, { type: "READ_CONTEXT" });
    } catch {
      throw new Error("TaskPilot could not attach to this page");
    }
  }

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

// ─── MESSAGE HANDLING ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: UiMessage, _sender, sendResponse) => {
  handleUiMessage(message).then(sendResponse, (err) => sendResponse(failure(err)));
  return true; // keep the channel open for the async reply
});

async function handleUiMessage(message: UiMessage): Promise<Reply<unknown>> {
  try {
    switch (message.type) {
      case "GET_SESSION":
        return reply(await getSession());

      case "CLEAR_SESSION":
        await clearSession();
        return reply({ cleared: true });

      case "GET_PAGE_CONTEXT": {
        const tab = await resolveTab(message.tabId);
        if (!tab.id) return failure("No active tab");
        return reply(await readContext(tab.id));
      }

      case "RUN_GOAL": {
        const goal = message.goal?.trim();
        if (!goal) return failure("Type what you want TaskPilot to do");
        return reply(await startRun({ tabId: message.tabId, goal }));
      }

      case "RUN_AGENT":
        return reply(
          await startRun({ tabId: message.tabId, agentId: message.agentId, inputs: message.inputs })
        );

      case "CANCEL_RUN":
        executor.cancel();
        return reply({ cancelled: true });

      case "CONFIRM_STEP":
        executor.answerConfirmation(message.approved);
        await chrome.action.setBadgeText({ text: "" });
        return reply({ acknowledged: true });

      case "GET_RUN_STATE":
        return reply(executor.getState());

      case "LIST_AGENTS": {
        const installs = await api<
          Array<{ agent_id: string; version: string; enabled: boolean }>
        >("/agents?status=listed").catch(() => []);
        return reply(installs);
      }

      case "INSTALL_AGENT":
        return reply(await api(`/agents/${message.agentId}/install`, { method: "POST", body: "{}" }));

      case "BROWSE_MARKETPLACE": {
        const params = new URLSearchParams();
        if (message.query) params.set("q", message.query);
        if (message.category) params.set("category", message.category);
        params.set("per_page", "24");
        return reply(await api(`/marketplace/agents?${params.toString()}`));
      }

      case "SMART_PASTE": {
        const tab = await resolveTab(message.tabId);
        if (!tab.id) return failure("No active tab");
        return reply(await startRun({ tabId: tab.id, goal: "Smart paste the clipboard into this form" }));
      }

      default:
        return failure(`Unknown message: ${(message as { type: string }).type}`);
    }
  } catch (err) {
    if (err instanceof ApiError) return failure(err.message, err.code);
    return failure(err);
  }
}

// ─── EXTERNAL MESSAGES (web app → extension) ─────────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Only taskpilot.cc may hand this extension a session. Without this check
  // any site could impersonate the user to the extension.
  if (!isTrustedOrigin(sender.origin)) {
    sendResponse(failure("Untrusted origin", "forbidden"));
    return false;
  }

  handleExternalMessage(message as { type: string; payload?: unknown }).then(sendResponse);
  return true;
});

async function handleExternalMessage(message: {
  type: string;
  payload?: unknown;
}): Promise<Reply<unknown>> {
  switch (message.type) {
    case "PING":
      return reply({ installed: true, version: EXTENSION_VERSION });

    case "AUTH_SUCCESS": {
      const payload = message.payload as {
        user_id: string;
        email: string;
        auth_token: string;
        plan?: SessionState["plan"];
      };
      await updateSession({
        user_id: payload.user_id,
        email: payload.email,
        auth_token: payload.auth_token,
        plan: payload.plan ?? "free",
      });
      return reply({ success: true });
    }

    case "AUTH_SIGNOUT":
      await updateSession({
        user_id: undefined,
        email: undefined,
        auth_token: undefined,
        plan: "free",
      });
      return reply({ success: true });

    default:
      return failure(`Unknown external message: ${message.type}`);
  }
}

// ─── CONTEXT MENUS ───────────────────────────────────────────

const MENU_ITEMS: Array<{ id: string; title: string; contexts: chrome.contextMenus.ContextType[] }> = [
  { id: "smart-paste", title: "Smart Paste from clipboard", contexts: ["editable"] },
  { id: "summarize-selection", title: "Summarize selection", contexts: ["selection"] },
  { id: "rewrite-selection", title: "Rewrite with AI", contexts: ["selection"] },
  { id: "generate-reply", title: "Generate a reply", contexts: ["selection"] },
  { id: "extract-data", title: "Extract structured data", contexts: ["page"] },
  { id: "open-sidebar", title: "Open TaskPilot", contexts: ["page"] },
];

chrome.runtime.onInstalled.addListener(() => {
  // Rebuild rather than append: onInstalled also fires on update, and
  // re-creating an existing id throws.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "taskpilot-root", title: "TaskPilot AI", contexts: ["all"] });
    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create({ ...item, parentId: "taskpilot-root" });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const goals: Record<string, string> = {
    "smart-paste": "Smart paste the clipboard into this form",
    "summarize-selection": `Summarize this text: ${info.selectionText ?? ""}`.slice(0, 500),
    "rewrite-selection": `Rewrite this text professionally: ${info.selectionText ?? ""}`.slice(0, 500),
    "generate-reply": `Write a professional reply to this: ${info.selectionText ?? ""}`.slice(0, 500),
    "extract-data": "Extract all the structured data on this page",
  };

  if (info.menuItemId === "open-sidebar") {
    await sendToTab(tab.id, { type: "TOGGLE_SIDEBAR" });
    return;
  }

  const goal = goals[String(info.menuItemId)];
  if (!goal) return;

  try {
    await startRun({ tabId: tab.id, goal });
  } catch (err) {
    await notifyUser(err instanceof Error ? err.message : "TaskPilot could not start that task");
  }
});

// ─── KEYBOARD COMMANDS ───────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const messages: Record<string, ContentMessage> = {
    "open-sidebar": { type: "TOGGLE_SIDEBAR" },
    "command-palette": { type: "OPEN_COMMAND_PALETTE" },
  };

  if (command === "smart-paste") {
    try {
      await startRun({ tabId: tab.id, goal: "Smart paste the clipboard into this form" });
    } catch (err) {
      await notifyUser(err instanceof Error ? err.message : "Smart Paste failed");
    }
    return;
  }

  const message = messages[command];
  if (message) await sendToTab(tab.id, message);
});

// ─── BADGE ───────────────────────────────────────────────────

async function updateBadgeForRun(update: RunUpdate): Promise<void> {
  try {
    switch (update.type) {
      case "RUN_STARTED":
        await chrome.action.setBadgeText({ text: "..." });
        await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
        break;
      case "RUN_FINISHED":
        await chrome.action.setBadgeText({ text: "ok" });
        await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 4000);
        break;
      case "RUN_FAILED":
        await chrome.action.setBadgeText({ text: "!" });
        await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
        setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 6000);
        break;
      default:
        break;
    }
  } catch {
    // Badge updates are cosmetic.
  }
}

async function notifyUser(message: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await sendToTab(tab.id, { type: "SHOW_NOTIFICATION", message, level: "info" });
  }
}

// ─── SESSION SYNC ────────────────────────────────────────────

chrome.alarms.create("sync-session", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "sync-session") return;

  const session = await getSession();
  if (!session.auth_token) return;

  try {
    // Keeps the cached plan honest after an upgrade or a cancellation.
    const profile = await api<{ plan?: SessionState["plan"] }>("/me");
    if (profile.plan && profile.plan !== session.plan) {
      await updateSession({ plan: profile.plan });
    }
  } catch (err) {
    // A revoked token should sign the extension out rather than retry forever.
    if (err instanceof ApiError && err.status === 401) {
      await updateSession({ auth_token: undefined, user_id: undefined, plan: "free" });
    }
  }
});
