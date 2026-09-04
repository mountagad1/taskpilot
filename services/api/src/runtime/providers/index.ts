// ============================================================
// TASKPILOT — PROVIDER RESOLUTION
// services/api/src/runtime/providers/index.ts
// ============================================================

import { AnthropicProvider } from "./anthropic";
import { HeadroomCompressor, headroomFromEnv, withHeadroom } from "./headroom";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { LLMError, type LLMProvider, type LLMRequest, type LLMResponse } from "./types";

export * from "./types";
export { OpenAIProvider } from "./openai";
export { AnthropicProvider } from "./anthropic";
export { MockProvider } from "./mock";
export {
  HeadroomCompressor,
  headroomFromEnv,
  headroomStats,
  withHeadroom,
  type CompressionOutcome,
  type HeadroomOptions,
  type HeadroomStats,
} from "./headroom";

export interface ProviderRouterOptions {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  /** Injected in tests; when present it handles every model. */
  override?: LLMProvider;
  fetchImpl?: typeof fetch;
  /**
   * Compresses prompts before they reach a provider. Omit it and prompts are
   * sent verbatim — see providers/headroom.ts.
   */
  compressor?: HeadroomCompressor | null;
}

/**
 * Picks a provider by model id. Falls back to the scripted provider when no
 * key is configured so local development and CI don't need credentials —
 * callers can detect this via `router.isLive`.
 */
export class ProviderRouter {
  private readonly providers: LLMProvider[];
  private readonly fallback: MockProvider;
  readonly isLive: boolean;

  constructor(options: ProviderRouterOptions = {}) {
    const resolved: LLMProvider[] = [];
    if (options.override) {
      resolved.push(options.override);
    } else {
      if (options.openaiApiKey) {
        resolved.push(
          new OpenAIProvider({ apiKey: options.openaiApiKey, fetchImpl: options.fetchImpl })
        );
      }
      if (options.anthropicApiKey) {
        resolved.push(
          new AnthropicProvider({ apiKey: options.anthropicApiKey, fetchImpl: options.fetchImpl })
        );
      }
    }

    // Wrapping happens once, at construction: `resolve()` stays a plain
    // lookup and nothing on the request path has to know about compression.
    const compressor = options.compressor;
    this.providers = compressor ? resolved.map((p) => withHeadroom(p, compressor)) : resolved;

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
    // null unless HEADROOM_BASE_URL points at a proxy.
    compressor: headroomFromEnv(env),
  });
}
