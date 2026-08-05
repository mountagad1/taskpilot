// ============================================================
// TASKPILOT API — PLATFORM ROUTES
// services/api/src/routes/platform.ts
//
// Notifications, developer API keys, teams, workflows, marketplace browse,
// analytics and exports.
// ============================================================

import { Hono } from "hono";
import {
  API_KEY_PREFIX,
  API_SCOPES,
  TEAM_ROLE_RANK,
  slugify,
  type ApiScope,
  type TeamRole,
} from "@taskpilot/shared";

import { assertTeamMember } from "../lib/agents";
import { browseAgents } from "../lib/browse";
import { getAdminClient } from "../lib/clients";
import { nextCronRun, validateCron } from "../lib/cron";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  okList,
  planLimit,
  validationFailed,
} from "../lib/errors";
import { createApiKey, normaliseScopes } from "../lib/keys";
import { WORKFLOW_COLUMNS, parseWorkflowSteps } from "../lib/workflows";
import {
  caller,
  guard,
  optionalCaller,
  readJson,
  readOptionalJson,
  readPagination,
  query,
} from "../middleware/kernel";

// ─── MARKETPLACE ─────────────────────────────────────────────

export const marketplaceRoutes = new Hono();

/** Public: browsing is what turns a visitor into a user. */
marketplaceRoutes.get("/agents", guard({ auth: false, rateLimit: 120 }), async (c) => {
  const { items, meta } = await browseAgents(getAdminClient(), c);
  return okList(items, meta);
});

marketplaceRoutes.get("/agents/:slug", guard({ auth: false, rateLimit: 120 }), async (c) => {
  const { data } = await getAdminClient()
    .from("marketplace_agents")
    .select(
      "id, slug, name, tagline, description, category, capabilities, price_cents, currency, version, owner_id, install_count, run_count, sales_count, rating_avg, rating_count, created_at"
    )
    .eq("slug", c.req.param("slug"))
    .eq("status", "listed")
    .eq("visibility", "public")
    .maybeSingle();

  if (!data) throw notFound("Agent not found");

  // Entitlement is only known for a signed-in caller; anonymous visitors see
  // the listing and the buy button.
  const me = optionalCaller(c);
  let owned = false;

  if (me) {
    const admin = getAdminClient();
    const [{ data: purchase }, { data: install }] = await Promise.all([
      admin
        .from("agent_purchases")
        .select("id")
        .eq("agent_id", data.id)
        .eq("buyer_id", me.userId)
        .eq("status", "completed")
        .maybeSingle(),
      admin
        .from("agent_installs")
        .select("id")
        .eq("agent_id", data.id)
        .eq("user_id", me.userId)
        .maybeSingle(),
    ]);
    owned = Boolean(purchase || install);
  }

  return ok({ ...data, owned, viewer_id: me?.userId ?? null });
});

// ─── NOTIFICATIONS ───────────────────────────────────────────

export const notificationRoutes = new Hono();

notificationRoutes.get("/", guard({ rateLimit: 240 }), async (c) => {
  const me = caller(c);
  const { from, to, page, perPage } = readPagination(c, 20);

  let request = me.db
    .from("notifications")
    .select("id, type, title, body, link, metadata, read_at, created_at", { count: "exact" })
    .eq("user_id", me.userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query(c, "unread") === "true") request = request.is("read_at", null);

  const [{ data, error, count }, unread] = await Promise.all([
    request,
    me.db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.userId)
      .is("read_at", null),
  ]);

  if (error) throw badRequest(error.message);

  // The unread count rides along so the badge needs no second round trip.
  return okList(data ?? [], {
    total: count ?? 0,
    page,
    per_page: perPage,
    unread: unread.count ?? 0,
  });
});

notificationRoutes.post("/read", guard({ rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const body = await readOptionalJson(c);
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string")
    : null;

  if (!ids) {
    const { data, error } = await getAdminClient().rpc("mark_notifications_read", {
      target_user: me.userId,
    });
    if (error) throw badRequest(error.message);
    return ok({ marked: data ?? 0 });
  }

  if (!ids.length) return ok({ marked: 0 });

  const { error, count } = await me.db
    .from("notifications")
    .update({ read_at: new Date().toISOString() }, { count: "exact" })
    .eq("user_id", me.userId)
    .is("read_at", null)
    .in("id", ids.slice(0, 200));

  if (error) throw badRequest(error.message);
  return ok({ marked: count ?? 0 });
});

// ─── API KEYS ────────────────────────────────────────────────

export const keyRoutes = new Hono();

/** Keys are a paid capability; free accounts get none. */
const KEY_ALLOWANCE: Record<string, number> = { free: 0, pro: 5, enterprise: 50 };

// Session-only throughout: a key must never be able to mint or enumerate
// other keys, or one leaked credential becomes permanent, self-renewing access.
keyRoutes.get("/", guard({ allow: ["session"], rateLimit: 60 }), async (c) => {
  const me = caller(c);

  const { data, error } = await me.db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
    .eq("user_id", me.userId)
    .order("created_at", { ascending: false });

  if (error) throw badRequest(error.message);
  return okList(data ?? []);
});

keyRoutes.post("/", guard({ allow: ["session"], rateLimit: 20 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    throw validationFailed([{ path: "name", message: "Give the key a name (1-80 characters)" }]);
  }

  const scopes = normaliseScopes(body.scopes);
  if (!scopes.length) {
    throw validationFailed([
      { path: "scopes", message: `Grant at least one scope. Available: ${API_SCOPES.join(", ")}` },
    ]);
  }

  const allowance = KEY_ALLOWANCE[me.plan] ?? 0;
  if (allowance === 0) throw planLimit("API keys are available on the Pro plan and above.");

  const { count } = await me.db
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me.userId)
    .is("revoked_at", null);

  if ((count ?? 0) >= allowance) {
    throw planLimit(`Your plan allows ${allowance} active API keys. Revoke one to create another.`);
  }

  let expiresAt: string | null = null;
  if (body.expires_in_days !== undefined) {
    const days = Number(body.expires_in_days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      throw validationFailed([{ path: "expires_in_days", message: "Must be between 1 and 3650" }]);
    }
    expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  const generated = await createApiKey();

  const { data, error } = await me.db
    .from("api_keys")
    .insert({
      user_id: me.userId,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      expires_at: expiresAt,
    })
    .select("id, name, key_prefix, scopes, expires_at, created_at")
    .single();

  if (error) throw badRequest(error.message);

  return ok(
    {
      ...data,
      // The only moment this value exists outside the caller's own storage.
      key: generated.key,
      warning: `Copy this key now — it is not recoverable. All TaskPilot keys start with ${API_KEY_PREFIX}`,
    },
    { status: 201 }
  );
});

/** Revokes rather than deletes, so usage history stays attributable. */
keyRoutes.delete("/:id", guard({ allow: ["session"], rateLimit: 30 }), async (c) => {
  const me = caller(c);

  const { data, error } = await me.db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", c.req.param("id"))
    .eq("user_id", me.userId)
    .is("revoked_at", null)
    .select("id, name, revoked_at")
    .maybeSingle();

  if (error) throw badRequest(error.message);
  if (!data) throw notFound("Key not found, or it was already revoked");

  return ok(data);
});

// ─── TEAMS ───────────────────────────────────────────────────

export const teamRoutes = new Hono();

const SEATS_BY_PLAN: Record<string, number> = { free: 3, pro: 10, enterprise: 200 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

teamRoutes.get("/", guard({ rateLimit: 60 }), async (c) => {
  const me = caller(c);

  const { data, error } = await me.db
    .from("team_members")
    .select("role, joined_at, team:teams(id, name, slug, plan, seats, owner_id, created_at)")
    .eq("user_id", me.userId);

  if (error) throw badRequest(error.message);

  const teams = (data ?? []).map((row) => {
    const team = Array.isArray(row.team) ? row.team[0] : row.team;
    return { ...team, role: row.role, joined_at: row.joined_at };
  });

  return okList(teams);
});

teamRoutes.post("/", guard({ rateLimit: 10 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);
  const name = String(body.name ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    throw validationFailed([{ path: "name", message: "Team name must be 2-80 characters" }]);
  }
  if (me.plan === "free") throw planLimit("Teams are available on the Pro plan and above.");

  const admin = getAdminClient();
  const base = slugify(name);
  let slug = base;

  // Slugs are globally unique; suffix until one is free.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: taken } = await admin.from("teams").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data, error } = await admin
    .from("teams")
    .insert({
      name,
      slug,
      owner_id: me.userId,
      plan: me.plan,
      seats: SEATS_BY_PLAN[me.plan] ?? 3,
    })
    .select("id, name, slug, plan, seats, owner_id, created_at")
    .single();

  if (error) throw badRequest(error.message);
  // The add_team_owner trigger already inserted the membership row.
  return ok({ ...data, role: "owner" }, { status: 201 });
});

teamRoutes.get("/:id/members", guard({ rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const teamId = c.req.param("id");
  await assertTeamMember(me, teamId);

  const { data, error } = await getAdminClient()
    .from("team_members")
    .select("id, user_id, role, joined_at, profile:profiles(email, name, avatar_url)")
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });

  if (error) throw badRequest(error.message);
  return okList(data ?? []);
});

teamRoutes.patch("/:id/members", guard({ rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const teamId = c.req.param("id");
  const role = await assertTeamMember(me, teamId);

  if (!["owner", "admin"].includes(role)) throw forbidden("Only admins can change roles");

  const body = await readJson(c);
  const userId = String(body.user_id ?? "");
  const nextRole = String(body.role ?? "") as TeamRole;

  if (!userId) throw validationFailed([{ path: "user_id", message: "Required" }]);
  if (!(nextRole in TEAM_ROLE_RANK)) {
    throw validationFailed([
      { path: "role", message: `Must be one of: ${Object.keys(TEAM_ROLE_RANK).join(", ")}` },
    ]);
  }

  const admin = getAdminClient();
  const { data: team } = await admin.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) throw notFound("Team not found");

  // The owner row anchors the team; demoting it would leave the team
  // unmanageable, and only the owner may hand the role on.
  if (team.owner_id === userId && nextRole !== "owner") {
    throw forbidden("Transfer ownership before changing the owner role");
  }
  if (nextRole === "owner" && me.userId !== team.owner_id) {
    throw forbidden("Only the current owner can grant ownership");
  }

  const { data, error } = await admin
    .from("team_members")
    .update({ role: nextRole })
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .select("id, user_id, role")
    .maybeSingle();

  if (error) throw badRequest(error.message);
  if (!data) throw badRequest("That user is not a member of this team");

  return ok(data);
});

teamRoutes.delete("/:id/members", guard({ rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const teamId = c.req.param("id");
  const role = await assertTeamMember(me, teamId);
  const targetId = query(c, "user_id") ?? me.userId;

  const removingSelf = targetId === me.userId;
  if (!removingSelf && !["owner", "admin"].includes(role)) {
    throw forbidden("Only admins can remove other members");
  }

  const admin = getAdminClient();
  const { data: team } = await admin.from("teams").select("owner_id").eq("id", teamId).maybeSingle();

  if (team?.owner_id === targetId) {
    throw forbidden("The owner cannot be removed. Transfer ownership or delete the team.");
  }

  const { error } = await admin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", targetId);

  if (error) throw badRequest(error.message);
  return ok({ removed: targetId });
});

teamRoutes.get("/:id/invites", guard({ rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const teamId = c.req.param("id");
  const role = await assertTeamMember(me, teamId);

  if (!["owner", "admin"].includes(role)) throw forbidden("Only admins can see pending invites");

  const { data, error } = await getAdminClient()
    .from("team_invites")
    .select("id, email, role, expires_at, accepted_at, created_at")
    .eq("team_id", teamId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw badRequest(error.message);
  return okList(data ?? []);
});

teamRoutes.post("/:id/invites", guard({ rateLimit: 30 }), async (c) => {
  const me = caller(c);
  const teamId = c.req.param("id");
  const role = await assertTeamMember(me, teamId);

  if (!["owner", "admin"].includes(role)) throw forbidden("Only admins can invite people");

  const body = await readJson(c);
  const email = String(body.email ?? "").trim().toLowerCase();
  const inviteRole = (body.role ?? "member") as TeamRole;

  if (!EMAIL_RE.test(email)) {
    throw validationFailed([{ path: "email", message: "Enter a valid email address" }]);
  }
  if (!(inviteRole in TEAM_ROLE_RANK)) {
    throw validationFailed([{ path: "role", message: "Unknown role" }]);
  }
  // An admin cannot mint an owner; ownership transfers explicitly.
  if (inviteRole === "owner") throw forbidden("Ownership cannot be granted by invitation");

  const admin = getAdminClient();

  // Refuse early when the team is already full, so the invite does not fail
  // confusingly at accept time.
  const [{ data: team }, { count: used }] = await Promise.all([
    admin.from("teams").select("seats, name").eq("id", teamId).maybeSingle(),
    admin.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId),
  ]);

  if (!team) throw notFound("Team not found");
  if ((used ?? 0) >= team.seats) {
    throw conflict(`This team has no seats left (${team.seats}). Remove a member or upgrade.`);
  }

  const { data, error } = await admin
    .from("team_invites")
    .insert({ team_id: teamId, email, role: inviteRole, invited_by: me.userId })
    .select("id, email, role, token, expires_at")
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw conflict("There is already a pending invite for that address");
    }
    throw badRequest(error.message);
  }

  // If the invitee already has an account, surface it in-app immediately.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    await admin.rpc("notify_user", {
      target_user: existing.id,
      kind: "team_invite",
      subject: `You have been invited to ${team.name}`,
      message: `Join as ${inviteRole}.`,
      deep_link: `/dashboard/teams?token=${data.token}`,
    });
  }

  return ok(data, { status: 201 });
});

teamRoutes.post("/invites/accept", guard({ rateLimit: 20 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);
  const token = String(body.token ?? "").trim();

  if (!token) throw badRequest("An invite token is required");

  const admin = getAdminClient();

  const { data: invite } = await admin
    .from("team_invites")
    .select("id, team_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) throw badRequest("That invite link is not valid");
  if (invite.accepted_at) throw conflict("This invite has already been used");
  if (new Date(invite.expires_at) < new Date()) throw badRequest("This invite has expired");

  // The invite is addressed to a specific person, so a leaked link must not
  // let a different account join.
  if (invite.email.toLowerCase() !== me.email.toLowerCase()) {
    throw forbidden("This invite was issued to a different email address");
  }

  const { error: memberError } = await admin
    .from("team_members")
    .insert({ team_id: invite.team_id, user_id: me.userId, role: invite.role });

  if (memberError) {
    if (/no seats left/i.test(memberError.message)) {
      throw conflict("This team has no seats left. Ask an admin to free one up.");
    }
    if (/duplicate|unique/i.test(memberError.message)) {
      throw conflict("You are already a member of this team");
    }
    throw badRequest(memberError.message);
  }

  await admin
    .from("team_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: team } = await admin
    .from("teams")
    .select("id, name, slug")
    .eq("id", invite.team_id)
    .maybeSingle();

  return ok({ team, role: invite.role });
});

// ─── WORKFLOWS ───────────────────────────────────────────────

export const workflowRoutes = new Hono();

workflowRoutes.get("/", guard({ scopes: ["workflows:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const { from, to, page, perPage } = readPagination(c);

  const { data, error, count } = await me.db
    .from("workflows")
    .select(WORKFLOW_COLUMNS, { count: "exact" })
    .eq("user_id", me.userId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) throw badRequest(error.message);
  return okList(data ?? [], { total: count ?? 0, page, per_page: perPage });
});

workflowRoutes.post("/", guard({ scopes: ["workflows:write"], rateLimit: 30 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    throw validationFailed([{ path: "name", message: "Name must be 2-120 characters" }]);
  }

  const steps = parseWorkflowSteps(body.steps);

  const triggerType = String(body.trigger_type ?? "manual");
  if (!["manual", "url_match", "schedule"].includes(triggerType)) {
    throw validationFailed([
      { path: "trigger_type", message: "Must be manual, url_match or schedule" },
    ]);
  }

  let cron: string | null = null;
  let nextRunAt: string | null = null;

  if (triggerType === "schedule") {
    // Scheduled workflows run on TaskPilot's infrastructure rather than in
    // the user's browser, so they are a paid capability.
    if (me.plan === "free") {
      throw planLimit("Scheduled workflows are available on the Pro plan and above.");
    }

    cron = String(body.schedule_cron ?? "").trim();
    const issue = validateCron(cron);
    if (issue) throw validationFailed([{ path: "schedule_cron", message: issue }]);

    nextRunAt = nextCronRun(cron).toISOString();
  }

  const { data, error } = await me.db
    .from("workflows")
    .insert({
      user_id: me.userId,
      team_id: body.team_id ?? null,
      agent_id: body.agent_id ?? null,
      name,
      description: typeof body.description === "string" ? body.description.slice(0, 2000) : null,
      trigger_type: triggerType,
      trigger_config: body.trigger_config ?? {},
      steps,
      schedule_cron: cron,
      next_run_at: nextRunAt,
    })
    .select(WORKFLOW_COLUMNS)
    .single();

  if (error) throw badRequest(error.message);
  return ok(data, { status: 201 });
});

workflowRoutes.get("/:id", guard({ scopes: ["workflows:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);

  const { data } = await me.db
    .from("workflows")
    .select(WORKFLOW_COLUMNS)
    .eq("id", c.req.param("id"))
    .eq("user_id", me.userId)
    .maybeSingle();

  if (!data) throw notFound("Workflow not found");
  return ok(data);
});

workflowRoutes.patch("/:id", guard({ scopes: ["workflows:write"], rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const body = await readJson(c);
  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 2000);
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.trigger_config !== undefined) patch.trigger_config = body.trigger_config;
  if (body.steps !== undefined) patch.steps = parseWorkflowSteps(body.steps);

  if (body.schedule_cron !== undefined) {
    const cron = body.schedule_cron === null ? null : String(body.schedule_cron).trim();
    if (cron) {
      const issue = validateCron(cron);
      if (issue) throw badRequest(issue);
      patch.schedule_cron = cron;
      // Recompute the next fire time whenever the expression changes, or the
      // worker keeps using the old schedule.
      patch.next_run_at = nextCronRun(cron).toISOString();
    } else {
      patch.schedule_cron = null;
      patch.next_run_at = null;
    }
  }

  if (!Object.keys(patch).length) throw badRequest("No editable fields were supplied");

  const { data, error } = await me.db
    .from("workflows")
    .update(patch)
    .eq("id", c.req.param("id"))
    .eq("user_id", me.userId)
    .select(WORKFLOW_COLUMNS)
    .maybeSingle();

  if (error) throw badRequest(error.message);
  if (!data) throw notFound("Workflow not found");
  return ok(data);
});

workflowRoutes.delete("/:id", guard({ scopes: ["workflows:write"], rateLimit: 30 }), async (c) => {
  const me = caller(c);

  const { error } = await me.db
    .from("workflows")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("user_id", me.userId);

  if (error) throw badRequest(error.message);
  return ok({ deleted: true });
});
