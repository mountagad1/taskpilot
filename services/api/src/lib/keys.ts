// ============================================================
// TASKPILOT — DEVELOPER API KEYS
// services/api/src/lib/keys.ts
//
// Keys are stored as a SHA-256 digest, never in plaintext. The full key is
// returned exactly once, at creation. A leaked database dump therefore
// yields no usable credentials.
// ============================================================

import { API_KEY_PREFIX, API_SCOPES, type ApiScope } from "@taskpilot/shared";

export interface GeneratedKey {
  /** Full secret. Shown to the developer once and never persisted. */
  key: string;
  hash: string;
  prefix: string;
}

/** 32 random bytes, base64url-encoded, behind a recognisable prefix. */
export function generateApiKey(): GeneratedKey {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const secret = base64Url(bytes);
  const key = `${API_KEY_PREFIX}${secret}`;

  return { key, hash: "", prefix: secret.slice(0, 8) };
}

/** SHA-256 of the full key. Async because WebCrypto's digest is. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createApiKey(): Promise<Required<GeneratedKey>> {
  const generated = generateApiKey();
  return { ...generated, hash: await hashApiKey(generated.key) };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True when a token is a TaskPilot API key rather than a Supabase JWT. */
export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/** Pulls a key out of `Authorization: Bearer` or the `X-API-Key` header. */
export function extractApiKey(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.startsWith(API_KEY_PREFIX)) return token;
  }

  const direct = headers.get("x-api-key")?.trim();
  if (direct?.startsWith(API_KEY_PREFIX)) return direct;

  return null;
}

export function isValidScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}

/** Keeps only recognised scopes; unknown strings are dropped, not trusted. */
export function normaliseScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(isValidScope))];
}
