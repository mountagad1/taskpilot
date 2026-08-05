// ============================================================
// TASKPILOT API — AGENT ROUTES
// services/api/src/routes/agents.ts
// ============================================================

import { Hono } from "hono";

import {
  AGENT_COLUMNS,
  createAgent,
  installAgent,
  loadOwnedAgent,
  publishAgent,
  uninstallAgent,
  type CreateAgentInput,
} from "../lib/agents";
import { badRequest, forbidden, notFound, ok, okList, validationFailed } from "../lib/errors";
import {
  caller,
  guard,
  optionalCaller,
  readJson,
  readOptionalJson,
  readPagination,
  query,
} from "../middleware/kernel";
import { getAdminClient } from "../lib/clients";

export const agentRoutes = new Hono();

/** Fields an owner may edit after creation. Anything else is ignored. */
const EDITABLE = [
  "name",
  "tagline",
  "description",
  "category",
  "capabilities",
  "price_cents",
  "goal",
  "visibility",
  "status",
] as const;

// ─── LIST / CREATE ───────────────────────────────────────────

agentRoutes.get("/", guard({ scopes: ["agents:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const { from, to, page, perPage } = readPagination(c);

  // `?installed=true` returns the caller's installs with the agent embedded,
  // which is what the library view needs in a single round trip.
  if (query(c, "installed") === "true") {
    const { data, error, count } = await me.db
      .from("agent_installs")
      .select(
        `id, agent_id, version, settings, enabled, installed_at, last_run_at, agent:marketplace_agents(${AGENT_COLUMNS})`,
        { count: "exact" }
      )
      .eq("user_id", me.userId)
      .order("installed_at", { ascending: false })
      .range(from, to);

    if (error) throw badRequest(error.message);
    return okList(data ?? [], { total: count ?? 0, page, per_page: perPage });
  }

  let request = me.db
    .from("marketplace_agents")
    .select(AGENT_COLUMNS, { count: "exact" })
    .eq("owner_id", me.userId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  const status = query(c, "status");
  if (status) request = request.eq("status", status);

  const { data, error, count } = await request;
  if (error) throw badRequest(error.message);

  return okList(data ?? [], { total: count ?? 0, page, per_page: perPage });
});

agentRoutes.post("/", guard({ scopes: ["agents:write"], rateLimit: 30 }), async (c) => {
  const body = await readJson(c);
  const agent = await createAgent(caller(c), body as unknown as CreateAgentInput);
  return ok(agent, { status: 201 });
});

// ─── SINGLE AGENT ────────────────────────────────────────────

agentRoutes.get("/:id", guard({ scopes: ["agents:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");

  const { data } = await me.db
    .from("marketplace_agents")
    .select(AGENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!data) throw notFound("Agent not found");

  const agent = data as unknown as Record<string, unknown>;
  const visibleToEveryone = agent.status === "listed" && agent.visibility === "public";

  // The service role bypasses RLS, so ownership is checked here instead.
  if (!visibleToEveryone && agent.owner_id !== me.userId) {
    throw notFound("Agent not found");
  }

  return ok(agent);
});

agentRoutes.patch("/:id", guard({ scopes: ["agents:write"], rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");

  const agent = await loadOwnedAgent(me, id);
  const body = await readJson(c);

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (field in body) patch[field] = body[field];
  }
  if (!Object.keys(patch).length) throw badRequest("No editable fields were supplied");

  // Guard the invariants the database also enforces, so the caller gets a
  // readable message rather than a raw constraint violation.
  const nextVisibility = (patch.visibility as string) ?? agent.visibility;
  const nextPrice = (patch.price_cents as number) ?? agent.price_cents;

  if (nextVisibility === "private" && nextPrice > 0) {
    throw badRequest("A private agent cannot have a price. Make it public first.");
  }
  if (patch.status === "listed" && nextVisibility !== "public") {
    throw badRequest("Only a public agent can be listed in the marketplace.");
  }

  const { data, error } = await me.db
    .from("marketplace_agents")
    .update(patch)
    .eq("id", id)
    .select(AGENT_COLUMNS)
    .single();

  if (error) throw badRequest(error.message);
  return ok(data);
});

agentRoutes.delete("/:id", guard({ scopes: ["agents:write"], rateLimit: 30 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");
  const agent = await loadOwnedAgent(me, id);

  // A sold agent is archived rather than deleted: buyers keep entitlement to
  // a manifest they paid for, and the purchase ledger must stay intact.
  if (agent.sales_count > 0) {
    const { error } = await me.db
      .from("marketplace_agents")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) throw badRequest(error.message);
    return ok({ archived: true, reason: "This agent has sales and cannot be deleted." });
  }

  const { error } = await me.db.from("marketplace_agents").delete().eq("id", id);
  if (error) throw badRequest(error.message);
  return ok({ deleted: true });
});

// ─── PUBLISH / VERSIONS ──────────────────────────────────────

agentRoutes.post("/:id/publish", guard({ scopes: ["agents:publish"], rateLimit: 20 }), async (c) => {
  const body = await readOptionalJson(c);
  const result = await publishAgent(caller(c), c.req.param("id"), body);
  return ok(result, { status: 201 });
});

agentRoutes.get("/:id/versions", guard({ scopes: ["agents:read"], rateLimit: 120 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");

  // Manifest bodies are excluded: this list must not become a way to
  // enumerate paid content.
  const { data, error } = await me.db
    .from("agent_versions")
    .select("id, version, changelog, is_current, created_at")
    .eq("agent_id", id)
    .order("created_at", { ascending: false });

  if (error) throw badRequest(error.message);
  return okList(data ?? []);
});

// ─── INSTALL ─────────────────────────────────────────────────

agentRoutes.post("/:id/install", guard({ scopes: ["agents:write"], rateLimit: 30 }), async (c) => {
  const body = await readOptionalJson(c);
  const settings = (body.settings as Record<string, unknown>) ?? {};
  const result = await installAgent(caller(c), c.req.param("id"), settings);
  return ok(result, { status: result.upgraded_from ? 200 : 201 });
});

agentRoutes.delete("/:id/install", guard({ scopes: ["agents:write"], rateLimit: 30 }), async (c) =>
  ok(await uninstallAgent(caller(c), c.req.param("id")))
);

// ─── MANIFEST ────────────────────────────────────────────────

/**
 * The manifest is the deliverable. Gated on ownership, a completed purchase,
 * or an install — a free agent is obtained by installing rather than buying.
 */
agentRoutes.get("/:id/manifest", guard({ scopes: ["agents:read"], rateLimit: 60 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");
  const admin = getAdminClient();

  const { data: agent } = await admin
    .from("marketplace_agents")
    .select("id, slug, name, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!agent) throw notFound("Agent not found");

  let entitled = agent.owner_id === me.userId;

  if (!entitled) {
    const [{ data: purchase }, { data: install }] = await Promise.all([
      admin
        .from("agent_purchases")
        .select("id")
        .eq("agent_id", id)
        .eq("buyer_id", me.userId)
        .eq("status", "completed")
        .maybeSingle(),
      admin
        .from("agent_installs")
        .select("id")
        .eq("agent_id", id)
        .eq("user_id", me.userId)
        .maybeSingle(),
    ]);
    entitled = Boolean(purchase || install);
  }

  if (!entitled) throw forbidden("Install or purchase this agent to download it");

  const requestedVersion = query(c, "version");

  let request = admin.from("agent_versions").select("version, manifest").eq("agent_id", id);
  request = requestedVersion
    ? request.eq("version", requestedVersion)
    : request.eq("is_current", true);

  const { data: row } = await request.maybeSingle();

  if (!row) {
    throw notFound(
      requestedVersion ? `Version ${requestedVersion} not found` : "This agent has no published version"
    );
  }

  return new Response(JSON.stringify(row.manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${agent.slug}@${row.version}.agent.json"`,
      "Cache-Control": "no-store",
    },
  });
});

// ─── REVIEWS ─────────────────────────────────────────────────

agentRoutes.get("/:id/reviews", guard({ auth: false, rateLimit: 120 }), async (c) => {
  const admin = getAdminClient();
  const { from, to, page, perPage } = readPagination(c, 20);

  const { data, error, count } = await admin
    .from("agent_reviews")
    .select("id, rating, title, body, created_at, user_id", { count: "exact" })
    .eq("agent_id", c.req.param("id"))
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw badRequest(error.message);
  return okList(data ?? [], { total: count ?? 0, page, per_page: perPage });
});

agentRoutes.post("/:id/reviews", guard({ scopes: ["agents:write"], rateLimit: 20 }), async (c) => {
  const me = caller(c);
  const id = c.req.param("id");
  const body = await readJson(c);
  const rating = Number(body.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw validationFailed([{ path: "rating", message: "Rating must be a whole number from 1 to 5" }]);
  }

  const admin = getAdminClient();

  const { data: agent } = await admin
    .from("marketplace_agents")
    .select("id, owner_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!agent) throw notFound("Agent not found");
  if (agent.owner_id === me.userId) throw forbidden("You cannot review your own agent");

  // A review should reflect experience, so require an install or a purchase.
  const [{ data: install }, { data: purchase }] = await Promise.all([
    admin.from("agent_installs").select("id").eq("agent_id", id).eq("user_id", me.userId).maybeSingle(),
    admin
      .from("agent_purchases")
      .select("id")
      .eq("agent_id", id)
      .eq("buyer_id", me.userId)
      .eq("status", "completed")
      .maybeSingle(),
  ]);

  if (!install && !purchase) throw forbidden("Install this agent before reviewing it");

  const { data, error } = await admin
    .from("agent_reviews")
    .upsert(
      {
        agent_id: id,
        user_id: me.userId,
        rating,
        title: typeof body.title === "string" ? body.title.slice(0, 200) : null,
        body: typeof body.body === "string" ? body.body.slice(0, 4000) : null,
      },
      { onConflict: "agent_id,user_id" }
    )
    .select("id, rating, title, body, created_at")
    .single();

  if (error) throw badRequest(error.message);

  if (agent.owner_id) {
    await admin.rpc("notify_user", {
      target_user: agent.owner_id,
      kind: "agent_review",
      subject: `New ${rating}-star review on ${agent.name}`,
      message: typeof body.title === "string" ? body.title.slice(0, 200) : null,
      deep_link: `/dashboard/agents/${id}`,
    });
  }

  return ok(data, { status: 201 });
});
