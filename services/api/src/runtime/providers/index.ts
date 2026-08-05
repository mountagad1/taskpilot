// ============================================================
// TASKPILOT — PROVIDER RESOLUTION
// services/api/src/runtime/providers/index.ts
// ============================================================

import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse } from "./types";

export * from "./types";
export { OpenAIProvider } from "./openai";
export { AnthropicProvider } from "./anthropic";
export { MockProvider } from "./mock";

export interface ProviderRouterOptions {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  /** Injected in tests; when present it handles every model. */
  override?: LLMProvider;
  fetchImpl?: typeof fetch;
}

/**
 * Picks a provider by model id. Falls back to the scripted provider when no
 * key is configured so local development and CI don't need credentials —
 * callers can detect this via `router.isLive`.
 */
export class ProviderRouter {
  private readonly providers: LLMProvider[] = [];
  private readonly fallback: MockProvider;
  readonly isLive: boolean;

  constructor(options: ProviderRouterOptions = {}) {
    if (options.override) {
      this.providers.push(options.override);
    } else {
      if (options.openaiApiKey) {
        this.providers.push(
          new OpenAIProvider({ apiKey: options.openaiApiKey, fetchImpl: options.fetchImpl })
        );
      }
      if (options.anthropicApiKey) {
        this.providers.push(
          new AnthropicProvider({ apiKey: options.anthropicApiKey, fetchImpl: options.fetchImpl })
        );
      }
    }
    this.isLive = this.providers.length > 0;
    this.fallback = new MockProvider({
      responder: () =>
        JSON.stringify({
          error: "no_llm_provider_configured",
          message:
            "Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI planning. Heuristic planning still works.",
        }),
    });
  }

  resolve(model: string): LLMProvider {
    return this.providers.find((p) => p.supports(model)) ?? this.providers[0] ?? this.fallback;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.isLive) {
      throw new LLMError("No LLM provider configured", undefined, false);
    }
    return this.resolve(request.model).complete(request);
  }
}

/** Builds a router from process env. Server-side only. */
export function providerRouterFromEnv(env: Record<string, string | undefined> = process.env): ProviderRouter {
  return new ProviderRouter({
    openaiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
  });
}
