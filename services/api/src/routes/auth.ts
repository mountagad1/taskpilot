// ============================================================
// TASKPILOT API — AUTHENTICATION
// services/api/src/routes/auth.ts
//
// Authentication is a backend concern, so the dashboard never loads a
// Supabase SDK: it posts credentials here and receives a token pair. That
// keeps every Supabase detail — project URL, key rotation, provider config —
// inside this service, and keeps the web bundle free of an auth SDK.
//
// Tokens are returned in the response body rather than set as cookies: the
// dashboard and the API are on different origins, and the browser extension
// needs the same token too.
// ============================================================

import { Hono } from "hono";

// Session-creating calls (signUp, signInWithPassword, refreshSession) MUST use
// createAuthClient(), never getAdminClient() — see createAuthClient's comment.
import { createAuthClient, getAdminClient, hasSupabaseCredentials } from "../lib/clients";
import { badRequest, notConfigured, ok, rateLimited, unauthorized, validationFailed } from "../lib/errors";
import { checkRateLimit } from "../lib/security";
import { guard, readJson } from "../middleware/kernel";

/**
 * Attempts per minute against ONE email address, whatever IP they come
 * from. The per-IP guard limit alone does not stop a password-guessing run
 * spread over many addresses (a botnet, or spoofed proxy headers); this
 * does. Exported for tests.
 */
export const ACCOUNT_LIMITS = { login: 5, signup: 3, "reset-password": 3 } as const;

async function limitAccount(action: keyof typeof ACCOUNT_LIMITS, email: string): Promise<void> {
  // Hash the address so rate-limit keys in Redis do not hold plain emails.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
  const id = Buffer.from(digest).toString("hex").slice(0, 32);
  const result = await checkRateLimit(`/v1/auth/${action}#account`, id, ACCOUNT_LIMITS[action]);
  if (!result.allowed) throw rateLimited(Math.max(1, result.reset - Math.floor(Date.now() / 1000)));
}

export const authRoutes = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

interface Credentials {
  email: string;
  password: string;
}

function readCredentials(body: Record<string, unknown>, requireStrongPassword: boolean): Credentials {
  const issues: Array<{ path: string; message: string }> = [];

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!EMAIL_RE.test(email)) {
    issues.push({ path: "email", message: "Enter a valid email address" });
  }
  if (!password) {
    issues.push({ path: "password", message: "Enter your password" });
  } else if (requireStrongPassword && password.length < MIN_PASSWORD) {
    issues.push({
      path: "password",
      message: `Use at least ${MIN_PASSWORD} characters`,
    });
  }

  if (issues.length) throw validationFailed(issues);
  return { email, password };
}

/** The shape the dashboard and extension both consume. */
function sessionPayload(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}, user: { id: string; email?: string | null }, plan: string) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    // Absolute seconds since epoch, so the client can refresh proactively
    // rather than waiting for a 401.
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    user: { id: user.id, email: user.email ?? "", plan },
  };
}

async function planFor(userId: string): Promise<string> {
  const { data } = await getAdminClient()
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  return (data?.plan as string) ?? "free";
}

function assertConfigured(): void {
  if (!hasSupabaseCredentials()) {
    throw notConfigured("Authentication is not configured for this deployment");
  }
}

// ─── SIGN UP ─────────────────────────────────────────────────

authRoutes.post("/signup", guard({ auth: false, rateLimit: 10 }), async (c) => {
  assertConfigured();

  const body = await readJson(c);
  const { email, password } = readCredentials(body, true);
  await limitAccount("signup", email);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : undefined;

  // Send the confirmation link back to our own app. Without this Supabase
  // falls back to the project's dashboard "Site URL", which the Vercel
  // integration repoints whenever it links a project — confirmation mails
  // then land on whatever it last configured instead of TaskPilot.
  const appOrigin = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  const { data, error } = await createAuthClient().auth.signUp({
    email,
    password,
    options: {
      data: name ? { full_name: name } : undefined,
      emailRedirectTo: `${appOrigin}/auth/login?confirmed=1`,
    },
  });

  if (error) throw badRequest(error.message);

  // With email confirmation enabled Supabase returns a user but no session.
  // Say so explicitly rather than returning a half-empty payload.
  if (!data.session || !data.user) {
    return ok({ requires_confirmation: true, email }, { status: 201 });
  }

  return ok(sessionPayload(data.session, data.user, await planFor(data.user.id)), { status: 201 });
});

// ─── SIGN IN ─────────────────────────────────────────────────

authRoutes.post("/login", guard({ auth: false, rateLimit: 20 }), async (c) => {
  assertConfigured();

  const body = await readJson(c);
  const { email, password } = readCredentials(body, false);
  await limitAccount("login", email);

  const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });

  // Never distinguish "no such account" from "wrong password" — that turns
  // the login form into an account-enumeration oracle.
  if (error || !data.session || !data.user) {
    throw unauthorized("That email and password do not match an account");
  }

  return ok(sessionPayload(data.session, data.user, await planFor(data.user.id)));
});

// ─── REFRESH ─────────────────────────────────────────────────

authRoutes.post("/refresh", guard({ auth: false, rateLimit: 60 }), async (c) => {
  assertConfigured();

  const body = await readJson(c);
  const refreshToken = String(body.refresh_token ?? "");
  if (!refreshToken) throw badRequest("A refresh_token is required");

  const { data, error } = await createAuthClient().auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    throw unauthorized("Your session has expired. Sign in again.");
  }

  return ok(sessionPayload(data.session, data.user, await planFor(data.user.id)));
});

// ─── SIGN OUT ────────────────────────────────────────────────

authRoutes.post("/logout", guard({ allow: ["session"], rateLimit: 60 }), async (c) => {
  const authorization = c.req.header("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  // Best-effort: revoking server-side is what stops a stolen refresh token,
  // but the client has already discarded its copy either way.
  if (token) {
    try {
      await getAdminClient().auth.admin.signOut(token);
    } catch {
      // An already-invalid token is not an error worth surfacing.
    }
  }

  return ok({ signed_out: true });
});

// ─── PASSWORD RESET ──────────────────────────────────────────

/**
 * Where the reset email's link lands. It carries a recovery access token in
 * its URL hash, so it must only ever point at our own web app: a client
 * value is honoured only if it is on PUBLIC_APP_URL's origin. Supabase's
 * redirect allow-list is a second layer, not the only one.
 */
export function resetRedirectFor(requested: unknown): string {
  const appOrigin = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const fallback = `${appOrigin}/auth/update-password`;
  if (typeof requested !== "string" || !requested) return fallback;
  try {
    const url = new URL(requested);
    return url.origin === new URL(appOrigin).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

authRoutes.post("/reset-password", guard({ auth: false, rateLimit: 10 }), async (c) => {
  assertConfigured();

  const body = await readJson(c);
  const email = String(body.email ?? "").trim().toLowerCase();
  const redirectTo = resetRedirectFor(body.redirect_to);

  if (!EMAIL_RE.test(email)) {
    throw validationFailed([{ path: "email", message: "Enter a valid email address" }]);
  }
  await limitAccount("reset-password", email);

  try {
    await createAuthClient().auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Swallow: whether the address exists must not be observable.
  }

  // Always the same answer, for the same reason.
  return ok({ sent: true });
});

authRoutes.post("/update-password", guard({ allow: ["session"], rateLimit: 10 }), async (c) => {
  assertConfigured();

  const body = await readJson(c);
  const password = String(body.password ?? "");

  if (password.length < MIN_PASSWORD) {
    throw validationFailed([
      { path: "password", message: `Use at least ${MIN_PASSWORD} characters` },
    ]);
  }

  const authorization = c.req.header("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw unauthorized();

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw unauthorized("Your session has expired. Sign in again.");

  const { error } = await admin.auth.admin.updateUserById(userData.user.id, { password });
  if (error) throw badRequest(error.message);

  return ok({ updated: true });
});
