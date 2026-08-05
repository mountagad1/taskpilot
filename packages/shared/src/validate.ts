// ============================================================
// TASKPILOT — RUNTIME VALIDATION
// packages/shared/src/validate.ts
//
// A deliberately tiny structural validator. This runs in the extension's
// content script, so pulling a schema library into the bundle for a dozen
// shapes isn't worth the kilobytes; and validating LLM output is the one
// place we genuinely cannot trust the TypeScript types.
// ============================================================

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function fail<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}

// ─── PRIMITIVES ──────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(
  value: unknown,
  path: string,
  opts: { max?: number; min?: number } = {}
): ValidationResult<string> {
  if (typeof value !== "string") return fail(path, "expected a string");
  if (opts.min !== undefined && value.length < opts.min) {
    return fail(path, `expected at least ${opts.min} characters`);
  }
  if (opts.max !== undefined && value.length > opts.max) {
    return fail(path, `expected at most ${opts.max} characters`);
  }
  return ok(value);
}

export function asNumber(
  value: unknown,
  path: string,
  opts: { min?: number; max?: number; integer?: boolean } = {}
): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "expected a finite number");
  }
  if (opts.integer && !Number.isInteger(value)) return fail(path, "expected an integer");
  if (opts.min !== undefined && value < opts.min) return fail(path, `expected >= ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) return fail(path, `expected <= ${opts.max}`);
  return ok(value);
}

export function asEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[]
): ValidationResult<T> {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail(path, `expected one of: ${allowed.join(", ")}`);
  }
  return ok(value as T);
}

export function asArray(value: unknown, path: string, max = 1000): ValidationResult<unknown[]> {
  if (!Array.isArray(value)) return fail(path, "expected an array");
  if (value.length > max) return fail(path, `expected at most ${max} items`);
  return ok(value);
}

// ─── COMBINATOR ──────────────────────────────────────────────

/**
 * Collects issues across several field validations instead of stopping at
 * the first, so a bad LLM response reports everything wrong with it at once.
 */
export class Validator {
  private issues: ValidationIssue[] = [];

  take<T>(result: ValidationResult<T>, fallback: T): T {
    if (result.ok) return result.value;
    this.issues.push(...result.issues);
    return fallback;
  }

  /** Records an issue without producing a value. */
  reject(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  get failed(): boolean {
    return this.issues.length > 0;
  }

  finish<T>(value: T): ValidationResult<T> {
    return this.issues.length ? { ok: false, issues: this.issues } : { ok: true, value };
  }

  describe(): string {
    return this.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
  }
}

// ─── SHARED SHAPES ───────────────────────────────────────────

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export function asSlug(value: unknown, path: string): ValidationResult<string> {
  const str = asString(value, path, { min: 2, max: 64 });
  if (!str.ok) return str;
  if (!SAFE_SLUG.test(str.value)) {
    return fail(path, "expected a lowercase kebab-case slug");
  }
  return str;
}

export function asSemver(value: unknown, path: string): ValidationResult<string> {
  const str = asString(value, path, { max: 32 });
  if (!str.ok) return str;
  if (!SEMVER.test(str.value)) return fail(path, "expected a semver string like 1.2.3");
  return str;
}

/**
 * Accepts http(s) URLs only. Rejects `javascript:`, `data:` and `file:`,
 * which is what stops a marketplace agent from smuggling a script URL into
 * a `navigate` action.
 */
export function asHttpUrl(value: unknown, path: string): ValidationResult<string> {
  const str = asString(value, path, { max: 2048 });
  if (!str.ok) return str;
  let parsed: URL;
  try {
    parsed = new URL(str.value);
  } catch {
    return fail(path, "expected an absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail(path, `unsupported protocol ${parsed.protocol}`);
  }
  return ok(parsed.toString());
}
