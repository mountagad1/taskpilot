// ============================================================
// TASKPILOT — SCRIPTED PROVIDER (tests + offline dev)
// services/api/src/runtime/providers/mock.ts
//
// Not a stub: this is how planner/reasoner/runtime behaviour is asserted
// without a network call, and how `pnpm dev` behaves when no API key is
// configured (the app degrades to heuristics rather than 500ing).
// ============================================================

import { LLMError, estimateCost, type LLMProvider, type LLMRequest, type LLMResponse } from "./types";

export type MockResponder = (request: LLMRequest) => string | Promise<string>;

export interface MockProviderOptions {
  /** Consumed in order; the last entry repeats once the queue is drained. */
  responses?: string[];
  /** Full control — takes precedence over `responses`. */
  responder?: MockResponder;
  /** Throw instead of answering, to exercise failure paths. */
  failWith?: LLMError;
  latencyMs?: number;
}

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  /** Every request seen, in order. Assertions read this. */
  readonly calls: LLMRequest[] = [];

  private queue: string[];
  private readonly responder?: MockResponder;
  private readonly failWith?: LLMError;
  private readonly latencyMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.queue = [...(options.responses ?? [])];
    this.responder = options.responder;
    this.failWith = options.failWith;
    this.latencyMs = options.latencyMs ?? 0;
  }

  supports(): boolean {
    return true;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.calls.push(request);
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    if (this.failWith) throw this.failWith;

    let content: string;
    if (this.responder) {
      content = await this.responder(request);
    } else if (this.queue.length > 1) {
      content = this.queue.shift()!;
    } else if (this.queue.length === 1) {
      content = this.queue[0];
    } else {
      content = "{}";
    }

    const promptChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.ceil(content.length / 4);

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
}
