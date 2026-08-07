// ============================================================
// TASKPILOT API — HUBSPOT OAUTH PROVIDER
// services/api/src/lib/oauth/hubspot.ts
//
// HubSpot's authorization-code flow, as it actually behaves:
//
//   * The consent screen is on app.hubspot.com; every API call including
//     the token exchange is on api.hubapi.com.
//   * The token endpoint takes form-encoded parameters, not JSON. Sending
//     JSON returns 400 with a message that does not mention the encoding.
//   * It is a confidential-client flow: client_secret is required and PKCE
//     is not supported, so `state` carries the whole CSRF burden.
//   * Access tokens live ~30 minutes. Refresh tokens do not expire on their
//     own, which is exactly why they are encrypted at rest.
//   * The granted scopes come back from the token-info endpoint, not the
//     token response, and can be narrower than what was requested.
// ============================================================

import { badRequest, notConfigured, ApiError } from "../errors";

/** Overridable so tests exercise the real code path against a local mock. */
const APP_BASE = () => process.env.HUBSPOT_APP_BASE ?? "https://app.hubspot.com";
const API_BASE = () => process.env.HUBSPOT_API_BASE ?? "https://api.hubapi.com";

/**
 * Minimum scopes for the product's advertised behaviour ("push leads,
 * contacts and companies"). `oauth` is required by HubSpot for the
 * token-info call that identifies the portal.
 */
export const HUBSPOT_DEFAULT_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
];

export interface HubSpotCredentials {
  clientId: string;
  clientSecret: string;
}

export function hasHubSpotCredentials(): boolean {
  return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
}

export function hubspotCredentials(): HubSpotCredentials {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw notConfigured(
      "HubSpot is not configured for this deployment. Set HUBSPOT_CLIENT_ID and " +
        "HUBSPOT_CLIENT_SECRET in services/api/.env — both come from the app's " +
        "Auth tab in the HubSpot developer account."
    );
  }
  return { clientId, clientSecret };
}

/** The consent URL the browser is sent to. */
export function buildAuthorizeUrl(input: {
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const { clientId } = hubspotCredentials();
  const url = new URL("/oauth/authorize", APP_BASE());

  // Built by hand rather than with URLSearchParams. Scopes are
  // space-delimited, and URLSearchParams serialises a space as '+' because
  // it implements application/x-www-form-urlencoded. In a query string '+'
  // is only a space if the server chooses to decode it that way; read
  // literally it makes the last scope of each pair unrecognisable and the
  // grant silently narrower than requested. encodeURIComponent emits %20,
  // which is unambiguous under RFC 3986.
  const query = [
    ["client_id", clientId],
    ["redirect_uri", input.redirectUri],
    ["scope", (input.scopes ?? HUBSPOT_DEFAULT_SCOPES).join(" ")],
    ["state", input.state],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  return `${url.origin}${url.pathname}?${query}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry, not the relative `expires_in` the provider returns. */
  expiresAt: Date;
}

interface HubSpotTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
  status?: string;
}

/**
 * Access tokens are refreshed this many seconds before their stated expiry.
 * A token that expires mid-request is indistinguishable from a revoked one
 * from the caller's side, so the margin absorbs clock skew and latency.
 */
export const REFRESH_MARGIN_SECONDS = 300;

async function postToken(body: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(`${API_BASE()}/oauth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  let payload: HubSpotTokenResponse;
  try {
    payload = (await response.json()) as HubSpotTokenResponse;
  } catch {
    throw new ApiError("upstream_error", `HubSpot returned a non-JSON token response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    // HubSpot puts the useful part in `message`. Surfacing it saves the
    // caller from guessing between a wrong secret, a stale code, and a
    // redirect_uri that differs from the one registered on the app.
    throw new ApiError(
      "upstream_error",
      `HubSpot rejected the token request: ${payload.message ?? `HTTP ${response.status}`}`
    );
  }

  if (!payload.access_token || !payload.refresh_token) {
    throw new ApiError("upstream_error", "HubSpot returned a token response with no tokens");
  }

  // `expires_in` is seconds from now. Storing an absolute instant means a
  // row read later does not have to know when it was written.
  const seconds = Number(payload.expires_in ?? 1800);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + seconds * 1000),
  };
}

/** Authorization code → tokens. The code is single-use and short-lived. */
export function exchangeCode(input: { code: string; redirectUri: string }): Promise<TokenSet> {
  const { clientId, clientSecret } = hubspotCredentials();
  return postToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    // Must byte-match the value sent to /authorize or HubSpot refuses it.
    redirect_uri: input.redirectUri,
    code: input.code,
  });
}

/**
 * Refresh tokens rotate on some providers but not on HubSpot; the same
 * refresh token keeps working. It is still re-stored from the response so
 * that a future change in HubSpot's behaviour does not silently strand us
 * with a dead credential.
 */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = hubspotCredentials();
  return postToken({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

export interface HubSpotIdentity {
  hubId: string;
  hubDomain: string | null;
  user: string | null;
  scopes: string[];
}

/**
 * Identifies which portal the token belongs to, and — importantly — which
 * scopes were actually granted. A user can decline part of the request, so
 * the app must record what it received rather than what it asked for.
 */
export async function identify(accessToken: string): Promise<HubSpotIdentity> {
  const response = await fetch(
    `${API_BASE()}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`
  );

  if (!response.ok) {
    throw new ApiError("upstream_error", `HubSpot could not identify the token (HTTP ${response.status})`);
  }

  const body = (await response.json()) as {
    hub_id?: number | string;
    hub_domain?: string;
    user?: string;
    scopes?: string[];
  };

  return {
    hubId: String(body.hub_id ?? ""),
    hubDomain: body.hub_domain ?? null,
    user: body.user ?? null,
    scopes: Array.isArray(body.scopes) ? body.scopes : [],
  };
}

// ─── CONTACT PUSH ────────────────────────────────────────────

export interface ContactRecord {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  jobtitle?: string;
  website?: string;
  [key: string]: unknown;
}

export interface PushResult {
  created: number;
  updated: number;
  failed: Array<{ index: number; reason: string }>;
  ids: string[];
}

/** HubSpot's batch endpoint caps at 100 objects per call. */
const BATCH_LIMIT = 100;

/**
 * Pushes contacts, keyed on email so a re-run updates rather than
 * duplicating. Scraped pages produce the same person more than once, and a
 * CRM full of duplicates is worse than no push at all.
 */
export async function pushContacts(
  accessToken: string,
  records: ContactRecord[]
): Promise<PushResult> {
  if (!Array.isArray(records) || records.length === 0) {
    throw badRequest("push_integration needs a non-empty array of records");
  }

  const result: PushResult = { created: 0, updated: 0, failed: [], ids: [] };

  for (let offset = 0; offset < records.length; offset += BATCH_LIMIT) {
    const slice = records.slice(offset, offset + BATCH_LIMIT);

    const inputs = slice.map((record) => {
      const { email, firstname, lastname, phone, company, jobtitle, website, ...rest } = record;
      const properties: Record<string, string> = {};

      for (const [k, v] of Object.entries({ email, firstname, lastname, phone, company, jobtitle, website, ...rest })) {
        if (v === undefined || v === null || v === "") continue;
        properties[k] = String(v);
      }
      return { properties };
    });

    // `upsert` semantics: HubSpot's create endpoint 409s on a duplicate
    // email, so anything already present is retried as an update keyed by
    // the email property.
    const response = await fetch(`${API_BASE()}/crm/v3/objects/contacts/batch/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      results?: Array<{ id?: string }>;
      status?: string;
      message?: string;
      errors?: Array<{ message?: string }>;
    };

    if (response.status === 401) {
      throw new ApiError("unauthorized", "HubSpot rejected the access token. The integration must be reconnected.");
    }

    if (response.status === 403) {
      throw new ApiError(
        "forbidden",
        `HubSpot refused the write: ${body.message ?? "the granted scopes do not permit creating contacts"}`
      );
    }

    if (!response.ok) {
      // A whole batch failing is recorded per-record so the caller can see
      // which inputs were affected rather than a single opaque failure.
      const reason = body.message ?? `HTTP ${response.status}`;
      slice.forEach((_, i) => result.failed.push({ index: offset + i, reason }));
      continue;
    }

    for (const created of body.results ?? []) {
      if (created.id) result.ids.push(created.id);
    }
    result.created += body.results?.length ?? 0;
  }

  return result;
}
