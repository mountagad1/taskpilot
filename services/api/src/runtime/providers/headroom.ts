// ============================================================
// TASKPILOT — HEADROOM CONTEXT COMPRESSION
// services/api/src/runtime/providers/headroom.ts
//
// Headroom (https://github.com/headroomlabs-ai/headroom) compresses the
// context we send to a model — page dumps, extracted tables, run history —
// before it reaches the provider. It runs as a local proxy; we talk to its
// `POST /v1/compress` endpoint and send the messages it hands back.
//
// Two rules shape everything below:
//
//   1. Compression is never allowed to break a request. Every failure path
//      — proxy down, timeout, malformed body, unexpected shape — falls back
//      to the original messages. A token optimizer that turns a working
//      product into a 500 is worse than no optimizer.
//   2. It only runs when a proxy is configured. With HEADROOM_BASE_URL
//      unset the decorator is never installed, so deployments that don't run
//      the proxy pay nothing — not even a branch on the hot path.
//
// We speak the proxy's HTTP contract directly rather than depending on the
// `headroom-ai` npm client: that package is itself a fetch wrapper over
// these two endpoints, and the API service keeps its dependency surface
// small. The wire format is pinned by headroom.test.ts.
// ============================================================

import {
  estimateTokens,
  type CompressionStats,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from "./types";

/** Where a self-hosted `headroom proxy` listens by default. */
const DEFAULT_BASE_URL = "http://localhost:8787";

/**
 * Compression is a network hop in front of a much slower model call. If the
 * proxy can't answer quickly it isn't worth waiting for — we'd rather send
 * the uncompressed prompt than add latency to every request.
 */
const DEFAULT_TIMEOUT_MS = 2_000;

/**
 * Below this, compression can't win enough tokens to pay for the round trip.
 * Short planner prompts skip it entirely.
 */
const DEFAULT_MIN_TOKENS = 2_000;

export interface HeadroomOptions {
  baseUrl?: string;
  /** Bearer token, when the proxy is deployed with auth enabled. */
  apiKey?: string;
  timeoutMs?: number;
  /** Requests estimated below this many tokens are sent uncompressed. */
  minTokens?: number;
  fetchImpl?: typeof fetch;
  /** Called after every attempt — compressed or not. Never throws. */
  onResult?: (result: CompressionOutcome) => void;
}

/**
 * What one compression attempt did. `compressed: false` with a
 * `skipped_reason` covers both "not worth it" and "proxy failed".
 */
export type CompressionOutcome = CompressionStats;

/** The proxy's `POST /v1/compress` response body. */
interface ProxyCompressResponse {
  messages?: Array<{ role?: string; content?: unknown }>;
  tokens_before?: number;
  tokens_after?: number;
  tokens_saved?: number;
  compression_ratio?: number;
  transforms_applied?: string[];
}

/**
 * Client for a Headroom proxy. One instance is shared by every provider —
 * it holds no per-request state.
 */
export class HeadroomCompressor {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly minTokens: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onResult?: (result: CompressionOutcome) => void;

  constructor(options: HeadroomOptions = {}) {
    // Trailing slashes would produce `//v1/compress`, which some proxies 404.
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onResult = options.onResult;
  }

  /**
   * Returns compressed messages, or the originals when compression was
   * skipped or failed. Never rejects.
   */
  async compress(
    messages: LLMMessage[],
    model: string,
    signal?: AbortSignal
  ): Promise<{
    messages: LLMMessage[];
    outcome: CompressionOutcome;
  }> {
    const started = Date.now();
    const estimated = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

    if (estimated < this.minTokens) {
      return {
        messages,
        outcome: this.record({
          compressed: false,
          tokens_before: estimated,
          tokens_after: estimated,
          tokens_saved: 0,
          transforms: [],
          duration_ms: 0,
          skipped_reason: "below_min_tokens",
        }),
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/compress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Lets Headroom's dashboard attribute savings to this service.
          "X-Headroom-Stack": "taskpilot-api",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ messages, model }),
        // A cancelled run must not sit here waiting on the proxy, so the
        // caller's signal aborts compression too.
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
          : AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Proxy down, DNS failure, or our own timeout. Send the prompt as-is.
      return this.failOpen(messages, estimated, started, describeError(err));
    }

    if (!response.ok) {
      return this.failOpen(messages, estimated, started, `http_${response.status}`);
    }

    let body: ProxyCompressResponse;
    try {
      body = (await response.json()) as ProxyCompressResponse;
    } catch {
      return this.failOpen(messages, estimated, started, "invalid_json");
    }

    const compressed = toLLMMessages(body.messages);
    if (!compressed) {
      // A 200 whose body we don't understand is a proxy-version mismatch.
      // Treat it exactly like an outage.
      return this.failOpen(messages, estimated, started, "unexpected_response");
    }

    const before = body.tokens_before ?? estimated;
    const after = body.tokens_after ?? before;

    return {
      messages: compressed,
      outcome: this.record({
        compressed: true,
        tokens_before: before,
        tokens_after: after,
        tokens_saved: body.tokens_saved ?? Math.max(0, before - after),
        transforms: body.transforms_applied ?? [],
        duration_ms: Date.now() - started,
      }),
    };
  }

  private failOpen(
    messages: LLMMessage[],
    estimated: number,
    started: number,
    reason: string
  ): { messages: LLMMessage[]; outcome: CompressionOutcome } {
    return {
      messages,
      outcome: this.record({
        compressed: false,
        tokens_before: estimated,
        tokens_after: estimated,
        tokens_saved: 0,
        transforms: [],
        duration_ms: Date.now() - started,
        skipped_reason: reason,
      }),
    };
  }

  /** Reports an outcome to the observer, swallowing observer errors. */
  private record(outcome: CompressionOutcome): CompressionOutcome {
    try {
      this.onResult?.(outcome);
    } catch {
      // A metrics sink must never take down a model call.
    }
    return outcome;
  }
}

/**
 * Wraps a provider so its prompts pass through Headroom first. The wrapper
 * keeps the provider's own `name` and `supports()` so routing is unchanged;
 * only the messages differ.
 */
export function withHeadroom(
  provider: LLMProvider,
  compressor: HeadroomCompressor
): LLMProvider {
  return {
    name: provider.name,
    supports: (model: string) => provider.supports(model),
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const { messages, outcome } = await compressor.compress(
        request.messages,
        request.model,
        request.signal
      );
      const response = await provider.complete({ ...request, messages });
      return { ...response, compression: outcome };
    },
  };
}

// ─── PROCESS-LIFETIME STATS ──────────────────────────────────
//
// Because compression fails open, a proxy that is down looks exactly like
// one that is working — the product keeps answering, just at full price.
// These counters are what make that difference visible; /health reports
// them.

export interface HeadroomStats {
  attempts: number;
  compressed: number;
  failures: number;
  tokens_saved: number;
  last_failure_reason?: string;
}

const stats: HeadroomStats = { attempts: 0, compressed: 0, failures: 0, tokens_saved: 0 };

/** Snapshot of what compression has done since the process started. */
export function headroomStats(): HeadroomStats {
  return { ...stats };
}

function recordGlobal(outcome: CompressionOutcome): void {
  // "Not worth compressing" is a normal outcome, not an attempt that failed.
  if (outcome.skipped_reason === "below_min_tokens") return;

  stats.attempts += 1;
  if (outcome.compressed) {
    stats.compressed += 1;
    stats.tokens_saved += outcome.tokens_saved;
    return;
  }

  stats.failures += 1;
  stats.last_failure_reason = outcome.skipped_reason;
  // Warn on the first failure and then sparsely: a broken proxy should be
  // obvious in the logs without drowning them once it stays broken.
  if (stats.failures === 1 || stats.failures % 50 === 0) {
    console.warn(
      `[headroom] compression unavailable (${outcome.skipped_reason}); ` +
        `sending prompts uncompressed. failures=${stats.failures}` +
        // /v1/compress answers non-loopback callers with 404 rather than 403
        // so it stays invisible to scanners — which makes the single most
        // likely misconfiguration look like a wrong URL.
        (outcome.skipped_reason === "http_404"
          ? " — a 404 from a remote proxy usually means HEADROOM_COMPRESS_ALLOW_REMOTE=1" +
            " is not set on it; /v1/compress is loopback-only by default"
          : "")
    );
  }
}

/**
 * Builds a compressor from env, or null when this deployment doesn't run a
 * proxy. Setting HEADROOM_BASE_URL is what turns the feature on.
 */
export function headroomFromEnv(
  env: Record<string, string | undefined> = process.env
): HeadroomCompressor | null {
  const baseUrl = env.HEADROOM_BASE_URL?.trim();
  if (!baseUrl) return null;

  return new HeadroomCompressor({
    baseUrl,
    apiKey: env.HEADROOM_API_KEY?.trim() || undefined,
    timeoutMs: positiveInt(env.HEADROOM_TIMEOUT_MS),
    minTokens: positiveInt(env.HEADROOM_MIN_TOKENS),
    onResult: recordGlobal,
  });
}

function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Validates the proxy's messages before we hand them to a provider. Anything
 * unexpected returns null so the caller can fall back to the originals — a
 * dropped system prompt would silently change model behaviour.
 */
function toLLMMessages(raw: ProxyCompressResponse["messages"]): LLMMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const messages: LLMMessage[] = [];
  for (const item of raw) {
    if (typeof item?.content !== "string") return null;
    if (item.role !== "system" && item.role !== "user" && item.role !== "assistant") {
      return null;
    }
    messages.push({ role: item.role, content: item.content });
  }
  return messages;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    // AbortSignal.timeout() rejects with a TimeoutError DOMException.
    return err.name === "TimeoutError" ? "timeout" : `network_error:${err.name}`;
  }
  return "network_error";
}
