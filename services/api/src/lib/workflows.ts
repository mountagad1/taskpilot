// ============================================================
// TASKPILOT — WORKFLOW HELPERS
// services/api/src/lib/workflows.ts
//
// Kept out of the route module because a Next.js route file may only export
// HTTP verbs and route segment config — any other export fails the build.
// ============================================================

import { Validator, parsePlanStep, type PlanStep } from "@taskpilot/shared";
import { validationFailed } from "./errors";

export const WORKFLOW_COLUMNS =
  "id, user_id, team_id, agent_id, name, description, trigger_type, trigger_config, steps, " +
  "is_active, run_count, last_run_at, schedule_cron, next_run_at, created_at, updated_at";

export const MAX_WORKFLOW_STEPS = 100;

/**
 * Normalises an untrusted step list through the same validator that guards
 * published agent manifests, so a workflow cannot express an action a
 * manifest could not.
 */
export function parseWorkflowSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw validationFailed([{ path: "steps", message: "A workflow needs at least one step" }]);
  }
  if (raw.length > MAX_WORKFLOW_STEPS) {
    throw validationFailed([
      { path: "steps", message: `A workflow may have at most ${MAX_WORKFLOW_STEPS} steps` },
    ]);
  }

  const validator = new Validator();
  const steps = raw.map((step, i) => parsePlanStep(step, `steps[${i}]`, validator, `step_${i + 1}`));
  const result = validator.finish(steps);

  if (!result.ok) throw validationFailed(result.issues, "One or more workflow steps are not valid");
  return result.value;
}
