// ============================================================
// TASKPILOT — ANTHROPIC PROVIDER
// services/api/src/runtime/providers/anthropic.ts
// ============================================================

import {
  LLMError,
  estimateCost,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./types";

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface AnthropicProviderOptions {
  apiKey: string;
  endpoint?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  supports(model: string): boolean {
    return model.startsWith("claude-");
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Anthropic takes the system prompt as a top-level field, not a message.
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // There is no response_format here; asking for JSON in the system prompt
    // and prefilling is the supported way to constrain the shape.
    const systemPrompt = request.json
      ? `${system}\n\nRespond with a single valid JSON object and nothing else. Do not wrap it in markdown fences.`
      : system;

    const body = {
      model: request.model,
      max_tokens: request.max_tokens ?? 1500,
      temperature: request.temperature ?? 0.1,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    };

    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await delay(2 ** attempt * 250, request.signal);

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (err) {
        lastError = new LLMError(err instanceof Error ? err.message : "network error", undefined, true);
        continue;
      }

      if (!response.ok) {
        const detail = await safeText(response);
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new LLMError(
          `Anthropic ${response.status}: ${detail.slice(0, 300)}`,
          response.status,
          retryable
        );
        if (!retryable) throw lastError;
        continue;
      }

      const data = (await response.json()) as AnthropicResponse;
      const content = data.content?.find((block) => block.type === "text")?.text;
      if (typeof content !== "string") {
        throw new LLMError("Anthropic returned no text block");
      }

      const promptTokens = data.usage?.input_tokens ?? 0;
      const completionTokens = data.usage?.output_tokens ?? 0;

      return {
        content,
        model: request.model,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          estimated_cost_usd: estimateCost(request.model, {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
          }),
        },
      };
    }

    throw lastError ?? new LLMError("Anthropic request failed");
  }
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
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
