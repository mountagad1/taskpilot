// ============================================================
// TASKPILOT — POPUP
// apps/extension/src/popup/index.ts
//
// The extension's control surface: a natural-language command bar, live run
// progress, the confirmation prompt, and a marketplace shortcut.
//
// All rendering uses textContent rather than innerHTML — agent names and
// error strings come from the server and from arbitrary pages.
// ============================================================

import type { PlanStep, RunStatus } from "@taskpilot/shared";

import { WEB_ORIGIN } from "../shared/config";
import { sendToBackground, type RunState, type RunUpdate, type SessionState } from "../shared/messages";

const QUICK_ACTIONS = [
  { label: "Summarize", goal: "Summarize this page" },
  { label: "Emails", goal: "Extract all the email addresses on this page" },
  { label: "Table to CSV", goal: "Extract the table on this page and export it as CSV" },
  { label: "Prices", goal: "Extract all the prices on this page" },
  { label: "Smart paste", goal: "Smart paste the clipboard into this form" },
];

// ─── ELEMENTS ────────────────────────────────────────────────

const el = {
  plan: byId("plan"),
  goal: byId<HTMLTextAreaElement>("goal"),
  run: byId<HTMLButtonElement>("run"),
  quick: byId("quick"),
  error: byId("error"),
  runPanel: byId("run-panel"),
  runStatus: byId("run-status"),
  runGoal: byId("run-goal"),
  progress: byId("progress"),
  steps: byId("steps"),
  cancel: byId<HTMLButtonElement>("cancel"),
  confirmPanel: byId("confirm-panel"),
  confirmBody: byId("confirm-body"),
  approve: byId<HTMLButtonElement>("approve"),
  deny: byId<HTMLButtonElement>("deny"),
  agents: byId("agents"),
  marketplaceLink: byId("marketplace-link"),
  dashboardLink: byId("dashboard-link"),
  optionsLink: byId("options-link"),
};

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Popup is missing #${id}`);
  return node as T;
}

// ─── BOOT ────────────────────────────────────────────────────

void init();

async function init(): Promise<void> {
  renderQuickActions();
  wireEvents();

  chrome.runtime.onMessage.addListener((update: RunUpdate) => {
    handleRunUpdate(update);
  });

  await Promise.all([loadSession(), restoreRunState(), loadAgents()]);
}

function wireEvents(): void {
  el.run.addEventListener("click", () => void startRun(el.goal.value));

  el.goal.addEventListener("keydown", (event) => {
    // Enter runs; Shift+Enter inserts a newline, as in any chat input.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void startRun(el.goal.value);
    }
  });

  el.cancel.addEventListener("click", () => void cancelRun());
  el.approve.addEventListener("click", () => void answerConfirmation(true));
  el.deny.addEventListener("click", () => void answerConfirmation(false));

  el.marketplaceLink.addEventListener("click", () => openTab("/marketplace"));
  el.dashboardLink.addEventListener("click", () => openTab("/dashboard"));
  el.optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function renderQuickActions(): void {
  el.quick.replaceChildren();

  for (const action of QUICK_ACTIONS) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = action.label;
    chip.addEventListener("click", () => {
      el.goal.value = action.goal;
      void startRun(action.goal);
    });
    el.quick.appendChild(chip);
  }
}

// ─── SESSION + AGENTS ────────────────────────────────────────

async function loadSession(): Promise<void> {
  const response = await sendToBackground<SessionState>({ type: "GET_SESSION" });
  if (response.ok) el.plan.textContent = response.data.plan;
}

async function loadAgents(): Promise<void> {
  const response = await sendToBackground<{ data?: Array<AgentSummary> } | AgentSummary[]>({
    type: "BROWSE_MARKETPLACE",
  });

  if (!response.ok) {
    setEmpty(el.agents, "Sign in to browse agents");
    return;
  }

  // The endpoint returns a list envelope; unwrap either shape.
  const payload = response.data;
  const agents = Array.isArray(payload) ? payload : (payload?.data ?? []);

  if (!agents.length) {
    setEmpty(el.agents, "No agents available yet");
    return;
  }

  el.agents.replaceChildren();

  for (const agent of agents.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "agent";

    const name = document.createElement("span");
    name.className = "agent-name";
    name.textContent = agent.name;

    const meta = document.createElement("span");
    meta.className = "agent-meta";
    meta.textContent = agent.price_cents > 0 ? `$${(agent.price_cents / 100).toFixed(2)}` : "Free";

    row.append(name, meta);
    row.addEventListener("click", () => openTab(`/marketplace/${agent.slug}`));
    el.agents.appendChild(row);
  }
}

interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
}

// ─── RUNS ────────────────────────────────────────────────────

async function startRun(rawGoal: string): Promise<void> {
  const goal = rawGoal.trim();
  if (!goal) {
    showError("Tell TaskPilot what to do first.");
    return;
  }

  hideError();
  el.run.disabled = true;
  el.run.textContent = "...";

  const response = await sendToBackground<RunState>({ type: "RUN_GOAL", goal });

  el.run.disabled = false;
  el.run.textContent = "Run";

  if (!response.ok) {
    showError(response.error);
    return;
  }

  renderRunState(response.data);
}

async function cancelRun(): Promise<void> {
  await sendToBackground({ type: "CANCEL_RUN", runId: "" });
  el.runStatus.textContent = "Cancelled";
}

async function answerConfirmation(approved: boolean): Promise<void> {
  el.confirmPanel.style.display = "none";
  await sendToBackground({ type: "CONFIRM_STEP", runId: "", approved });
}

/** The worker may have been evicted; ask for whatever state survives. */
async function restoreRunState(): Promise<void> {
  const response = await sendToBackground<RunState>({ type: "GET_RUN_STATE" });
  if (response.ok && response.data.runId) renderRunState(response.data);
}

function renderRunState(state: RunState): void {
  if (!state.runId) return;

  el.runPanel.style.display = "block";
  el.runGoal.textContent = state.goal;
  el.runStatus.textContent = describeStatus(state.status);

  const total = state.plan?.steps.length ?? 0;
  const done = state.results.length;
  el.progress.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";

  el.steps.replaceChildren();

  state.plan?.steps.forEach((step, index) => {
    const result = state.results.find((r) => r.index === index);
    const runningNow = state.currentStep === index && !result;

    const stateName = result
      ? result.success
        ? "succeeded"
        : "failed"
      : runningNow
        ? "running"
        : "pending";

    el.steps.appendChild(buildStepRow(step, stateName, result?.error));
  });

  if (state.awaitingConfirmation) {
    showConfirmation(state.awaitingConfirmation);
  }

  if (state.error) showError(state.error);
}

function buildStepRow(step: PlanStep, state: string, error?: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "step";
  row.dataset.state = state;

  const dot = document.createElement("span");
  dot.className = "dot";

  const label = document.createElement("span");
  label.textContent = step.action.type.replace(/_/g, " ");

  row.append(dot, label);

  if (error) {
    const detail = document.createElement("span");
    detail.className = "step-error";
    detail.textContent = error.slice(0, 60);
    row.appendChild(detail);
  }

  return row;
}

function showConfirmation(step: PlanStep): void {
  el.confirmPanel.style.display = "block";

  const target = step.action.target?.description ?? step.action.target?.value;
  const url = typeof step.action.params?.url === "string" ? step.action.params.url : null;

  el.confirmBody.textContent = url
    ? `This agent wants to ${step.action.type.replace(/_/g, " ")}: ${url}`
    : `This agent wants to ${step.action.type.replace(/_/g, " ")}${target ? ` on "${target}"` : ""}.`;
}

function handleRunUpdate(update: RunUpdate): void {
  switch (update.type) {
    case "RUN_STARTED":
      el.runPanel.style.display = "block";
      el.runGoal.textContent = update.goal;
      el.runStatus.textContent = "Running";
      el.steps.replaceChildren();
      update.plan.steps.forEach((step) => el.steps.appendChild(buildStepRow(step, "pending")));
      break;

    case "RUN_STEP": {
      const rows = el.steps.children;
      const row = rows[update.index] as HTMLElement | undefined;
      if (row) {
        row.dataset.state = update.result
          ? update.result.success
            ? "succeeded"
            : "failed"
          : "running";
        if (update.result?.error) {
          const detail = document.createElement("span");
          detail.className = "step-error";
          detail.textContent = update.result.error.slice(0, 60);
          row.appendChild(detail);
        }
      }
      el.progress.style.width = `${Math.round(((update.index + 1) / rows.length) * 100)}%`;
      break;
    }

    case "RUN_CONFIRM":
      showConfirmation(update.step);
      break;

    case "RUN_FINISHED":
      el.runStatus.textContent = "Completed";
      el.progress.style.width = "100%";
      el.confirmPanel.style.display = "none";
      break;

    case "RUN_FAILED":
      el.runStatus.textContent = "Failed";
      el.confirmPanel.style.display = "none";
      showError(update.error);
      break;

    default:
      break;
  }
}

function describeStatus(status: RunStatus | "idle"): string {
  const labels: Record<string, string> = {
    idle: "Idle",
    queued: "Queued",
    planning: "Planning",
    running: "Running",
    awaiting_confirmation: "Waiting for you",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    timed_out: "Timed out",
  };
  return labels[status] ?? status;
}

// ─── UTILITIES ───────────────────────────────────────────────

function showError(message: string): void {
  el.error.textContent = message;
  el.error.style.display = "block";
}

function hideError(): void {
  el.error.style.display = "none";
}

function setEmpty(container: HTMLElement, message: string): void {
  container.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  container.appendChild(empty);
}

function openTab(path: string): void {
  void chrome.tabs.create({ url: `${WEB_ORIGIN}${path}` });
}
