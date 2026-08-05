// ============================================================
// TASKPILOT — AGENT MANIFEST VALIDATION
// packages/shared/src/manifest.ts
//
// Marketplace agents are authored by third parties and then executed with
// the user's browser session. This module is the trust boundary: nothing
// reaches the runtime without passing `parseAgentManifest`.
// ============================================================

import {
  AGENT_CATEGORIES,
  AGENT_MANIFEST_SCHEMA,
  DEFAULT_HARNESS,
  type AgentCategory,
  type AgentHarness,
  type AgentInput,
  type AgentManifest,
  type AgentTrigger,
} from "./types/agent";
import {
  BROWSER_ACTION_TYPES,
  type BrowserAction,
  type BrowserActionType,
  type ElementTarget,
  type PlanStep,
  type StepCondition,
} from "./types/runtime";
import {
  Validator,
  asArray,
  asEnum,
  asHttpUrl,
  asNumber,
  asSemver,
  asSlug,
  asString,
  isRecord,
  type ValidationResult,
} from "./validate";

// Ceilings a published manifest may not exceed, whatever it declares.
// A seller cannot buy themselves a bigger budget on the buyer's account.
export const MANIFEST_LIMITS = {
  max_steps: 100,
  max_token_budget: 60_000,
  max_timeout_ms: 600_000,
  max_inputs: 20,
  max_triggers: 10,
  max_workflow_steps: 100,
  max_capabilities: BROWSER_ACTION_TYPES.length,
} as const;

const TARGET_STRATEGIES = ["css", "text", "label", "placeholder", "role", "name", "testid"] as const;
const CONDITION_OPS = ["exists", "not_exists", "equals", "not_equals", "contains", "gt", "lt"] as const;
const INPUT_TYPES = ["string", "number", "boolean", "url", "select", "file"] as const;
const TRIGGER_TYPES = ["manual", "url_match", "schedule", "hotkey"] as const;
const TRIGGER_SURFACES = ["sidebar", "popup", "dashboard", "api"] as const;
const DEPLOY_TARGETS = ["extension", "dashboard", "api"] as const;
const PLANS = ["free", "pro", "enterprise"] as const;

// ─── ELEMENT TARGET ──────────────────────────────────────────

function parseTarget(raw: unknown, path: string, v: Validator): ElementTarget | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    v.reject(path, "expected an object");
    return undefined;
  }

  const by = v.take(asEnum(raw.by, `${path}.by`, TARGET_STRATEGIES), "css");
  const value = v.take(asString(raw.value, `${path}.value`, { min: 1, max: 1000 }), "");

  const target: ElementTarget = { by, value };

  if (raw.index !== undefined) {
    target.index = v.take(asNumber(raw.index, `${path}.index`, { min: 0, max: 500, integer: true }), 0);
  }
  if (raw.description !== undefined) {
    target.description = v.take(asString(raw.description, `${path}.description`, { max: 200 }), "");
  }
  if (raw.fallbacks !== undefined) {
    const list = v.take(asArray(raw.fallbacks, `${path}.fallbacks`, 5), []);
    target.fallbacks = list.flatMap((entry, i) => {
      if (!isRecord(entry)) {
        v.reject(`${path}.fallbacks[${i}]`, "expected an object");
        return [];
      }
      return [
        {
          by: v.take(asEnum(entry.by, `${path}.fallbacks[${i}].by`, TARGET_STRATEGIES), "css"),
          value: v.take(asString(entry.value, `${path}.fallbacks[${i}].value`, { min: 1, max: 1000 }), ""),
        },
      ];
    });
  }

  return target;
}

// ─── ACTION ──────────────────────────────────────────────────

/**
 * Params are free-form per action, but the few that carry a URL are checked
 * here so `navigate`/`open_tab` can never receive a `javascript:` payload.
 */
function parseActionParams(
  type: BrowserActionType,
  raw: unknown,
  path: string,
  v: Validator
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    v.reject(path, "expected an object");
    return undefined;
  }

  const params: Record<string, unknown> = { ...raw };

  if ((type === "navigate" || type === "open_tab" || type === "download_file") && params.url !== undefined) {
    params.url = v.take(asHttpUrl(params.url, `${path}.url`), "");
  }

  return params;
}

function parseAction(raw: unknown, path: string, v: Validator): BrowserAction {
  if (!isRecord(raw)) {
    v.reject(path, "expected an object");
    return { type: "finish" };
  }

  const type = v.take(asEnum(raw.type, `${path}.type`, BROWSER_ACTION_TYPES), "finish");
  const action: BrowserAction = { type };

  const target = parseTarget(raw.target, `${path}.target`, v);
  if (target) action.target = target;

  const params = parseActionParams(type, raw.params, `${path}.params`, v);
  if (params) action.params = params;

  if (raw.rationale !== undefined) {
    action.rationale = v.take(asString(raw.rationale, `${path}.rationale`, { max: 500 }), "");
  }

  return action;
}

// ─── STEP ────────────────────────────────────────────────────

function parseCondition(raw: unknown, path: string, v: Validator): StepCondition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    v.reject(path, "expected an object");
    return undefined;
  }
  const condition: StepCondition = {
    key: v.take(asString(raw.key, `${path}.key`, { min: 1, max: 120 }), ""),
    op: v.take(asEnum(raw.op, `${path}.op`, CONDITION_OPS), "exists"),
  };
  if (raw.value !== undefined) {
    if (typeof raw.value === "string" || typeof raw.value === "number" || typeof raw.value === "boolean") {
      condition.value = raw.value;
    } else {
      v.reject(`${path}.value`, "expected a string, number or boolean");
    }
  }
  return condition;
}

export function parsePlanStep(raw: unknown, path: string, v: Validator, fallbackId: string): PlanStep {
  if (!isRecord(raw)) {
    v.reject(path, "expected an object");
    return { id: fallbackId, action: { type: "finish" } };
  }

  const step: PlanStep = {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.slice(0, 64) : fallbackId,
    action: parseAction(raw.action, `${path}.action`, v),
  };

  if (raw.depends_on !== undefined) {
    const list = v.take(asArray(raw.depends_on, `${path}.depends_on`, 20), []);
    step.depends_on = list
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.slice(0, 64));
  }

  const condition = parseCondition(raw.condition, `${path}.condition`, v);
  if (condition) step.condition = condition;

  if (raw.retry !== undefined) {
    if (isRecord(raw.retry)) {
      step.retry = {
        max_attempts: v.take(
          asNumber(raw.retry.max_attempts, `${path}.retry.max_attempts`, { min: 1, max: 5, integer: true }),
          1
        ),
        backoff_ms: v.take(
          asNumber(raw.retry.backoff_ms, `${path}.retry.backoff_ms`, { min: 0, max: 30_000, integer: true }),
          500
        ),
      };
    } else {
      v.reject(`${path}.retry`, "expected an object");
    }
  }

  if (raw.save_as !== undefined) {
    step.save_as = v.take(asString(raw.save_as, `${path}.save_as`, { min: 1, max: 120 }), "");
  }
  if (raw.optional !== undefined) {
    step.optional = raw.optional === true;
  }

  return step;
}

// ─── HARNESS / INPUTS / TRIGGERS ─────────────────────────────

function parseHarness(raw: unknown, path: string, v: Validator): AgentHarness {
  if (!isRecord(raw)) return { ...DEFAULT_HARNESS };

  const memoryRaw = isRecord(raw.memory) ? raw.memory : {};

  return {
    model: v.take(asString(raw.model ?? DEFAULT_HARNESS.model, `${path}.model`, { max: 100 }), DEFAULT_HARNESS.model),
    token_budget_per_run: clamp(
      v.take(
        asNumber(raw.token_budget_per_run ?? DEFAULT_HARNESS.token_budget_per_run, `${path}.token_budget_per_run`, {
          min: 100,
          max: MANIFEST_LIMITS.max_token_budget,
          integer: true,
        }),
        DEFAULT_HARNESS.token_budget_per_run
      ),
      100,
      MANIFEST_LIMITS.max_token_budget
    ),
    max_steps: clamp(
      v.take(
        asNumber(raw.max_steps ?? DEFAULT_HARNESS.max_steps, `${path}.max_steps`, {
          min: 1,
          max: MANIFEST_LIMITS.max_steps,
          integer: true,
        }),
        DEFAULT_HARNESS.max_steps
      ),
      1,
      MANIFEST_LIMITS.max_steps
    ),
    timeout_ms: clamp(
      v.take(
        asNumber(raw.timeout_ms ?? DEFAULT_HARNESS.timeout_ms, `${path}.timeout_ms`, {
          min: 1000,
          max: MANIFEST_LIMITS.max_timeout_ms,
          integer: true,
        }),
        DEFAULT_HARNESS.timeout_ms
      ),
      1000,
      MANIFEST_LIMITS.max_timeout_ms
    ),
    memory: {
      namespace: v.take(
        asString(memoryRaw.namespace ?? "default", `${path}.memory.namespace`, { min: 1, max: 80 }),
        "default"
      ),
      ttl_hours: clamp(
        v.take(asNumber(memoryRaw.ttl_hours ?? 24, `${path}.memory.ttl_hours`, { min: 0, max: 720 }), 24),
        0,
        720
      ),
      enabled: memoryRaw.enabled !== false,
    },
    require_confirmation: parseCapabilities(
      raw.require_confirmation ?? DEFAULT_HARNESS.require_confirmation,
      `${path}.require_confirmation`,
      v
    ),
  };
}

function parseCapabilities(raw: unknown, path: string, v: Validator): BrowserActionType[] {
  const list = v.take(asArray(raw, path, MANIFEST_LIMITS.max_capabilities), []);
  const seen = new Set<BrowserActionType>();
  for (let i = 0; i < list.length; i++) {
    const parsed = asEnum(list[i], `${path}[${i}]`, BROWSER_ACTION_TYPES);
    if (parsed.ok) seen.add(parsed.value);
    else v.reject(`${path}[${i}]`, `unknown capability "${String(list[i])}"`);
  }
  return [...seen];
}

function parseInputs(raw: unknown, path: string, v: Validator): AgentInput[] {
  if (raw === undefined) return [];
  const list = v.take(asArray(raw, path, MANIFEST_LIMITS.max_inputs), []);
  return list.flatMap((entry, i) => {
    if (!isRecord(entry)) {
      v.reject(`${path}[${i}]`, "expected an object");
      return [];
    }
    const input: AgentInput = {
      name: v.take(asString(entry.name, `${path}[${i}].name`, { min: 1, max: 64 }), `input_${i}`),
      label: v.take(asString(entry.label ?? entry.name, `${path}[${i}].label`, { min: 1, max: 120 }), `Input ${i + 1}`),
      type: v.take(asEnum(entry.type ?? "string", `${path}[${i}].type`, INPUT_TYPES), "string"),
      required: entry.required === true,
    };
    if (entry.description !== undefined) {
      input.description = v.take(asString(entry.description, `${path}[${i}].description`, { max: 300 }), "");
    }
    if (
      typeof entry.default === "string" ||
      typeof entry.default === "number" ||
      typeof entry.default === "boolean"
    ) {
      input.default = entry.default;
    }
    if (entry.options !== undefined) {
      const opts = v.take(asArray(entry.options, `${path}[${i}].options`, 50), []);
      input.options = opts.filter((o): o is string => typeof o === "string").map((o) => o.slice(0, 120));
    }
    return [input];
  });
}

function parseTriggers(raw: unknown, path: string, v: Validator): AgentTrigger[] {
  if (raw === undefined) return [{ type: "manual", surface: "sidebar" }];
  const list = v.take(asArray(raw, path, MANIFEST_LIMITS.max_triggers), []);
  const triggers = list.flatMap((entry, i) => {
    if (!isRecord(entry)) {
      v.reject(`${path}[${i}]`, "expected an object");
      return [];
    }
    const trigger: AgentTrigger = {
      type: v.take(asEnum(entry.type ?? "manual", `${path}[${i}].type`, TRIGGER_TYPES), "manual"),
    };
    if (entry.pattern !== undefined) {
      trigger.pattern = v.take(asString(entry.pattern, `${path}[${i}].pattern`, { max: 500 }), "");
    }
    if (entry.cron !== undefined) {
      trigger.cron = v.take(asString(entry.cron, `${path}[${i}].cron`, { max: 120 }), "");
    }
    if (entry.key !== undefined) {
      trigger.key = v.take(asString(entry.key, `${path}[${i}].key`, { max: 40 }), "");
    }
    if (entry.surface !== undefined) {
      trigger.surface = v.take(asEnum(entry.surface, `${path}[${i}].surface`, TRIGGER_SURFACES), "sidebar");
    }
    // A url_match trigger without a pattern would fire on every page.
    if (trigger.type === "url_match" && !trigger.pattern) {
      v.reject(`${path}[${i}].pattern`, "url_match triggers require a pattern");
    }
    return [trigger];
  });
  return triggers.length ? triggers : [{ type: "manual", surface: "sidebar" }];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── ENTRY POINT ─────────────────────────────────────────────

/**
 * Validates and normalises an untrusted manifest. Unknown top-level keys are
 * dropped rather than passed through, so a manifest cannot smuggle fields
 * into whatever consumes the parsed object.
 */
export function parseAgentManifest(raw: unknown): ValidationResult<AgentManifest> {
  const v = new Validator();

  if (!isRecord(raw)) {
    return { ok: false, issues: [{ path: "manifest", message: "expected an object" }] };
  }

  if (raw.schema !== AGENT_MANIFEST_SCHEMA) {
    v.reject("schema", `expected "${AGENT_MANIFEST_SCHEMA}"`);
  }

  const capabilities = parseCapabilities(raw.capabilities, "capabilities", v);

  let workflow: PlanStep[] | undefined;
  if (raw.workflow !== undefined) {
    const steps = v.take(asArray(raw.workflow, "workflow", MANIFEST_LIMITS.max_workflow_steps), []);
    workflow = steps.map((step, i) => parsePlanStep(step, `workflow[${i}]`, v, `step_${i + 1}`));

    // A baked workflow that calls something outside `capabilities` would be
    // rejected mid-run by the runtime; catching it at publish time is better.
    if (capabilities.length) {
      const allowed = new Set(capabilities);
      workflow.forEach((step, i) => {
        if (step.action.type !== "finish" && !allowed.has(step.action.type)) {
          v.reject(`workflow[${i}].action.type`, `"${step.action.type}" is not in the declared capabilities`);
        }
      });
    }
  }

  const deployRaw = isRecord(raw.deploy) ? raw.deploy : {};
  const deployTargets = v
    .take(asArray(deployRaw.targets ?? ["extension"], "deploy.targets", 3), [])
    .flatMap((t, i) => {
      const parsed = asEnum(t, `deploy.targets[${i}]`, DEPLOY_TARGETS);
      return parsed.ok ? [parsed.value] : [];
    });

  const manifest: AgentManifest = {
    schema: AGENT_MANIFEST_SCHEMA,
    name: v.take(asString(raw.name, "name", { min: 2, max: 120 }), "Untitled agent"),
    slug: v.take(asSlug(raw.slug, "slug"), "untitled-agent"),
    version: v.take(asSemver(raw.version ?? "1.0.0", "version"), "1.0.0"),
    description: v.take(asString(raw.description ?? "", "description", { max: 4000 }), ""),
    category: v.take(
      asEnum(raw.category ?? "automation", "category", AGENT_CATEGORIES),
      "automation"
    ) as AgentCategory,
    goal: v.take(asString(raw.goal, "goal", { min: 4, max: 2000 }), ""),
    capabilities,
    harness: parseHarness(raw.harness, "harness", v),
    inputs: parseInputs(raw.inputs, "inputs", v),
    triggers: parseTriggers(raw.triggers, "triggers", v),
    deploy: {
      targets: deployTargets.length ? deployTargets : ["extension"],
      min_plan: v.take(asEnum(deployRaw.min_plan ?? "free", "deploy.min_plan", PLANS), "free"),
    },
  };

  if (workflow) manifest.workflow = workflow;

  if (!capabilities.length) {
    v.reject("capabilities", "an agent must declare at least one capability");
  }

  return v.finish(manifest);
}

/** Convenience wrapper for call sites that only care whether it parsed. */
export function isValidAgentManifest(raw: unknown): boolean {
  return parseAgentManifest(raw).ok;
}
