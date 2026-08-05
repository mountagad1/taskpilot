// ============================================================
// TASKPILOT — AI PROXY EDGE FUNCTION
// supabase/functions/ai-proxy/index.ts
// Secure API proxy with rate limiting, usage tracking, caching
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UPSTASH_REDIS_URL = Deno.env.get("UPSTASH_REDIS_URL")!;
const UPSTASH_REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── CORS HEADERS ────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ─── RATE LIMIT (Upstash Redis) ───────────────────────────────

async function checkRateLimit(identifier: string, plan: string): Promise<boolean> {
  const limits = {
    free: { requests: 20, window: 3600 },      // 20/hour
    pro: { requests: 500, window: 3600 },       // 500/hour
    enterprise: { requests: 5000, window: 3600 },
  };

  const limit = limits[plan as keyof typeof limits] || limits.free;
  const key = `rl:${identifier}`;

  try {
    const response = await fetch(`${UPSTASH_REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, limit.window],
      ]),
    });

    const [[, count]] = await response.json();
    return count <= limit.requests;
  } catch {
    return true; // Fail open if Redis is down
  }
}

// ─── SEMANTIC CACHE ──────────────────────────────────────────

async function getCached(cacheKey: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${UPSTASH_REDIS_URL}/get/${cacheKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}` },
    });
    const data = await response.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

async function setCache(cacheKey: string, value: unknown, ttlSeconds = 300) {
  try {
    await fetch(`${UPSTASH_REDIS_URL}/set/${cacheKey}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: JSON.stringify(value),
        ex: ttlSeconds,
      }),
    });
  } catch {
    // Cache set is best-effort
  }
}

// ─── MAIN HANDLER ────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse request
    const body = await req.json();
    const sessionId = req.headers.get("x-session-id") || "anonymous";
    const authHeader = req.headers.get("authorization");

    // ── Auth & Session ──────────────────────────────────────
    let userId: string | null = null;
    let plan = "free";

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single();
        plan = profile?.plan || "free";
      }
    }

    // ── Rate Limiting ────────────────────────────────────────
    const identifier = userId || sessionId;
    const allowed = await checkRateLimit(identifier, plan);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retry_after: 60 }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Usage Limit Check (free tier) ────────────────────────
    if (!userId && plan === "free") {
      const { data: session } = await supabase
        .from("anonymous_sessions")
        .select("actions_used, actions_limit")
        .eq("session_id", sessionId)
        .single();

      if (session && session.actions_used >= session.actions_limit) {
        return new Response(
          JSON.stringify({
            error: "Usage limit reached",
            upgrade_url: "https://taskpilot.cc/pricing",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { task_type, input, context, model_override } = body;

    // ── Cache Check ──────────────────────────────────────────
    const cacheKey = buildCacheKey(task_type, input, context);
    const cached = await getCached(cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify({ ...cached, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Model Selection ──────────────────────────────────────
    const model = selectModel(task_type, plan, model_override);

    // ── Context Optimization ────────────────────────────────
    const optimizedContext = optimizeContext(context, task_type);

    // ── AI Call ──────────────────────────────────────────────
    const systemPrompt = getSystemPrompt(task_type);
    const userPrompt = buildUserPrompt(task_type, input, optimizedContext);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const result = JSON.parse(aiData.choices[0].message.content);
    const usage = aiData.usage;
    const costUsd = estimateCost(model, usage.total_tokens);

    // ── Log Request ──────────────────────────────────────────
    await supabase.from("ai_requests").insert({
      user_id: userId,
      session_id: userId ? null : sessionId,
      task_type,
      input: input?.slice(0, 500),
      url: context?.url,
      domain: context?.domain,
      model_used: model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      cost_usd: costUsd,
      execution_time_ms: Date.now() - startTime,
      cached: false,
      success: true,
      confidence: result.confidence || null,
    });

    // ── Update Usage ─────────────────────────────────────────
    if (!userId) {
      await supabase.rpc("increment_session_usage", { p_session_id: sessionId });
    } else {
      await supabase.rpc("increment_user_usage", {
        p_user_id: userId,
        p_tokens: usage.total_tokens,
        p_cost: costUsd,
      });
    }

    // ── Cache Response ───────────────────────────────────────
    await setCache(cacheKey, result, 300);

    const response = {
      result,
      model_used: model,
      tokens_used: {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
        total: usage.total_tokens,
        cost_usd: costUsd,
      },
      execution_time_ms: Date.now() - startTime,
      cached: false,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[AI Proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── HELPERS ─────────────────────────────────────────────────

function selectModel(taskType: string, plan: string, override?: string): string {
  if (override && plan !== "free") return override;
  const complexTasks = ["browser_action", "custom_prompt", "smart_paste"];
  if (complexTasks.includes(taskType) && plan === "pro") return "gpt-4o-mini";
  return "gpt-4o-mini"; // Default for cost efficiency
}

function buildCacheKey(taskType: string, input: string, context: Record<string, string>): string {
  const hash = simpleHash(`${taskType}:${(input || "").slice(0, 100)}:${context?.url || ""}:${(context?.visible_text || "").slice(0, 200)}`);
  return `ai:${taskType}:${hash}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function optimizeContext(context: Record<string, unknown>, taskType: string): Record<string, unknown> {
  const maxText: Record<string, number> = {
    summarize: 3000, translate: 2000, extract_data: 2000,
    smart_paste: 500, generate_reply: 1500, default: 1500,
  };
  const limit = maxText[taskType] || maxText.default;
  return {
    ...context,
    visible_text: ((context.visible_text as string) || "").slice(0, limit),
  };
}

function getSystemPrompt(taskType: string): string {
  const prompts: Record<string, string> = {
    smart_paste: `You are a smart form-filling AI. Map clipboard text to form fields. Return JSON: {"mappings": [{"field_selector": "...", "field_label": "...", "value": "...", "confidence": 0.95}], "confidence": 0.9, "unmapped": {}}`,
    summarize: `Summarize web content clearly and concisely. Return JSON: {"summary": "...", "key_points": ["...", "..."], "word_count": 0, "reading_time_min": 0}`,
    translate: `Translate content accurately. Return JSON: {"translated": "...", "detected_language": "...", "target_language": "en"}`,
    extract_data: `Extract structured data from web content. Return JSON: {"data": [...], "columns": [...], "row_count": 0, "data_type": "..."}`,
    extract_emails: `Extract all email addresses. Return JSON: {"emails": ["..."], "count": 0}`,
    extract_prices: `Extract all prices and product names. Return JSON: {"items": [{"name": "...", "price": "...", "currency": "..."}], "count": 0}`,
    generate_reply: `Write a professional reply. Return JSON: {"reply": "...", "tone": "professional", "subject": "..."}`,
    rewrite_text: `Rewrite the text to be clearer and more professional. Return JSON: {"rewritten": "...", "improvements": ["..."]}`,
    default: `Complete the task accurately. Return a relevant JSON object with the result.`,
  };
  return prompts[taskType] || prompts.default;
}

function buildUserPrompt(taskType: string, input: string, context: Record<string, unknown>): string {
  return `URL: ${context.url || "unknown"}
Title: ${context.title || "unknown"}
Task: ${input || taskType}

Page content:
${(context.visible_text as string || "").slice(0, 2000)}

${context.selected_text ? `Selected text:\n${context.selected_text}` : ""}
${context.detected_forms ? `Form fields: ${JSON.stringify(context.detected_forms).slice(0, 800)}` : ""}`;
}

function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    "gpt-4o-mini": 0.00000015,
    "gpt-4o": 0.0000025,
  };
  return tokens * (rates[model] || rates["gpt-4o-mini"]);
}
