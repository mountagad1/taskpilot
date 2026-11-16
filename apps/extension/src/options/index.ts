// ============================================================
// TASKPILOT — OPTIONS PAGE
// apps/extension/src/options/index.ts
// ============================================================

import type { PublicSession } from "../background/sender-policy";
import { WEB_ORIGIN } from "../shared/config";
import { sendToBackground } from "../shared/messages";

type ExtensionSession = Pick<PublicSession, "email" | "plan">;

const SIGNED_OUT: ExtensionSession = { plan: "free" };

const PLAN_LABEL: Record<ExtensionSession["plan"], string> = {
  free: "Free plan",
  pro: "Pro plan",
  enterprise: "Enterprise plan",
};

/** The background replies with a { ok, data } envelope, never the bare session. */
async function getSession(): Promise<ExtensionSession> {
  const response = await sendToBackground<PublicSession>({ type: "GET_SESSION" });
  return response.ok ? response.data : SIGNED_OUT;
}

function renderAccount(session: ExtensionSession) {
  const emailEl = document.getElementById("accountEmail")!;
  const planEl = document.getElementById("accountPlan")!;
  const btn = document.getElementById("authBtn") as HTMLButtonElement;

  if (session.email) {
    emailEl.textContent = session.email;
    planEl.textContent = PLAN_LABEL[session.plan];
    btn.textContent = "Sign out";
    btn.className = "btn btn-secondary";
    btn.onclick = handleSignOut;
  } else {
    emailEl.textContent = "Not signed in";
    planEl.textContent = "Sign in to sync across devices and unlock Pro features";
    btn.textContent = "Sign in";
    btn.className = "btn btn-primary";
    btn.onclick = handleSignIn;
  }
}

function handleSignIn() {
  chrome.tabs.create({ url: `${WEB_ORIGIN}/auth/login?source=extension` });
}

async function handleSignOut() {
  await sendToBackground({ type: "CLEAR_SESSION" });
  const session = await getSession();
  renderAccount(session);
}

async function renderShortcuts() {
  const commands = await chrome.commands.getAll();
  const list = document.getElementById("shortcutsList")!;
  list.innerHTML = "";

  commands.forEach((cmd) => {
    if (!cmd.description) return;
    const row = document.createElement("div");
    row.className = "shortcut-row";

    const desc = document.createElement("span");
    desc.className = "shortcut-desc";
    desc.textContent = cmd.description;

    const kbd = document.createElement("kbd");
    kbd.textContent = cmd.shortcut || "Not set";

    row.appendChild(desc);
    row.appendChild(kbd);
    list.appendChild(row);
  });
}

function init() {
  const manifest = chrome.runtime.getManifest();
  document.getElementById("versionLabel")!.textContent = `v${manifest.version}`;

  document.getElementById("editShortcutsLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  getSession().then(renderAccount);
  renderShortcuts();

  // Reflect sign-in/out that happens in another tab while options stays open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.session) {
      getSession().then(renderAccount);
    }
  });
}

init();
