// ============================================================
// TASKPILOT EXTENSION — CONFIGURATION
// apps/extension/src/shared/config.ts
//
// The API origin is baked in at build time so a compromised page cannot
// repoint the extension at an attacker's server by writing to storage.
// ============================================================

declare const __TASKPILOT_API_ORIGIN__: string | undefined;
declare const __TASKPILOT_WEB_ORIGIN__: string | undefined;

/** Build-time origin, overridable only via the build script. */
export const API_ORIGIN: string =
  typeof __TASKPILOT_API_ORIGIN__ === "string" && __TASKPILOT_API_ORIGIN__
    ? __TASKPILOT_API_ORIGIN__
    : "https://taskpilot.cc";

/** The API service mounts every resource under /v1. */
export const API_BASE = `${API_ORIGIN}/v1`;

/** Where to send the user for the dashboard, marketplace and sign-in. */
export const WEB_ORIGIN: string =
  typeof __TASKPILOT_WEB_ORIGIN__ === "string" && __TASKPILOT_WEB_ORIGIN__
    ? __TASKPILOT_WEB_ORIGIN__
    : "https://taskpilot.cc";

export const EXTENSION_VERSION = "1.1.0";

/** Origins permitted to hand this extension a session. */
export const TRUSTED_WEB_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*taskpilot\.cc$/;

/** Also trust localhost when the build points at a local server. */
export function isTrustedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (TRUSTED_WEB_ORIGIN.test(origin)) return true;
  if (origin === WEB_ORIGIN) return true;
  return WEB_ORIGIN.startsWith("http://localhost") && origin.startsWith("http://localhost");
}

/** Pages the extension must never automate — its own control surfaces. */
export const BLOCKED_HOST_PATTERNS = [
  /^chrome:\/\//i,
  /^edge:\/\//i,
  /^about:/i,
  /^chrome-extension:\/\//i,
  /^https:\/\/chromewebstore\.google\.com/i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
];

export function isAutomatable(url: string | undefined): boolean {
  if (!url) return false;
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url))) return false;
  return /^https?:\/\//i.test(url);
}
