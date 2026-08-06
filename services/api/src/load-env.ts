// ============================================================
// TASKPILOT API — ENV FILE LOADING
// services/api/src/load-env.ts
//
// Imported for its side effect, and imported FIRST by every entry point.
// ES module imports evaluate in source order, so this runs before any
// module that reads `process.env`.
//
// Node reads `.env` only when told to (`--env-file`, or this call). Without
// it a fully populated `.env` is silently ignored and every credential
// appears missing — which looks exactly like a wrong key, and is the sort
// of thing you can stare at for an hour.
//
// Real environment variables always win: a value already present in the
// environment is never overwritten by the file, so a deployment's injected
// secrets take precedence over a stale checked-out file.
// ============================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `services/api`, resolved from this file rather than the process cwd. */
const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Candidates in precedence order. `.env.local` is for a developer's private
 * overrides and is gitignored; `.env` is the shared file.
 */
const candidates = [
  process.env.TASKPILOT_ENV_FILE, // explicit override, if set
  resolve(serviceRoot, ".env.local"),
  resolve(serviceRoot, ".env"),
].filter((p): p is string => Boolean(p));

export const loadedEnvFiles: string[] = [];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  try {
    // `loadEnvFile` does not overwrite variables that are already set, so
    // loading `.env.local` before `.env` gives the former precedence.
    process.loadEnvFile(file);
    loadedEnvFiles.push(file);
  } catch (error) {
    // A malformed file should be reported, not swallowed — but it must not
    // stop the service, which is designed to run with nothing configured.
    console.warn(
      `[env] could not read ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
