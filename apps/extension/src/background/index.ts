// ============================================================
// TASKPILOT — BACKGROUND SERVICE WORKER
// apps/extension/src/background/index.ts
// API proxy, rate limiting, session management, context menus
// ============================================================

import type { SmartPasteRequest } from "@taskpilot/shared/types";

const API_BASE = "https://taskpilot.cc/api";
const EXTENSION_VERSION = "1.0.0";

// ─── SESSION MANAGEMENT ──────────────────────────────────────

interface ExtensionSession {
  session_id: string;
  user_id?: string;
  auth_token?: string;
  plan: "free" | "pro" | "enterprise";
  actions_used: number;
  actions_limit: number;
  fingerprint: string;
}

let session: ExtensionSession | null = null;

async function getOrCreateSession(): Promise<ExtensionSession> {
  if (session) return session;

  const stored = await chrome.storage.local.get("session");
  if (stored.session) {
    session = stored.session;
    return session!;
  }

  // Create anonymous session
  const fingerprint = await generateFingerprint();
  const response = await fetch(`${API_BASE}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fingerprint,
      version: EXTENSION_VERSION,
    }),
  });

  const data = await response.json();
  session = {
    session_id: data.session_id,
    plan: "free",
    actions_used: 0,
    actions_limit: 10,
    fingerprint,
  };

  await chrome.storage.local.set({ session });
  return session;
}

async function generateFingerprint(): Promise<string> {
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const raw = `${ua}:${lang}:${tz}`;
  
  const msgBuffer = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ─── RATE LIMITING ───────────────────────────────────────────

const requestQueue: Map<string, number[]> = new Map();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 30; // 30 requests per minute

  const requests = requestQueue.get(userId) || [];
  const recent = requests.filter((t) => now - t < windowMs);
  requestQueue.set(userId, [...recent, now]);

  return recent.length >= maxRequests;
}

// ─── CONTEXT MENUS ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "taskpilot-root",
    title: "TaskPilot AI",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "smart-paste",
    parentId: "taskpilot-root",
    title: "⚡ Smart Paste from clipboard",
    contexts: ["editable"],
  });

  chrome.contextMenus.create({
    id: "summarize-selection",
    parentId: "taskpilot-root",
    title: "📝 Summarize selection",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "rewrite-selection",
    parentId: "taskpilot-root",
    title: "✍️ Rewrite with AI",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "generate-reply",
    parentId: "taskpilot-root",
    title: "💬 Generate reply",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "extract-data",
    parentId: "taskpilot-root",
    title: "📊 Extract structured data",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "open-sidebar",
    parentId: "taskpilot-root",
    title: "🤖 Open AI Sidebar",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  switch (info.menuItemId) {
    case "smart-paste":
      await chrome.tabs.sendMessage(tab.id, { type: "SMART_PASTE" });
      break;

    case "summarize-selection":
    case "rewrite-selection":
    case "generate-reply":
      await chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_SIDEBAR",
        payload: {
          initial_action: info.menuItemId,
          selected_text: info.selectionText,
        },
      });
      break;

    case "extract-data":
    case "open-sidebar":
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
      break;
  }
});

// ─── KEYBOARD COMMAND HANDLER ────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  switch (command) {
    case "smart-paste":
      chrome.tabs.sendMessage(tab.id, { type: "SMART_PASTE" });
      break;
    case "open-sidebar":
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
      break;
    case "command-palette":
      chrome.tabs.sendMessage(tab.id, { type: "OPEN_COMMAND_PALETTE" });
      break;
  }
});

// ─── MESSAGE HANDLER ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async
});

async function handleMessage(
  message: { type: string; payload?: unknown },
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const currentSession = await getOrCreateSession();

  switch (message.type) {
    case "PROCESS_SMART_PASTE":
      return processSmartPaste(message.payload as SmartPasteRequest, currentSession);

    case "AI_REQUEST":
      return processAIRequest(message.payload as Record<string, unknown>, currentSession);

    case "GET_SESSION":
      return currentSession;

    case "UPDATE_SESSION": {
      const updates = message.payload as Partial<ExtensionSession>;
      session = { ...currentSession, ...updates };
      await chrome.storage.local.set({ session });
      return session;
    }

    case "CLEAR_SESSION":
      session = null;
      await chrome.storage.local.remove("session");
      return { success: true };

    case "PAGE_ANALYZED":
      // Store page analysis for badge updates
      await updateBadge(message.payload as { has_forms: boolean; has_tables: boolean });
      return { success: true };

    case "TRACK_EVENT":
      return trackEvent(message.payload as Record<string, unknown>, currentSession);

    case "CHECK_USAGE":
      return checkUsage(currentSession);

    default:
      return { error: "Unknown message type" };
  }
}

// ─── SMART PASTE PROCESSING ──────────────────────────────────

async function processSmartPaste(
  request: SmartPasteRequest,
  currentSession: ExtensionSession
): Promise<unknown> {
  // Check rate limit
  const identifier = currentSession.user_id || currentSession.session_id;
  if (isRateLimited(identifier)) {
    return { error: "Rate limit exceeded. Please wait a moment." };
  }

  // Check usage
  if (
    currentSession.plan === "free" &&
    currentSession.actions_used >= currentSession.actions_limit
  ) {
    return {
      error: "Usage limit reached",
      upgrade_required: true,
      upgrade_url: "https://taskpilot.cc/pricing",
    };
  }

  try {
    const response = await fetch(`${API_BASE}/ai/smart-paste`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": currentSession.session_id,
        ...(currentSession.auth_token && {
          Authorization: `Bearer ${currentSession.auth_token}`,
        }),
      },
      body: JSON.stringify({
        ...request,
        session_id: currentSession.session_id,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const result = await response.json();

    // Update usage
    session = {
      ...currentSession,
      actions_used: currentSession.actions_used + 1,
    };
    await chrome.storage.local.set({ session });

    return result;
  } catch (err) {
    console.error("[TaskPilot BG] Smart Paste error:", err);
    return { error: "Processing failed. Please try again." };
  }
}

// ─── GENERIC AI REQUEST ──────────────────────────────────────

async function processAIRequest(
  payload: Record<string, unknown>,
  currentSession: ExtensionSession
): Promise<unknown> {
  const identifier = currentSession.user_id || currentSession.session_id;
  if (isRateLimited(identifier)) {
    return { error: "Rate limit exceeded" };
  }

  try {
    const response = await fetch(`${API_BASE}/ai/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": currentSession.session_id,
        ...(currentSession.auth_token && {
          Authorization: `Bearer ${currentSession.auth_token}`,
        }),
      },
      body: JSON.stringify({ ...payload, session_id: currentSession.session_id }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("[TaskPilot BG] AI request error:", err);
    return { error: "Request failed" };
  }
}

// ─── BADGE ───────────────────────────────────────────────────

async function updateBadge(analysis: { has_forms: boolean; has_tables: boolean }) {
  if (analysis.has_forms) {
    chrome.action.setBadgeText({ text: "✦" });
    chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ─── EVENT TRACKING ──────────────────────────────────────────

async function trackEvent(
  event: Record<string, unknown>,
  currentSession: ExtensionSession
): Promise<{ success: boolean }> {
  try {
    await fetch(`${API_BASE}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...event,
        session_id: currentSession.session_id,
        user_id: currentSession.user_id,
        timestamp: new Date().toISOString(),
      }),
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ─── USAGE CHECK ─────────────────────────────────────────────

function checkUsage(currentSession: ExtensionSession) {
  return {
    actions_used: currentSession.actions_used,
    actions_limit: currentSession.actions_limit,
    plan: currentSession.plan,
    percentage: Math.round(
      (currentSession.actions_used / currentSession.actions_limit) * 100
    ),
    upgrade_url: "https://taskpilot.cc/pricing",
  };
}

// ─── ALARM (usage reset) ─────────────────────────────────────

chrome.alarms.create("sync-session", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-session" && session?.auth_token) {
    try {
      const response = await fetch(`${API_BASE}/auth/session/sync`, {
        headers: { Authorization: `Bearer ${session.auth_token}` },
      });
      const data = await response.json();
      session = { ...session, ...data };
      await chrome.storage.local.set({ session });
    } catch {
      // Silent fail
    }
  }
});
