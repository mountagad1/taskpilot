// ============================================================
// TASKPILOT API — OAUTH INTEGRATIONS
// services/api/src/routes/integrations.ts
//
// The authorization-code flow, and the token lifecycle after it.
//
// The callback is the awkward part of OAuth: it arrives as a top-level
// browser navigation from the provider, so it carries no Authorization
// header and no cookie this service would trust. The `state` parameter is
// therefore the entire binding between the callback and the user who
// started the flow — which is why it is random, single-use, expiring, and
// compared in constant time.
// ============================================================

import { Hono } from "hono";

import {
  ok,
  okList,
  badRequest,
  notFound,
  forbidden,
  conflict,
  notConfigured,
  ApiError,
} from "../lib/errors";
import { guard, caller, readJson, query } from "../middleware/kernel";
import { getAdminClient, hasSupabaseCredentials } from "../lib/clients";
import {
  encryptSecret,
  decryptSecret,
  hasEncryptionKey,
  randomToken,
  safeCompare,
} from "../lib/crypto";
import * as hubspot from "../lib/oauth/hubspot";

export const integrationRoutes = new Hono();

/** Providers with a working implementation. The enum in the database is wider. */
const SUPPORTED = new Set(["hubspot"]);

/** An authorization that is not completed within this window is abandoned. */
const STATE_TTL_SECONDS = 600;

function assertSupported(provider: string): string {
  const id = provider.toLowerCase();
  if (!SUPPORTED.has(id)) {
    throw badRequest(
      `${provider} is not available yet. Implemented providers: ${[...SUPPORTED].join(", ")}.`
    );
  }
  return id;
}

/**
 * Where the provider sends the browser back. It must byte-match the URI
 * registered on the HubSpot app, so it is configuration rather than
 * something derived from the incoming request — behind a proxy the request
 * URL is frequently not the public one.
 */
function redirectUri(provider: string): string {
  const explicit = process.env.OAUTH_REDIRECT_BASE_URL;
  const base = explicit ?? process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return `${base.replace(/\/+$/, "")}/v1/integrations/${provider}/callback`;
}

/**
 * Only allow the browser to be returned to an origin we control. Reflecting
 * an arbitrary `return_to` would make this endpoint an open redirect, which
 * is a phishing primitive: a link on our domain that lands on theirs.
 */
function safeReturnTo(candidate: string | null): string | null {
  if (!candidate) return null;

  const appOrigin = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  // Resolve everything — relative or absolute — against the dashboard
  // origin, then check the result. Deciding on the raw string invites
  // protocol-relative tricks: browsers treat a backslash as a slash when
  // resolving, so "/\evil.example/steal" is NOT a same-origin path even
  // though it starts with a single "/". Letting the URL parser normalise
  // first, and judging only the resulting origin, removes that whole class
  // of bypass rather than blacklisting the spellings we thought of.
  let url: URL;
  try {
    url = new URL(candidate, `${appOrigin}/`);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const allowed = [
    process.env.PUBLIC_APP_URL,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()),
  ].filter(Boolean) as string[];

  const permitted = allowed.some((origin) => {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  });

  if (permitted) return url.toString();

  // Loopback is a development convenience. In production it is a redirect
  // to an arbitrary port on the victim's own machine, which is a real
  // target where a local service is listening.
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (isLoopback && process.env.NODE_ENV !== "production") return url.toString();

  return null;
}

function appUrl(path: string): string {
  const base = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

// ─── LIST ────────────────────────────────────────────────────

integrationRoutes.get("/", guard({ rateLimit: 60 }), async (c) => {
  const me = caller(c);

  // Explicit column list: tokens must never leave this service, and
  // `select("*")` would start returning them the moment a column is added.
  const { data, error } = await me.db
    .from("integrations")
    .select(
      "id, provider, workspace_id, workspace_name, scopes, expires_at, connected_at, last_used_at, last_refreshed_at, refresh_error"
    )
    .eq("user_id", me.userId)
    .order("connected_at", { ascending: false });

  if (error) throw badRequest(error.message);

  const connections = (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    workspace_id: row.workspace_id,
    workspace_name: row.workspace_name,
    scopes: row.scopes ?? [],
    connected_at: row.connected_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    // The dashboard needs to distinguish "connected" from "connected but
    // the grant died", so it can prompt for a reconnect instead of letting
    // every run fail.
    needs_reconnect: Boolean(row.refresh_error),
  }));

  return okList(connections, {
    total: connections.length,
    available: [...SUPPORTED],
  });
});

// ─── START AUTHORIZATION ─────────────────────────────────────

integrationRoutes.post("/:provider/authorize", guard({ allow: ["session"], rateLimit: 20 }), async (c) => {
  const provider = assertSupported(c.req.param("provider"));
  const me = caller(c);

  // Fail before sending the user to a consent screen we cannot honour.
  if (!hasEncryptionKey()) {
    throw notConfigured(
      "INTEGRATION_ENCRYPTION_KEY is not set, so an OAuth token could not be stored securely. " +
        "Refusing to start a flow whose result cannot be saved."
    );
  }
  hubspot.hubspotCredentials(); // throws not_configured with the exact variables

  const body = await readJson(c).catch(() => ({}) as Record<string, unknown>);

  // An empty array is not a request for "no scopes" — it is a caller that
  // built the field and left it blank. Treating it as an override sends the
  // user to a consent screen granting nothing, which succeeds and then
  // fails confusingly on the first push.
  const requestedScopes =
    Array.isArray(body.scopes) && body.scopes.length > 0 ? (body.scopes as string[]) : undefined;
  const returnTo = safeReturnTo(typeof body.return_to === "string" ? body.return_to : null);

  const state = randomToken(32);
  const uri = redirectUri(provider);

  const admin = getAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    state,
    user_id: me.userId,
    provider,
    redirect_uri: uri,
    return_to: returnTo,
    expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
  });

  if (error) throw badRequest(`Could not start the authorization: ${error.message}`);

  return ok({
    authorize_url: hubspot.buildAuthorizeUrl({
      redirectUri: uri,
      state,
      scopes: requestedScopes,
    }),
    state,
    expires_in: STATE_TTL_SECONDS,
    redirect_uri: uri,
  });
});

// ─── CALLBACK ────────────────────────────────────────────────

/**
 * Deliberately unauthenticated: this is a redirect from the provider, so
 * there is no credential to present. `state` is what proves the flow was
 * one we started, and for whom.
 *
 * Failures redirect to the dashboard with a reason rather than rendering
 * JSON — the user is sitting in a browser, not reading a response body.
 */
integrationRoutes.get("/:provider/callback", async (c) => {
  // Defined before anything that can fail. This route's contract is that it
  // ALWAYS redirects — a person is sitting in a browser, and a JSON error
  // body is a dead end for them. Validating the provider first would throw
  // an ApiError and render exactly that.
  const fail = (reason: string) =>
    c.redirect(`${appUrl("/dashboard/integrations")}?error=${encodeURIComponent(reason)}`);

  const requested = c.req.param("provider").toLowerCase();
  if (!SUPPORTED.has(requested)) return fail(`${requested} is not an available integration`);
  const provider = requested;

  if (!hasSupabaseCredentials()) return fail("This deployment has no database configured");

  const presentedState = query(c, "state");
  const code = query(c, "code");
  const providerError = query(c, "error");

  // The user pressed "Deny", or HubSpot refused. Not an error condition on
  // our side, so it must not look like one.
  if (providerError) {
    return fail(query(c, "error_description") ?? providerError);
  }

  if (!presentedState || !code) return fail("The callback was missing its state or code");

  const admin = getAdminClient();

  const { data: stored } = await admin
    .from("oauth_states")
    .select("state, user_id, provider, redirect_uri, return_to, expires_at, consumed_at")
    .eq("state", presentedState)
    .maybeSingle();

  if (!stored) return fail("This authorization request is not recognised");

  // Constant-time even though the row was found by equality: the lookup
  // above is the database's business, this is ours.
  if (!safeCompare(stored.state, presentedState)) return fail("State mismatch");
  if (stored.provider !== provider) return fail("State was issued for a different provider");
  if (stored.consumed_at) return fail("This authorization link has already been used");
  if (new Date(stored.expires_at).getTime() < Date.now()) {
    return fail("This authorization request expired. Please try connecting again.");
  }

  // Burn the state before the exchange. If the exchange fails the user
  // restarts the flow; leaving it live would allow a replay.
  const { data: claimed, error: claimError } = await admin
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", presentedState)
    .is("consumed_at", null)
    .select("state")
    .maybeSingle();

  // A database fault and a lost race both leave `claimed` null, but they
  // need opposite advice: one is "try again", the other is "you cannot".
  // Reporting a transient fault as "already used" sends the user hunting
  // for a problem that is not theirs, and the state is in fact still live.
  if (claimError) return fail(`Could not complete the authorization: ${claimError.message}`);

  // Lost the race against a concurrent callback with the same state.
  if (!claimed) return fail("This authorization link has already been used");

  try {
    const tokens = await hubspot.exchangeCode({ code, redirectUri: stored.redirect_uri });
    const identity = await hubspot.identify(tokens.accessToken);

    // onConflict on (user_id, provider) matches the unique index from 001,
    // so reconnecting replaces the old grant rather than erroring.
    const { error } = await admin.from("integrations").upsert(
      {
        user_id: stored.user_id,
        provider,
        access_token: encryptSecret(tokens.accessToken),
        refresh_token: encryptSecret(tokens.refreshToken),
        token_encrypted: true,
        expires_at: tokens.expiresAt.toISOString(),
        workspace_id: identity.hubId || null,
        workspace_name: identity.hubDomain,
        scopes: identity.scopes,
        connected_at: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
        refresh_error: null,
        metadata: { user: identity.user },
      },
      { onConflict: "user_id,provider" }
    );

    if (error) return fail(`Could not save the connection: ${error.message}`);

    const destination = safeReturnTo(stored.return_to) ?? appUrl("/dashboard/integrations");
    const separator = destination.includes("?") ? "&" : "?";
    return c.redirect(`${destination}${separator}connected=${provider}`);
  } catch (err) {
    return fail(err instanceof ApiError ? err.message : "The token exchange failed");
  }
});

// ─── DISCONNECT ──────────────────────────────────────────────

integrationRoutes.delete("/:provider", guard({ allow: ["session"], rateLimit: 30 }), async (c) => {
  const provider = assertSupported(c.req.param("provider"));
  const me = caller(c);

  const { data, error } = await me.db
    .from("integrations")
    .delete()
    .eq("user_id", me.userId)
    .eq("provider", provider)
    .select("id")
    .maybeSingle();

  if (error) throw badRequest(error.message);
  if (!data) throw notFound(`No ${provider} connection to disconnect`);

  return ok({ disconnected: provider });
});

// ─── TOKEN LIFECYCLE ─────────────────────────────────────────

/**
 * Returns a usable access token, refreshing first when the stored one is
 * within the refresh margin of expiry.
 *
 * Exported because the run executor needs it too: `push_integration` must
 * not have to know how tokens are stored or when they turn over.
 */
export async function getValidAccessToken(
  userId: string,
  provider: string
): Promise<{ accessToken: string; scopes: string[] }> {
  const admin = getAdminClient();

  const { data: row } = await admin
    .from("integrations")
    .select("id, access_token, refresh_token, expires_at, scopes, token_encrypted")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (!row) {
    throw badRequest(`No ${provider} connection. Connect it at Dashboard → Integrations first.`);
  }

  if (!row.token_encrypted) {
    throw badRequest(
      `This ${provider} connection predates token encryption and must be reconnected.`
    );
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const marginMs = hubspot.REFRESH_MARGIN_SECONDS * 1000;

  if (expiresAt - marginMs > Date.now()) {
    return { accessToken: decryptSecret(row.access_token), scopes: row.scopes ?? [] };
  }

  // Expired or nearly so: refresh.
  try {
    const refreshed = await hubspot.refreshTokens(decryptSecret(row.refresh_token));

    await admin
      .from("integrations")
      .update({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: encryptSecret(refreshed.refreshToken),
        expires_at: refreshed.expiresAt.toISOString(),
        last_refreshed_at: new Date().toISOString(),
        refresh_error: null,
      })
      .eq("id", row.id);

    return { accessToken: refreshed.accessToken, scopes: row.scopes ?? [] };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "refresh failed";

    // Record why, so the dashboard can say "reconnect" instead of every
    // run failing with an unexplained 401.
    await admin.from("integrations").update({ refresh_error: reason }).eq("id", row.id);

    throw new ApiError(
      "unauthorized",
      `The ${provider} connection could not be refreshed and must be reconnected. (${reason})`
    );
  }
}

// ─── PUSH ────────────────────────────────────────────────────

/**
 * The bridge behind the `push_integration` capability. The extension
 * executor calls this rather than talking to HubSpot itself — the tokens
 * live here, and shipping them to a content script would put a CRM
 * credential inside every page the user visits.
 */
integrationRoutes.post("/:provider/push", guard({ scopes: ["runs:write"], rateLimit: 60 }), async (c) => {
  const provider = assertSupported(c.req.param("provider"));
  const me = caller(c);

  const body = await readJson(c);
  const records = (body.records ?? body.data ?? body.rows) as hubspot.ContactRecord[] | undefined;

  if (!Array.isArray(records) || records.length === 0) {
    throw badRequest("Provide a non-empty `records` array");
  }
  if (records.length > 1000) {
    throw badRequest("At most 1000 records per request");
  }

  const { accessToken, scopes } = await getValidAccessToken(me.userId, provider);

  // Check the granted scope before calling out. HubSpot's own error for
  // this is a bare 403 that does not say which scope is missing.
  if (scopes.length && !scopes.includes("crm.objects.contacts.write")) {
    throw forbidden(
      "This HubSpot connection was granted read-only access to contacts. " +
        "Reconnect and approve write access to push records."
    );
  }

  const result = await hubspot.pushContacts(accessToken, records);

  const admin = getAdminClient();
  await admin
    .from("integrations")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", me.userId)
    .eq("provider", provider);

  return ok(result);
});

// ─── STATUS ──────────────────────────────────────────────────

/** Whether this deployment can run the flow at all. Cheap health probe. */
integrationRoutes.get("/status", guard({ auth: false }), (c) => {
  return ok({
    providers: [...SUPPORTED],
    hubspot: {
      credentials: hubspot.hasHubSpotCredentials(),
      encryption_key: hasEncryptionKey(),
      redirect_uri: redirectUri("hubspot"),
      scopes: hubspot.HUBSPOT_DEFAULT_SCOPES,
    },
  });
});
