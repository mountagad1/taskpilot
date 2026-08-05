// ============================================================
// TASKPILOT — PLATFORM TYPES
// packages/shared/src/types/platform.ts
// Teams, notifications, developer API keys, background jobs.
// ============================================================

import type { PlanType } from "./index";

// ─── TEAMS ───────────────────────────────────────────────────

export type TeamRole = "owner" | "admin" | "member" | "viewer";

/** Ordered by privilege; index comparison drives permission checks. */
export const TEAM_ROLE_RANK: Record<TeamRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: PlanType;
  seats: number;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
}

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  role: TeamRole;
  token: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
}

export function canManageTeam(role: TeamRole): boolean {
  return TEAM_ROLE_RANK[role] >= TEAM_ROLE_RANK.admin;
}

export function canRunAgents(role: TeamRole): boolean {
  return TEAM_ROLE_RANK[role] >= TEAM_ROLE_RANK.member;
}

// ─── NOTIFICATIONS ───────────────────────────────────────────

export type NotificationType =
  | "run_completed"
  | "run_failed"
  | "agent_published"
  | "agent_purchased"
  | "agent_installed"
  | "agent_review"
  | "team_invite"
  | "usage_limit"
  | "subscription"
  | "system";

export type NotificationChannel = "in_app" | "email" | "push";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Deep link into the app, e.g. `/dashboard/runs/<id>`. */
  link: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  /** Per-type channel opt-ins. Missing type means "in_app only". */
  channels: Partial<Record<NotificationType, NotificationChannel[]>>;
  digest: "off" | "daily" | "weekly";
}

// ─── DEVELOPER API KEYS ──────────────────────────────────────

export const API_SCOPES = [
  "agents:read",
  "agents:write",
  "agents:publish",
  "runs:read",
  "runs:write",
  "workflows:read",
  "workflows:write",
  "marketplace:read",
  "exports:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  /** First 8 chars after the prefix, shown in the UI to identify the key. */
  key_prefix: string;
  /** SHA-256 of the full key. The plaintext is shown exactly once, at creation. */
  key_hash: string;
  scopes: ApiScope[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Returned only from the create endpoint — the one time the secret exists. */
export interface ApiKeyWithSecret extends ApiKeyRecord {
  key: string;
}

export const API_KEY_PREFIX = "tp_live_";

// ─── BACKGROUND JOBS ─────────────────────────────────────────

export type JobType =
  | "run_agent"
  | "scheduled_workflow"
  | "export_generate"
  | "notification_dispatch"
  | "usage_rollup"
  | "cache_sweep";

export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "dead";

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  /** Not picked up before this time — powers retry backoff and scheduling. */
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Exponential backoff with a 1-hour ceiling. */
export function jobBackoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000, 3_600_000);
}

// ─── FILES / OBJECT STORAGE ──────────────────────────────────

export type FileKind = "upload" | "export" | "screenshot" | "artifact";

export interface StoredFile {
  id: string;
  user_id: string | null;
  run_id: string | null;
  kind: FileKind;
  filename: string;
  content_type: string;
  size_bytes: number;
  /** Object storage path, not a public URL. Signed on demand. */
  storage_path: string;
  expires_at: string | null;
  created_at: string;
}
