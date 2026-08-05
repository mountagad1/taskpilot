// ============================================================
// TASKPILOT — OPENAI PROVIDER
// services/api/src/runtime/providers/openai.ts
// ============================================================

import {
  LLMError,
  estimateCost,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./types";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * TaskPilot model ids are stable across provider changes; this maps them to
 * whatever the vendor currently calls the same tier.
 */
const MODEL_ALIASES: Record<string, string> = {
  "gpt-4.1-mini": "gpt-4o-mini",
  "gpt-4.1": "gpt-4o",
};

export interface OpenAIProviderOptions {
  apiKey: string;
  endpoint?: string;
  /** Retries on 429/5xx. Each retry waits 2^n * 250ms. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  supports(model: string): boolean {
    return model.startsWith("gpt-") || model in MODEL_ALIASES;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const vendorModel = MODEL_ALIASES[request.model] ?? request.model;

    const body = {
      model: vendorModel,
      messages: request.messages,
      max_tokens: request.max_tokens ?? 1500,
      temperature: request.temperature ?? 0.1,
      ...(request.json ? { response_format: { type: "json_object" as const } } : {}),
    };

    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await delay(2 ** attempt * 250, request.signal);

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (err) {
        // Network-level failure: worth another attempt.
        lastError = new LLMError(
          err instanceof Error ? err.message : "network error",
          undefined,
          true
        );
        continue;
      }

      if (!response.ok) {
        const detail = await safeText(response);
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new LLMError(
          `OpenAI ${response.status}: ${detail.slice(0, 300)}`,
          response.status,
          retryable
        );
        if (!retryable) throw lastError;
        continue;
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LLMError("OpenAI returned no message content");
      }

      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;

      return {
        content,
        model: request.model,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
          estimated_cost_usd: estimateCost(request.model, {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
          }),
        },
      };
    }

    throw lastError ?? new LLMError("OpenAI request failed");
  }
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new LLMError("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new LLMError("aborted"));
      },
      { once: true }
    );
  });
}
