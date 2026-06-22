// ============================================================
// TASKPILOT — SECURITY ARCHITECTURE
// apps/web/src/lib/security.ts
// Rate limiting, request validation, abuse detection, CSP
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── RATE LIMITER (Upstash Redis) ─────────────────────────────

interface RateLimitConfig {
  requests: number;
  window: number; // seconds
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/ai/smart-paste": { requests: 30, window: 60 },
  "/api/ai/process": { requests: 60, window: 60 },
  "/api/auth/session": { requests: 10, window: 60 },
  "/api/stripe": { requests: 20, window: 60 },
  "/api/export": { requests: 10, window: 60 },
  default: { requests: 100, window: 60 },
};

export async function checkRateLimit(
  req: NextRequest,
  identifier: string
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const path = req.nextUrl.pathname;
  const config =
    RATE_LIMITS[path] || RATE_LIMITS["default"];
  const key = `rl:${path}:${identifier}`;

  try {
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL!;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN!;

    const response = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, config.window],
        ["TTL", key],
      ]),
    });

    const [[, count], , [, ttl]] = await response.json();
    const remaining = Math.max(0, config.requests - count);
    const reset = Math.floor(Date.now() / 1000) + (ttl || config.window);

    return {
      allowed: count <= config.requests,
      remaining,
      reset,
    };
  } catch {
    // Fail open if Redis unavailable
    return { allowed: true, remaining: 99, reset: 0 };
  }
}

// ─── IP EXTRACTION ───────────────────────────────────────────

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ─── REQUEST VALIDATION ───────────────────────────────────────

export function validateAIRequest(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (!body.task_type) {
    return { valid: false, error: "task_type is required" };
  }

  const validTaskTypes = [
    "smart_paste", "summarize", "translate", "extract_data",
    "extract_emails", "extract_prices", "extract_companies",
    "extract_links", "rewrite_text", "generate_reply", "autofill_form",
    "export_csv", "export_excel", "export_pdf",
    "push_to_hubspot", "push_to_salesforce", "push_to_notion",
    "browser_action", "custom_prompt",
  ];

  if (!validTaskTypes.includes(body.task_type as string)) {
    return { valid: false, error: "Invalid task_type" };
  }

  // Validate context
  const context = body.context as Record<string, unknown> | undefined;
  if (!context || !context.url) {
    return { valid: false, error: "context.url is required" };
  }

  // URL validation
  try {
    new URL(context.url as string);
  } catch {
    return { valid: false, error: "Invalid URL in context" };
  }

  // Content length limits
  if (typeof context.visible_text === "string" && context.visible_text.length > 20000) {
    return { valid: false, error: "visible_text exceeds maximum length" };
  }

  return { valid: true };
}

// ─── INPUT SANITIZATION ───────────────────────────────────────

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .slice(0, 5000)
    // Remove potential injection attempts
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");
}

export function sanitizePageContext(context: Record<string, unknown>): Record<string, unknown> {
  return {
    url: typeof context.url === "string" ? context.url.slice(0, 2000) : "",
    title: typeof context.title === "string" ? context.title.slice(0, 500) : "",
    visible_text:
      typeof context.visible_text === "string"
        ? sanitizeInput(context.visible_text).slice(0, 10000)
        : "",
    selected_text:
      typeof context.selected_text === "string"
        ? sanitizeInput(context.selected_text).slice(0, 3000)
        : undefined,
    meta_description:
      typeof context.meta_description === "string"
        ? context.meta_description.slice(0, 500)
        : undefined,
    domain: typeof context.domain === "string" ? context.domain.slice(0, 200) : "",
    page_type: context.page_type,
    detected_forms: Array.isArray(context.detected_forms)
      ? context.detected_forms.slice(0, 50)
      : [],
    detected_tables: Array.isArray(context.detected_tables)
      ? context.detected_tables.slice(0, 10)
      : [],
  };
}

// ─── ABUSE DETECTION ─────────────────────────────────────────

export async function detectAbuse(
  identifier: string,
  action: string
): Promise<{ abuse: boolean; reason?: string }> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL!;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN!;

  try {
    // Check burst patterns (more than 10 requests in 5 seconds)
    const burstKey = `burst:${identifier}`;
    const burstResponse = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", burstKey],
        ["EXPIRE", burstKey, 5],
      ]),
    });
    const [[, burstCount]] = await burstResponse.json();
    if (burstCount > 15) {
      return { abuse: true, reason: "burst_detected" };
    }

    // Check if identifier is blocked
    const blockResponse = await fetch(`${upstashUrl}/get/blocked:${identifier}`, {
      headers: { Authorization: `Bearer ${upstashToken}` },
    });
    const blockData = await blockResponse.json();
    if (blockData.result) {
      return { abuse: true, reason: "blocked" };
    }

    return { abuse: false };
  } catch {
    return { abuse: false };
  }
}

// ─── CSP HEADERS ─────────────────────────────────────────────

export function getSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.posthog.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.stripe.com wss://*.supabase.co https://app.posthog.com",
      "frame-src https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-XSS-Protection": "1; mode=block",
  };
}

// ─── MIDDLEWARE HELPER ────────────────────────────────────────

export function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = getSecurityHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// ─── EXTENSION REQUEST VALIDATOR ─────────────────────────────

export function validateExtensionRequest(req: NextRequest): {
  valid: boolean;
  error?: string;
} {
  const origin = req.headers.get("origin") || "";
  const extId = req.headers.get("x-extension-id") || "";

  // Allow from extension origins (chrome-extension://*)
  if (origin.startsWith("chrome-extension://")) {
    return { valid: true };
  }

  // Allow from our own domain
  if (origin.includes("taskpilot.cc")) {
    return { valid: true };
  }

  // Allow direct API calls (no origin header = server-side or extension background)
  if (!origin) {
    return { valid: true };
  }

  return { valid: false, error: "Invalid origin" };
}

// ─── SESSION FINGERPRINTING ───────────────────────────────────

export async function generateSessionFingerprint(req: NextRequest): Promise<string> {
  const ip = getClientIP(req);
  const ua = req.headers.get("user-agent") || "";
  const lang = req.headers.get("accept-language") || "";
  
  const raw = `${ip}:${ua.slice(0, 100)}:${lang.slice(0, 30)}`;
  
  const msgBuffer = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ─── ERROR RESPONSES ─────────────────────────────────────────

export function errorResponse(
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  const response = NextResponse.json(
    { error: message, ...extra },
    { status }
  );
  return applySecurityHeaders(response);
}
