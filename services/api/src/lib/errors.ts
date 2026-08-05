// ============================================================
// TASKPILOT API — ERROR MODEL
// services/api/src/lib/errors.ts
//
// One envelope for every response the API produces, so the SDK, the
// extension and the dashboard all parse failures the same way.
// ============================================================

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "plan_limit"
  | "payment_required"
  | "not_configured"
  | "upstream_error"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  payment_required: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  plan_limit: 402,
  not_configured: 503,
  upstream_error: 502,
  internal_error: 500,
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level detail for validation_failed. */
    issues?: Array<{ path: string; message: string }>;
    /** Present on rate_limited: seconds until the caller may retry. */
    retry_after?: number;
  };
}

/**
 * Thrown from anywhere inside a handler; `withApi` converts it to a response.
 * Using an exception keeps guard clauses from having to thread a response
 * back through every layer.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS[this.code];
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues?.length ? { issues: this.issues } : {}),
        ...(this.retryAfter !== undefined ? { retry_after: this.retryAfter } : {}),
      },
    };
  }

  toResponse(): Response {
    return Response.json(this.toBody(), {
      status: this.status,
      headers: this.retryAfter !== undefined ? { "Retry-After": String(this.retryAfter) } : undefined,
    });
  }
}

export const badRequest = (message: string) => new ApiError("bad_request", message);
export const unauthorized = (message = "Authentication required") =>
  new ApiError("unauthorized", message);
export const forbidden = (message = "You do not have access to this resource") =>
  new ApiError("forbidden", message);
export const notFound = (message = "Not found") => new ApiError("not_found", message);
export const conflict = (message: string) => new ApiError("conflict", message);
export const planLimit = (message: string) => new ApiError("plan_limit", message);
export const notConfigured = (message: string) => new ApiError("not_configured", message);

export const validationFailed = (
  issues: Array<{ path: string; message: string }>,
  message = "The request body failed validation"
) => new ApiError("validation_failed", message, issues);

export const rateLimited = (retryAfter: number) =>
  new ApiError("rate_limited", "Too many requests. Slow down.", undefined, retryAfter);

/** Successful JSON envelope. `data` is always the payload root. */
export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }): Response {
  return Response.json({ data }, { status: init?.status ?? 200, headers: init?.headers });
}

export function okList<T>(
  items: T[],
  meta?: Record<string, unknown>
): Response {
  return Response.json({ data: items, meta: meta ?? { total: items.length } });
}
