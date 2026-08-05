// ============================================================
// TASKPILOT — LLM PROVIDER ABSTRACTION
// services/api/src/runtime/providers/types.ts
//
// The runtime never talks to a vendor SDK directly. Everything goes
// through this interface so the planner and reasoner can be tested
// deterministically against a scripted provider, and so swapping models
// is a config change rather than a rewrite.
// ============================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  /** Force a JSON object response. Providers that lack it get a prompt suffix. */
  json?: boolean;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: LLMUsage;
  /** True when the response was served from the semantic cache. */
  cached?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
  /** Whether this provider can serve the given model id. */
  supports(model: string): boolean;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "LLMError";
  }
}

// ─── PRICING ─────────────────────────────────────────────────

/** USD per 1M tokens, input/output. Used for cost attribution, not billing. */
export interface ModelPricing {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

export function estimateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["gpt-4.1-mini"];
  return (
    (usage.prompt_tokens / 1_000_000) * pricing.input +
    (usage.completion_tokens / 1_000_000) * pricing.output
  );
}

/**
 * Rough token estimate for budget pre-checks — ~4 characters per token for
 * English prose. Only used to decide whether a call fits in the remaining
 * budget; actual accounting always uses the provider's reported usage.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
