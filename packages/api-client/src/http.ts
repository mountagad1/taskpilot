// ============================================================
// TASKPILOT — HTTP TRANSPORT
// packages/api-client/src/http.ts
//
// The low-level layer under the SDK: auth headers, the shared error
// envelope, retries with backoff, and timeouts. Deliberately dependency
// free so it runs unchanged in Node, a browser, an edge worker and the
// extension's service worker.
// ============================================================

export interface ApiErrorPayload {
  code: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
  retry_after?: number;
}

/** Thrown for any non-2xx response, carrying the server's error envelope. */
export class TaskPilotError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = "TaskPilotError";
  }

  /** True when retrying the identical request could plausibly succeed. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }

  static fromBody(status: number, body: unknown): TaskPilotError {
    const payload = (body as { error?: ApiErrorPayload } | undefined)?.error;
    return new TaskPilotError(
      status,
      payload?.code ?? `http_${status}`,
      payload?.message ?? `Request failed with status ${status}`,
      payload?.issues,
      payload?.retry_after
    );
  }
}

export interface HttpClientOptions {
  /** Base URL of the TaskPilot API, e.g. https://taskpilot.cc */
  baseUrl?: string;
  /** Developer API key. Omit when relying on browser session cookies. */
  apiKey?: string;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Retries for retryable failures. Default 2. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  /** Send cookies. Enabled automatically when no API key is supplied. */
  credentials?: RequestCredentials;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** Overrides the client default for this call. */
  timeoutMs?: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: { total: number; page?: number; per_page?: number; unread?: number };
}

const DEFAULT_BASE_URL = "https://taskpilot.cc";

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly credentials?: RequestCredentials;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.credentials = options.credentials ?? (options.apiKey ? undefined : "include");

    const impl = options.fetchImpl ?? globalThis.fetch;
    if (!impl) {
      throw new Error("No fetch implementation is available. Pass one via `fetchImpl`.");
    }
    // Bind so a bare `globalThis.fetch` reference doesn't lose its receiver.
    this.fetchImpl = impl.bind(globalThis);
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, body });
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  /** Returns the unwrapped `data` field; list endpoints keep their `meta`. */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    let lastError: TaskPilotError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Honour Retry-After when the server sent one; otherwise back off.
        const wait = lastError?.retryAfter ? lastError.retryAfter * 1000 : 2 ** attempt * 300;
        await sleep(Math.min(wait, 30_000), options.signal);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: this.buildHeaders(options.body !== undefined),
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
          ...(this.credentials ? { credentials: this.credentials } : {}),
        });

        if (response.ok) {
          if (response.status === 204) return undefined as T;

          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) {
            // File downloads (CSV, manifests) come back as text.
            return (await response.text()) as unknown as T;
          }

          const payload = (await response.json()) as { data?: T; meta?: unknown };
          // List endpoints need their meta; single-resource ones don't.
          if (payload.meta !== undefined) return payload as unknown as T;
          return (payload.data ?? payload) as T;
        }

        const errorBody = await response.json().catch(() => undefined);
        lastError = TaskPilotError.fromBody(response.status, errorBody);
        if (!lastError.retryable) throw lastError;
      } catch (err) {
        if (err instanceof TaskPilotError) {
          if (!err.retryable) throw err;
          lastError = err;
        } else if (isAbort(err)) {
          // A caller-initiated abort is final; a timeout is worth retrying.
          if (options.signal?.aborted) throw err;
          lastError = new TaskPilotError(408, "timeout", `Request to ${path} timed out`);
        } else {
          lastError = new TaskPilotError(
            0,
            "network_error",
            err instanceof Error ? err.message : "Network request failed"
          );
        }
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError ?? new TaskPilotError(0, "unknown_error", `Request to ${path} failed`);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private buildHeaders(hasBody: boolean): Record<string, string> {
    return {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.headers,
    };
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true }
    );
  });
}
