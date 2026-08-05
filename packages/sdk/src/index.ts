// ============================================================
// TASKPILOT SDK
// packages/sdk/src/index.ts
//
// The developer-facing surface: author agents, publish them, run them, and
// stream results. Built on @taskpilot/api-client, which stays a thin
// transport so this layer can hold the ergonomics.
// ============================================================

import {
  TaskPilotApiClient,
  TaskPilotError,
  type CreateRunBody,
  type HttpClientOptions,
} from "@taskpilot/api-client";
import type {
  ActionPlan,
  AgentManifest,
  AgentRecord,
  PageContext,
  RunRecord,
  RunStepRecord,
} from "@taskpilot/shared";

import { AgentBuilder, defineAgent } from "./define";

export * from "./define";
export { TaskPilotError } from "@taskpilot/api-client";
export type { HttpClientOptions } from "@taskpilot/api-client";

export interface TaskPilotOptions extends HttpClientOptions {
  /** Reads TASKPILOT_API_KEY / TASKPILOT_BASE_URL when not supplied. */
  apiKey?: string;
  baseUrl?: string;
}

export interface PublishOptions {
  /** Reuse an existing listing instead of creating one. */
  agentId?: string;
  changelog?: string;
  /** List it in the public marketplace after publishing. */
  list?: boolean;
  priceCents?: number;
  visibility?: "private" | "team" | "public";
}

export interface RunWatchOptions {
  /** How often to poll while the run is in flight. Default 1s. */
  pollIntervalMs?: number;
  /** Give up after this long. Default 5 minutes. */
  timeoutMs?: number;
  onUpdate?: (run: RunRecord & { steps: RunStepRecord[] }) => void;
  signal?: AbortSignal;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timed_out"]);

export class TaskPilot {
  readonly api: TaskPilotApiClient;

  constructor(options: TaskPilotOptions = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

    this.api = new TaskPilotApiClient({
      ...options,
      apiKey: options.apiKey ?? env?.TASKPILOT_API_KEY,
      baseUrl: options.baseUrl ?? env?.TASKPILOT_BASE_URL,
    });
  }

  // ── AUTHORING ────────────────────────────────────────────

  /** Re-exported so `TaskPilot.define(...)` reads naturally in scripts. */
  static define = defineAgent;

  /**
   * Creates the listing if needed, then publishes the manifest as a new
   * version. Idempotent on `agentId`, so a deploy script can run repeatedly.
   */
  async publish(
    agent: AgentManifest | AgentBuilder,
    options: PublishOptions = {}
  ): Promise<{ agent: AgentRecord; version: string }> {
    const manifest = agent instanceof AgentBuilder ? agent.build() : agent;

    let agentId = options.agentId;

    if (!agentId) {
      const created = await this.api.agents.create({
        name: manifest.name,
        goal: manifest.goal,
        description: manifest.description,
        category: manifest.category,
        capabilities: manifest.capabilities,
        price_cents: options.priceCents ?? 0,
        visibility: options.visibility ?? (options.list ? "public" : "private"),
      });
      agentId = created.id;
    }

    const result = await this.api.agents.publish(agentId, {
      manifest,
      version: manifest.version,
      changelog: options.changelog,
      list: options.list,
    });

    const record = await this.api.agents.get(agentId);
    return { agent: record, version: result.version };
  }

  // ── EXECUTION ────────────────────────────────────────────

  /**
   * Plans a run without storing it. Useful for previewing what an agent
   * would do before letting it touch a page.
   */
  async plan(input: { goal: string; context: PageContext; agentId?: string }): Promise<ActionPlan> {
    const response = await this.api.runs.create({
      goal: input.goal,
      agent_id: input.agentId,
      context: input.context,
      dry_run: true,
    } as CreateRunBody);
    return response.plan;
  }

  /** Starts a run. The returned plan is what the executor should carry out. */
  async start(input: {
    goal?: string;
    agentId?: string;
    workflowId?: string;
    inputs?: Record<string, unknown>;
    context: PageContext;
  }) {
    return this.api.runs.create({
      goal: input.goal,
      agent_id: input.agentId,
      workflow_id: input.workflowId,
      inputs: input.inputs,
      context: input.context,
    });
  }

  /**
   * Polls a run until it reaches a terminal state. Runs execute in the
   * user's browser, so there is nothing to await server-side — polling is
   * the honest interface rather than a fake promise that never settles.
   */
  async watch(
    runId: string,
    options: RunWatchOptions = {}
  ): Promise<RunRecord & { steps: RunStepRecord[] }> {
    const interval = options.pollIntervalMs ?? 1000;
    const deadline = Date.now() + (options.timeoutMs ?? 300_000);

    for (;;) {
      if (options.signal?.aborted) throw new Error("Watch aborted");

      const run = await this.api.runs.get(runId);
      options.onUpdate?.(run);

      if (TERMINAL_STATUSES.has(run.status)) return run;

      if (Date.now() > deadline) {
        throw new TaskPilotError(
          408,
          "watch_timeout",
          `Run ${runId} did not finish within the watch timeout (last status: ${run.status})`
        );
      }

      await sleep(interval, options.signal);
    }
  }

  /** Starts a run and waits for it, for scripts that want one call. */
  async run(
    input: Parameters<TaskPilot["start"]>[0],
    watchOptions?: RunWatchOptions
  ): Promise<RunRecord & { steps: RunStepRecord[] }> {
    const started = await this.start(input);
    if (!started.run.id) throw new Error("The run was not persisted; cannot watch it");
    return this.watch(started.run.id, watchOptions);
  }

  // ── SHORTCUTS ────────────────────────────────────────────

  agents = () => this.api.agents;
  runs = () => this.api.runs;
  workflows = () => this.api.workflows;
  marketplace = () => this.api.marketplace;
  notifications = () => this.api.notifications;
  teams = () => this.api.teams;
  keys = () => this.api.keys;
}

/** Convenience factory mirroring `createClient` in the transport package. */
export function createTaskPilot(options: TaskPilotOptions = {}): TaskPilot {
  return new TaskPilot(options);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true }
    );
  });
}
