// ============================================================
// TASKPILOT — AI RUNTIME
// services/api/src/runtime/index.ts
// ============================================================

export * from "./providers";
export * from "./planner";
export * from "./reasoner";
export * from "./memory";
export * from "./agent-runtime";
export { SemanticCache, MemoryBackend, getSemanticCache, semanticCache } from "./cache/semantic-cache";
export type { CacheBackend, CacheEntry, CacheStats } from "./cache/semantic-cache";
export { TokenOptimizer } from "./optimizer/token-optimizer";

import { Planner } from "./planner";
import { Reasoner } from "./reasoner";
import { AgentRuntime, type AgentRuntimeOptions } from "./agent-runtime";
import { ProviderRouter, providerRouterFromEnv } from "./providers";
import type { ActionDispatcher, BrowserActionType, RunLimits } from "@taskpilot/shared";

export interface CreateRuntimeOptions {
  dispatcher: ActionDispatcher;
  model?: string;
  allowedActions?: BrowserActionType[];
  limits?: Partial<RunLimits>;
  userId?: string | null;
  router?: ProviderRouter;
  onEvent?: AgentRuntimeOptions["onEvent"];
  confirm?: AgentRuntimeOptions["confirm"];
  memoryStore?: AgentRuntimeOptions["memoryStore"];
}

/**
 * Assembles a runtime with providers resolved from the environment. Falls
 * back to heuristic-only planning when no API key is present, so the product
 * still does something useful without credentials.
 */
export function createAgentRuntime(options: CreateRuntimeOptions): AgentRuntime {
  const router = options.router ?? providerRouterFromEnv();
  const model = options.model ?? "gpt-4.1-mini";
  const provider = router.isLive ? router.resolve(model) : undefined;

  return new AgentRuntime({
    planner: new Planner({
      provider,
      model,
      allowedActions: options.allowedActions,
      maxSteps: options.limits?.max_steps,
    }),
    reasoner: new Reasoner({ provider, model }),
    dispatcher: options.dispatcher,
    limits: options.limits,
    userId: options.userId,
    onEvent: options.onEvent,
    confirm: options.confirm,
    memoryStore: options.memoryStore,
  });
}
