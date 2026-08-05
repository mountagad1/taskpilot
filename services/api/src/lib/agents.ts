// ============================================================
// TASKPILOT — AGENT REGISTRY SERVICE
// services/api/src/lib/agents.ts
//
// Shared logic behind both the app routes (/api/agents) and the public
// developer API (/api/v1/agents), so the two can never drift on what
// publishing or installing actually means.
// ============================================================

import {
  AGENT_CATEGORIES,
  AGENT_MANIFEST_SCHEMA,
  DEFAULT_HARNESS,
  bumpPatch,
  compareVersions,
  parseAgentManifest,
  slugify,
  type AgentCategory,
  type AgentManifest,
  capabilitiesForPlan,
  gateCapabilities,
  type BrowserActionType,
} from "@taskpilot/shared";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminClient } from "./clients";
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  planLimit,
  validationFailed,
} from "./errors";
import type { Caller } from "../middleware/kernel";
import { asRow, type AgentRow } from "./rows";

export const AGENT_COLUMNS =
  "id, owner_id, team_id, slug, name, tagline, description, category, capabilities, " +
  "price_cents, currency, status, visibility, version, goal, min_plan, " +
  "install_count, run_count, sales_count, rating_avg, rating_count, created_at, updated_at";

// ─── CREATE ──────────────────────────────────────────────────

export interface CreateAgentInput {
  name: string;
  goal: string;
  tagline?: string;
  description?: string;
  category?: string;
  capabilities?: string[];
  price_cents?: number;
  visibility?: string;
  team_id?: string;
}

export async function createAgent(caller: Caller, input: CreateAgentInput) {
  const issues: Array<{ path: string; message: string }> = [];

  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    issues.push({ path: "name", message: "Name must be between 2 and 120 characters" });
  }

  const goal = String(input.goal ?? "").trim();
  if (goal.length < 4 || goal.length > 2000) {
    issues.push({ path: "goal", message: "Describe what the agent should achieve (4-2000 characters)" });
  }

  const category = (input.category ?? "automation") as AgentCategory;
  if (!AGENT_CATEGORIES.includes(category)) {
    issues.push({ path: "category", message: `Must be one of: ${AGENT_CATEGORIES.join(", ")}` });
  }

  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  if (!capabilities.length) {
    issues.push({ path: "capabilities", message: "Pick at least one capability" });
  }

  const priceCents = Math.round(Number(input.price_cents ?? 0));
  if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 100_000_00) {
    issues.push({ path: "price_cents", message: "Price must be between 0 and 10000000 cents" });
  }

  const visibility = String(input.visibility ?? "private");
  if (!["private", "team", "public"].includes(visibility)) {
    issues.push({ path: "visibility", message: "Must be private, team or public" });
  }
  if (visibility === "private" && priceCents > 0) {
    issues.push({ path: "price_cents", message: "A private agent cannot have a price" });
  }
  if (visibility === "team" && !input.team_id) {
    issues.push({ path: "team_id", message: "A team-visible agent needs a team" });
  }

  // An author cannot grant their agent capabilities their own plan forbids.
  const { blocked } = gateCapabilities(capabilities as BrowserActionType[], caller.plan);
  if (blocked.length) {
    throw planLimit(
      `Your ${caller.plan} plan cannot use: ${blocked.join(", ")}. Upgrade to include them.`
    );
  }

  if (issues.length) throw validationFailed(issues);

  if (input.team_id) await assertTeamMember(caller, input.team_id);

  const slug = await uniqueSlug(name);

  const { data, error } = await caller.db
    .from("marketplace_agents")
    .insert({
      owner_id: caller.userId,
      team_id: input.team_id ?? null,
      slug,
      name,
      goal,
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      category,
      capabilities,
      price_cents: priceCents,
      visibility,
      status: "draft",
    })
    .select(AGENT_COLUMNS)
    .single();

  if (error) throw badRequest(error.message);
  return asRow<AgentRow>(data);
}

/** Appends a short suffix until the slug is free. */
async function uniqueSlug(name: string): Promise<string> {
  const admin = getAdminClient();
  const base = slugify(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await admin
      .from("marketplace_agents")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

// ─── PUBLISH ─────────────────────────────────────────────────

export interface PublishInput {
  version?: string;
  changelog?: string;
  manifest?: unknown;
  /** Move the listing to `listed` after publishing. */
  list?: boolean;
}

export async function publishAgent(caller: Caller, agentId: string, input: PublishInput) {
  const agent = await loadOwnedAgent(caller, agentId);

  // Callers may supply a full manifest, or let the registry derive one from
  // the listing — the common case for the no-code studio.
  const candidate = input.manifest ?? buildManifestFromAgent(agent, input.version);

  const parsed = parseAgentManifest(candidate);
  if (!parsed.ok) throw validationFailed(parsed.issues, "The agent manifest is not valid");

  const manifest = parsed.value;

  // The manifest must not claim capabilities the listing never declared:
  // buyers read the listing, so that is what they consented to.
  const declared = new Set<string>(agent.capabilities ?? []);
  const undeclared = manifest.capabilities.filter((c) => !declared.has(c));
  if (undeclared.length) {
    throw validationFailed(
      undeclared.map((c) => ({
        path: "capabilities",
        message: `"${c}" is not listed on the agent`,
      })),
      "The manifest requests capabilities the listing does not declare"
    );
  }

  const nextVersion = resolveNextVersion(agent.version, input.version ?? manifest.version);
  if (compareVersions(nextVersion, agent.version) <= 0) {
    throw conflict(
      `Version ${nextVersion} is not newer than the current ${agent.version}. Bump the version to publish.`
    );
  }

  const admin = getAdminClient();
  const { error } = await admin.rpc("publish_agent_version", {
    agent_uuid: agentId,
    new_version: nextVersion,
    new_manifest: { ...manifest, version: nextVersion },
    note: input.changelog ?? null,
    author: caller.userId,
  });
  if (error) throw badRequest(error.message);

  if (input.list) {
    await admin.from("marketplace_agents").update({ status: "listed" }).eq("id", agentId);
    await admin.rpc("notify_user", {
      target_user: caller.userId,
      kind: "agent_published",
      subject: `${agent.name} is live`,
      message: `Version ${nextVersion} is now listed in the marketplace.`,
      deep_link: `/marketplace/${agent.slug}`,
    });
  }

  const { data } = await admin
    .from("agent_versions")
    .select("id, version, changelog, created_at")
    .eq("agent_id", agentId)
    .eq("is_current", true)
    .maybeSingle();

  return { agent_id: agentId, version: nextVersion, published: data };
}

function resolveNextVersion(current: string, requested?: string): string {
  if (requested && /^\d+\.\d+\.\d+$/.test(requested)) return requested;
  return bumpPatch(current || "1.0.0");
}

/** Derives a runnable manifest from the listing, for authors who never write one. */
export function buildManifestFromAgent(
  agent: {
    name: string;
    slug: string;
    version: string;
    description: string | null;
    tagline: string | null;
    category: string;
    capabilities: string[];
    goal: string | null;
    min_plan?: string;
  },
  version?: string
): AgentManifest {
  const capabilities = (agent.capabilities ?? []) as BrowserActionType[];

  return {
    schema: AGENT_MANIFEST_SCHEMA,
    name: agent.name,
    slug: agent.slug,
    version: version ?? agent.version ?? "1.0.0",
    description: agent.description ?? agent.tagline ?? "",
    category: agent.category as AgentCategory,
    goal: agent.goal ?? agent.tagline ?? agent.name,
    capabilities,
    harness: {
      ...DEFAULT_HARNESS,
      memory: { ...DEFAULT_HARNESS.memory, namespace: agent.slug },
      // Only gate on confirmation for capabilities the agent actually has,
      // so the install prompt doesn't list irrelevant warnings.
      require_confirmation: DEFAULT_HARNESS.require_confirmation.filter((c) =>
        capabilities.includes(c)
      ),
    },
    inputs: [],
    triggers: [{ type: "manual", surface: "sidebar" }],
    deploy: {
      targets: ["extension", "dashboard"],
      min_plan: (agent.min_plan as "free" | "pro" | "enterprise") ?? "free",
    },
  };
}

// ─── INSTALL ─────────────────────────────────────────────────

export async function installAgent(
  caller: Caller,
  agentId: string,
  settings: Record<string, unknown> = {}
) {
  const admin = getAdminClient();

  const { data: agent } = await admin
    .from("marketplace_agents")
    .select("id, name, slug, owner_id, status, visibility, price_cents, version, capabilities, min_plan, team_id")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) throw notFound("Agent not found");

  const isOwner = agent.owner_id === caller.userId;

  if (!isOwner) {
    if (agent.status !== "listed") throw forbidden("This agent is not available for install");
    if (agent.visibility === "private") throw forbidden("This agent is private");
    if (agent.visibility === "team") await assertTeamMember(caller, agent.team_id);
  }

  // A paid agent needs a completed purchase before it can be installed.
  if (!isOwner && agent.price_cents > 0) {
    const { data: purchase } = await admin
      .from("agent_purchases")
      .select("id")
      .eq("agent_id", agentId)
      .eq("buyer_id", caller.userId)
      .eq("status", "completed")
      .maybeSingle();

    if (!purchase) {
      throw new ApiError("payment_required", "Purchase this agent before installing it");
    }
  }

  const { blocked } = gateCapabilities((agent.capabilities ?? []) as BrowserActionType[], caller.plan);
  if (blocked.length) {
    throw planLimit(
      `This agent uses ${blocked.join(", ")}, which your ${caller.plan} plan does not include.`
    );
  }

  const { data: existing } = await admin
    .from("agent_installs")
    .select("id, version")
    .eq("agent_id", agentId)
    .eq("user_id", caller.userId)
    .maybeSingle();

  if (existing) {
    // Re-installing is how a user upgrades to the latest published version.
    const { data } = await admin
      .from("agent_installs")
      .update({ version: agent.version, settings, enabled: true })
      .eq("id", existing.id)
      .select("*")
      .single();
    return { install: data, upgraded_from: existing.version };
  }

  const { data, error } = await admin
    .from("agent_installs")
    .insert({ agent_id: agentId, user_id: caller.userId, version: agent.version, settings })
    .select("*")
    .single();

  if (error) throw badRequest(error.message);

  await admin.rpc("increment_agent_installs", { agent_uuid: agentId });

  // Tell the author someone picked it up — but not when they install it themselves.
  if (agent.owner_id && agent.owner_id !== caller.userId) {
    await admin.rpc("notify_user", {
      target_user: agent.owner_id,
      kind: "agent_installed",
      subject: `${agent.name} was installed`,
      message: "Someone just added your agent to their workspace.",
      deep_link: `/dashboard/agents/${agentId}`,
    });
  }

  return { install: data, upgraded_from: null };
}

export async function uninstallAgent(caller: Caller, agentId: string) {
  const { error } = await caller.db
    .from("agent_installs")
    .delete()
    .eq("agent_id", agentId)
    .eq("user_id", caller.userId);

  if (error) throw badRequest(error.message);
  return { uninstalled: true };
}

// ─── SHARED GUARDS ───────────────────────────────────────────

export async function loadOwnedAgent(caller: Caller, agentId: string) {
  const { data } = await getAdminClient()
    .from("marketplace_agents")
    .select(AGENT_COLUMNS)
    .eq("id", agentId)
    .maybeSingle();

  if (!data) throw notFound("Agent not found");
  const agent = asRow<AgentRow>(data);
  if (agent.owner_id !== caller.userId) throw forbidden("You do not own this agent");
  return agent;
}

export async function assertTeamMember(caller: Caller, teamId: string | null | undefined) {
  if (!teamId) throw badRequest("A team is required");

  const { data } = await getAdminClient()
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", caller.userId)
    .maybeSingle();

  if (!data) throw forbidden("You are not a member of this team");
  return data.role as string;
}
