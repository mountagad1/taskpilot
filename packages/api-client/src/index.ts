// ============================================================
// TASKPILOT — REST API CLIENT
// packages/api-client/src/index.ts
//
// A typed, one-to-one mapping of the HTTP API. No product opinions live
// here — those belong in @taskpilot/sdk, which builds on this.
// ============================================================

import { HttpClient, type HttpClientOptions, type ListResponse } from "./http";
import type {
  AgentInstallRecord,
  AgentRecord,
  AgentReviewRecord,
  AgentVersionRecord,
  ApiKeyRecord,
  ApiKeyWithSecret,
  ApiScope,
  Notification,
  PageContext,
  ActionPlan,
  RunRecord,
  RunStepRecord,
  Team,
  TeamMember,
  Workflow,
} from "@taskpilot/shared";

export * from "./http";

// ─── REQUEST SHAPES ──────────────────────────────────────────

export interface ListAgentsParams {
  page?: number;
  per_page?: number;
  status?: "draft" | "listed" | "suspended" | "archived";
}

export interface BrowseParams {
  page?: number;
  per_page?: number;
  category?: string;
  q?: string;
  sort?: "popular" | "newest" | "rating" | "price";
  max_price?: number;
}

export interface CreateAgentBody {
  name: string;
  goal: string;
  capabilities: string[];
  tagline?: string;
  description?: string;
  category?: string;
  price_cents?: number;
  visibility?: "private" | "team" | "public";
  team_id?: string;
}

export interface PublishBody {
  version?: string;
  changelog?: string;
  manifest?: unknown;
  list?: boolean;
}

export interface CreateRunBody {
  goal?: string;
  agent_id?: string;
  workflow_id?: string;
  inputs?: Record<string, unknown>;
  context: Partial<PageContext> & { url: string };
  dry_run?: boolean;
}

export interface CreatedRunResponse {
  run: RunRecord & { id: string | null };
  plan: ActionPlan;
  limits: { max_steps: number; token_budget: number; timeout_ms: number; confirm: string[] };
}

export interface StepReportBody {
  step_index: number;
  status: "running" | "succeeded" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  attempts?: number;
  duration_ms?: number;
}

export interface CompleteRunBody {
  status: "completed" | "failed" | "cancelled" | "timed_out" | "awaiting_confirmation";
  output?: Record<string, unknown>;
  error?: string;
  tokens_used?: number;
  cost_usd?: number;
}

// ─── CLIENT ──────────────────────────────────────────────────

export class TaskPilotApiClient {
  readonly http: HttpClient;

  constructor(options: HttpClientOptions = {}) {
    this.http = new HttpClient(options);
  }

  // ── Agents ──
  readonly agents = {
    list: (params: ListAgentsParams = {}): Promise<ListResponse<AgentRecord>> =>
      this.http.get("/api/agents", { query: params as Record<string, string | number> }),

    get: (id: string): Promise<AgentRecord> => this.http.get(`/api/agents/${id}`),

    create: (body: CreateAgentBody): Promise<AgentRecord> => this.http.post("/api/agents", body),

    update: (id: string, patch: Partial<CreateAgentBody> & { status?: string }): Promise<AgentRecord> =>
      this.http.patch(`/api/agents/${id}`, patch),

    remove: (id: string): Promise<{ deleted?: boolean; archived?: boolean }> =>
      this.http.delete(`/api/agents/${id}`),

    publish: (
      id: string,
      body: PublishBody = {}
    ): Promise<{ agent_id: string; version: string; published: AgentVersionRecord | null }> =>
      this.http.post(`/api/agents/${id}/publish`, body),

    versions: (id: string): Promise<ListResponse<AgentVersionRecord>> =>
      this.http.get(`/api/agents/${id}/versions`),

    install: (
      id: string,
      settings: Record<string, unknown> = {}
    ): Promise<{ install: AgentInstallRecord; upgraded_from: string | null }> =>
      this.http.post(`/api/agents/${id}/install`, { settings }),

    uninstall: (id: string): Promise<{ uninstalled: boolean }> =>
      this.http.delete(`/api/agents/${id}/install`),

    /** The manifest is the deliverable; requires ownership, purchase or install. */
    manifest: (id: string, version?: string): Promise<string> =>
      this.http.get(`/api/marketplace/agents/${id}/manifest`, {
        query: version ? { version } : undefined,
      }),

    reviews: (id: string): Promise<ListResponse<AgentReviewRecord>> =>
      this.http.get(`/api/agents/${id}/reviews`),

    review: (
      id: string,
      body: { rating: number; title?: string; body?: string }
    ): Promise<AgentReviewRecord> => this.http.post(`/api/agents/${id}/reviews`, body),
  };

  // ── Marketplace ──
  readonly marketplace = {
    browse: (params: BrowseParams = {}): Promise<ListResponse<AgentRecord>> =>
      this.http.get("/api/marketplace/agents", {
        query: params as Record<string, string | number>,
      }),

    checkout: (agentId: string): Promise<{ url?: string; free?: true }> =>
      this.http.post("/api/marketplace/checkout", { agentId }),
  };

  // ── Runs ──
  readonly runs = {
    list: (params: { page?: number; per_page?: number; status?: string; agent_id?: string } = {}): Promise<
      ListResponse<RunRecord>
    > => this.http.get("/api/runs", { query: params }),

    get: (id: string): Promise<RunRecord & { steps: RunStepRecord[] }> =>
      this.http.get(`/api/runs/${id}`),

    create: (body: CreateRunBody): Promise<CreatedRunResponse> => this.http.post("/api/runs", body),

    reportStep: (runId: string, body: StepReportBody): Promise<{ recorded: boolean }> =>
      this.http.post(`/api/runs/${runId}/steps`, body),

    complete: (runId: string, body: CompleteRunBody): Promise<{ run: RunRecord }> =>
      this.http.patch(`/api/runs/${runId}`, body),

    cancel: (runId: string): Promise<{ run: RunRecord }> =>
      this.http.post(`/api/runs/${runId}/cancel`),
  };

  // ── Workflows ──
  readonly workflows = {
    list: (): Promise<ListResponse<Workflow>> => this.http.get("/api/workflows"),
    get: (id: string): Promise<Workflow> => this.http.get(`/api/workflows/${id}`),
    create: (body: Record<string, unknown>): Promise<Workflow> => this.http.post("/api/workflows", body),
    update: (id: string, patch: Record<string, unknown>): Promise<Workflow> =>
      this.http.patch(`/api/workflows/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.http.delete(`/api/workflows/${id}`),
  };

  // ── Notifications ──
  readonly notifications = {
    list: (params: { unread?: boolean; page?: number } = {}): Promise<ListResponse<Notification>> =>
      this.http.get("/api/notifications", { query: params }),

    markRead: (ids?: string[]): Promise<{ marked: number }> =>
      this.http.post("/api/notifications/read", ids ? { ids } : {}),
  };

  // ── Teams ──
  readonly teams = {
    list: (): Promise<ListResponse<Team & { role: string }>> => this.http.get("/api/teams"),
    create: (name: string): Promise<Team & { role: string }> => this.http.post("/api/teams", { name }),
    members: (teamId: string): Promise<ListResponse<TeamMember>> =>
      this.http.get(`/api/teams/${teamId}/members`),
    invite: (teamId: string, email: string, role = "member"): Promise<{ id: string; token: string }> =>
      this.http.post(`/api/teams/${teamId}/invites`, { email, role }),
    acceptInvite: (token: string): Promise<{ team: Team; role: string }> =>
      this.http.post("/api/teams/invites/accept", { token }),
    removeMember: (teamId: string, userId?: string): Promise<{ removed: string }> =>
      this.http.delete(`/api/teams/${teamId}/members`, {
        query: userId ? { user_id: userId } : undefined,
      }),
  };

  // ── API keys ──
  readonly keys = {
    list: (): Promise<ListResponse<ApiKeyRecord>> => this.http.get("/api/keys"),
    create: (name: string, scopes: ApiScope[], expiresInDays?: number): Promise<ApiKeyWithSecret> =>
      this.http.post("/api/keys", { name, scopes, expires_in_days: expiresInDays }),
    revoke: (id: string): Promise<{ id: string; revoked_at: string }> =>
      this.http.delete(`/api/keys/${id}`),
  };

  // ── Exports ──
  readonly exports = {
    /** Returns the raw file body; `format` decides its encoding. */
    create: (body: {
      format: "csv" | "json" | "excel";
      data: unknown[];
      filename?: string;
      headers?: string[];
    }): Promise<string> => this.http.post("/api/export", body),
  };
}

/** Convenience factory. */
export function createClient(options: HttpClientOptions = {}): TaskPilotApiClient {
  return new TaskPilotApiClient(options);
}
