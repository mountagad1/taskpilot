// ============================================================
// TASKPILOT API — SECRET ENCRYPTION
// services/api/src/lib/crypto.ts
//
// OAuth tokens are stored encrypted so a database dump is not a set of live
// credentials into customers' CRMs. A HubSpot refresh token does not expire
// on its own — whoever holds it can mint access tokens until the grant is
// revoked by hand — so plaintext at rest is a standing breach, not a
// theoretical one.
//
// AES-256-GCM, because it authenticates as well as encrypts: a tampered
// ciphertext fails to decrypt rather than yielding attacker-chosen
// plaintext. The IV is random per encryption and stored alongside; GCM is
// catastrophically weak if an IV is reused with the same key, so it is
// never derived from the message.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { notConfigured, badRequest } from "./errors";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

/**
 * Version prefix. Rotating to a new algorithm or key derivation means
 * emitting `v2:` while still decrypting `v1:` rows, rather than a flag day
 * where every stored token becomes unreadable at once.
 */
const VERSION = "v1";

export const ENCRYPTION_KEY_VAR = "INTEGRATION_ENCRYPTION_KEY";

let cachedKey: Buffer | null = null;

/**
 * Accepts hex (64 chars) or base64. Anything that does not decode to
 * exactly 32 bytes is rejected loudly: a short key silently weakens every
 * token in the table, and it is the sort of mistake that is invisible until
 * someone looks.
 */
function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();

  const candidates: Buffer[] = [];
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    candidates.push(Buffer.from(trimmed, "hex"));
  }
  candidates.push(Buffer.from(trimmed, "base64"));

  const key = candidates.find((b) => b.length === KEY_BYTES);
  if (!key) {
    throw notConfigured(
      `${ENCRYPTION_KEY_VAR} must be 32 bytes, given as 64 hex characters or base64. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return key;
}

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env[ENCRYPTION_KEY_VAR];
  if (!raw) {
    throw notConfigured(
      `This deployment is missing ${ENCRYPTION_KEY_VAR}, which is required before an ` +
        `OAuth token can be stored. Set it in services/api/.env (copy from .env.example). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }

  cachedKey = parseKey(raw);
  return cachedKey;
}

/** True when tokens can be stored. Lets routes answer 503 before starting a flow. */
export function hasEncryptionKey(): boolean {
  const raw = process.env[ENCRYPTION_KEY_VAR];
  if (!raw) return false;
  try {
    parseKey(raw);
    return true;
  } catch {
    return false;
  }
}

/** Test seam: forces the next call to re-read the environment. */
export function resetEncryptionKey(): void {
  cachedKey = null;
}

/**
 * Returns `v1:<iv>:<tag>:<ciphertext>`, all base64. Self-describing so a row
 * can be decrypted without consulting configuration about how it was
 * written.
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw badRequest("Refusing to encrypt an empty secret");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    // Most likely a row written before encryption existed. Say so precisely
    // rather than returning a decryption error that reads as key corruption.
    throw badRequest(
      "This credential is not in the expected encrypted format. It predates token " +
        "encryption and the integration must be reconnected."
    );
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw badRequest("Stored credential is malformed");
  }

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // GCM's tag check failed: either the row was tampered with or the key
    // has changed. Both need a human, and neither should leak which.
    throw badRequest("Stored credential could not be decrypted. It may have been encrypted with a different key.");
  }
}

/**
 * Constant-time string comparison, for the OAuth `state` parameter.
 * Comparing with `===` leaks how many leading characters matched, which is
 * enough to reconstruct a value one character at a time given enough
 * attempts.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** URL-safe random token, for `state` values. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
