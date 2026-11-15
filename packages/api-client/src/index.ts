// ============================================================
// TASKPILOT — REST API CLIENT
// packages/api-client/src/index.ts
//
// A typed, one-to-one mapping of the HTTP API. No product opinions live
// here — those belong in @taskpilot/sdk, which builds on this.
//
// Every path mirrors a route in services/api/src/app.ts and
// services/api/src/routes/*.ts. The API mounts everything under `/v1`; the
// base URL (default https://taskpilot.cc/api) supplies the rest.
// ============================================================

import { HttpClient, type HttpClientOptions, type ListResponse } from "./http";
import type {
  AgentInstallRecord,
  AgentManifest,
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
  /** Upper bound on `price_cents`. */
  max_price?: number;
  /** Only free agents. */
  free?: boolean;
}

export interface CreateAgentBody {
  name: string;
  goal: string;
  capabilities?: string[];
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

/** `PATCH /v1/runs/:id` and `POST /v1/runs/:id/cancel` are idempotent. */
export interface CompletedRunResponse {
  run: RunRecord;
  /** True when the run had already reached a final state; nothing was changed. */
  already_finished: boolean;
}

/** Columns `GET /v1/keys` returns — never the hash. */
export type ApiKeySummary = Pick<
  ApiKeyRecord,
  "id" | "name" | "key_prefix" | "scopes" | "last_used_at" | "expires_at" | "revoked_at" | "created_at"
>;

/** `POST /v1/keys` — the only response that ever carries the secret. */
export type CreatedApiKey = Pick<
  ApiKeyWithSecret,
  "id" | "name" | "key_prefix" | "scopes" | "expires_at" | "created_at" | "key"
> & { warning: string };

export type ExportFormat = "csv" | "json" | "excel";

export interface ExportBody<F extends ExportFormat = ExportFormat> {
  format: F;
  data: unknown[];
  filename?: string;
  headers?: string[];
}

/** csv → the file text, json → the parsed rows, excel → the .xlsx bytes. */
export type ExportResult<F extends ExportFormat> = F extends "csv"
  ? string
  : F extends "json"
    ? Record<string, unknown>[]
    : ArrayBuffer;

/** Encodes an id for use as one path segment. */
const seg = (value: string): string => encodeURIComponent(value);

// ─── CLIENT ──────────────────────────────────────────────────

export class TaskPilotApiClient {
  readonly http: HttpClient;

  constructor(options: HttpClientOptions = {}) {
    this.http = new HttpClient(options);
  }

  // ── Agents ──
  readonly agents = {
    list: (params: ListAgentsParams = {}): Promise<ListResponse<AgentRecord>> =>
      this.http.get("/v1/agents", { query: params as Record<string, string | number> }),

    get: (id: string): Promise<AgentRecord> => this.http.get(`/v1/agents/${seg(id)}`),

    create: (body: CreateAgentBody): Promise<AgentRecord> => this.http.post("/v1/agents", body),

    update: (id: string, patch: Partial<CreateAgentBody> & { status?: string }): Promise<AgentRecord> =>
      this.http.patch(`/v1/agents/${seg(id)}`, patch),

    remove: (id: string): Promise<{ deleted?: boolean; archived?: boolean; reason?: string }> =>
      this.http.delete(`/v1/agents/${seg(id)}`),

    publish: (
      id: string,
      body: PublishBody = {}
    ): Promise<{ agent_id: string; version: string; published: AgentVersionRecord | null }> =>
      this.http.post(`/v1/agents/${seg(id)}/publish`, body),

    versions: (id: string): Promise<ListResponse<AgentVersionRecord>> =>
      this.http.get(`/v1/agents/${seg(id)}/versions`),

    install: (
      id: string,
      settings: Record<string, unknown> = {}
    ): Promise<{ install: AgentInstallRecord; upgraded_from: string | null }> =>
      this.http.post(`/v1/agents/${seg(id)}/install`, { settings }),

    uninstall: (id: string): Promise<{ uninstalled: boolean }> =>
      this.http.delete(`/v1/agents/${seg(id)}/install`),

    /**
     * The manifest is the deliverable; requires ownership, purchase or
     * install. The endpoint returns the bare manifest JSON (no `data`
     * envelope) as an attachment, so it is parsed here rather than unwrapped.
     */
    manifest: async (id: string, version?: string): Promise<AgentManifest> => {
      const body = await this.http.get<string>(`/v1/agents/${seg(id)}/manifest`, {
        query: version ? { version } : undefined,
        responseType: "text",
      });
      return JSON.parse(body) as AgentManifest;
    },

    reviews: (
      id: string,
      params: { page?: number; per_page?: number } = {}
    ): Promise<ListResponse<AgentReviewRecord>> =>
      this.http.get(`/v1/agents/${seg(id)}/reviews`, { query: params }),

    review: (
      id: string,
      body: { rating: number; title?: string; body?: string }
    ): Promise<AgentReviewRecord> => this.http.post(`/v1/agents/${seg(id)}/reviews`, body),
  };

  // ── Marketplace ──
  readonly marketplace = {
    /** Public — works without credentials. */
    browse: (params: BrowseParams = {}): Promise<ListResponse<AgentRecord>> =>
      this.http.get("/v1/marketplace/agents", {
        query: params as Record<string, string | number | boolean>,
      }),

    /**
     * Starts a purchase. A free agent is granted immediately (`{ free: true }`);
     * a paid one returns a Stripe Checkout `url` to send the buyer to.
     */
    checkout: (agentId: string): Promise<{ url?: string; free?: true }> =>
      this.http.post("/v1/billing/checkout", { agentId }),
  };

  // ── Runs ──
  readonly runs = {
    list: (params: { page?: number; per_page?: number; status?: string; agent_id?: string } = {}): Promise<
      ListResponse<RunRecord>
    > => this.http.get("/v1/runs", { query: params }),

    get: (id: string): Promise<RunRecord & { steps: RunStepRecord[] }> =>
      this.http.get(`/v1/runs/${seg(id)}`),

    create: (body: CreateRunBody): Promise<CreatedRunResponse> => this.http.post("/v1/runs", body),

    reportStep: (runId: string, body: StepReportBody): Promise<{ recorded: boolean }> =>
      this.http.post(`/v1/runs/${seg(runId)}/steps`, body),

    complete: (runId: string, body: CompleteRunBody): Promise<CompletedRunResponse> =>
      this.http.patch(`/v1/runs/${seg(runId)}`, body),

    cancel: (runId: string): Promise<CompletedRunResponse> =>
      this.http.post(`/v1/runs/${seg(runId)}/cancel`),
  };

  // ── Workflows ──
  readonly workflows = {
    list: (params: { page?: number; per_page?: number } = {}): Promise<ListResponse<Workflow>> =>
      this.http.get("/v1/workflows", { query: params }),
    get: (id: string): Promise<Workflow> => this.http.get(`/v1/workflows/${seg(id)}`),
    create: (body: Record<string, unknown>): Promise<Workflow> => this.http.post("/v1/workflows", body),
    update: (id: string, patch: Record<string, unknown>): Promise<Workflow> =>
      this.http.patch(`/v1/workflows/${seg(id)}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.http.delete(`/v1/workflows/${seg(id)}`),
  };

  // ── Notifications ──
  readonly notifications = {
    list: (
      params: { unread?: boolean; page?: number; per_page?: number } = {}
    ): Promise<ListResponse<Notification>> => this.http.get("/v1/notifications", { query: params }),

    markRead: (ids?: string[]): Promise<{ marked: number }> =>
      this.http.post("/v1/notifications/read", ids ? { ids } : {}),
  };

  // ── Teams ──
  readonly teams = {
    list: (): Promise<ListResponse<Team & { role: string }>> => this.http.get("/v1/teams"),
    create: (name: string): Promise<Team & { role: string }> => this.http.post("/v1/teams", { name }),
    members: (teamId: string): Promise<ListResponse<TeamMember>> =>
      this.http.get(`/v1/teams/${seg(teamId)}/members`),
    invite: (
      teamId: string,
      email: string,
      role = "member"
    ): Promise<{ id: string; email: string; role: string; token: string; expires_at: string }> =>
      this.http.post(`/v1/teams/${seg(teamId)}/invites`, { email, role }),
    acceptInvite: (token: string): Promise<{ team: Team; role: string }> =>
      this.http.post("/v1/teams/invites/accept", { token }),
    removeMember: (teamId: string, userId?: string): Promise<{ removed: string }> =>
      this.http.delete(`/v1/teams/${seg(teamId)}/members`, {
        query: userId ? { user_id: userId } : undefined,
      }),
  };

  // ── API keys ──
  // Session-only on the server: these reject API-key credentials with 403,
  // so call them with a user access token.
  readonly keys = {
    list: (): Promise<ListResponse<ApiKeySummary>> => this.http.get("/v1/keys"),
    create: (name: string, scopes: ApiScope[], expiresInDays?: number): Promise<CreatedApiKey> =>
      this.http.post("/v1/keys", { name, scopes, expires_in_days: expiresInDays }),
    revoke: (id: string): Promise<{ id: string; name: string; revoked_at: string }> =>
      this.http.delete(`/v1/keys/${seg(id)}`),
  };

  // ── Exports ──
  readonly exports = {
    /**
     * Renders rows to a file. The server answers with the file itself (no
     * JSON envelope), so the return type follows `format`.
     */
    create: async <F extends ExportFormat>(body: ExportBody<F>): Promise<ExportResult<F>> => {
      if (body.format === "excel") {
        return this.http.post<ExportResult<F>>("/v1/exports", body, { responseType: "arrayBuffer" });
      }
      const text = await this.http.post<string>("/v1/exports", body, { responseType: "text" });
      return (body.format === "json" ? JSON.parse(text) : text) as ExportResult<F>;
    },
  };
}

/** Convenience factory. */
export function createClient(options: HttpClientOptions = {}): TaskPilotApiClient {
  return new TaskPilotApiClient(options);
}
