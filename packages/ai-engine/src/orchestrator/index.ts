// ============================================================
// TASKPILOT — AI ORCHESTRATION ENGINE
// packages/ai-engine/src/orchestrator/index.ts
// ============================================================

import type {
  AIRequest,
  AIResponse,
  AIModel,
  TaskType,
  TaskComplexity,
  ToolName,
  TokenUsage,
  ToolExecutionResult,
  PageContext,
} from "@taskpilot/shared/types";

import { TokenOptimizer } from "../optimizer/token-optimizer";
import { SemanticCache } from "../cache/semantic-cache";
import { ToolRegistry } from "../tools/tool-registry";

// ─── MODEL ROUTING CONFIGURATION ─────────────────────────────

const MODEL_ROUTING: Record<TaskComplexity, AIModel> = {
  simple: "gpt-4.1-mini",
  moderate: "gpt-4.1-mini",
  complex: "gpt-4.1",
};

const TASK_COMPLEXITY: Record<TaskType, TaskComplexity> = {
  smart_paste: "moderate",
  summarize: "simple",
  translate: "simple",
  extract_data: "moderate",
  extract_emails: "simple",
  extract_prices: "simple",
  extract_companies: "moderate",
  extract_links: "simple",
  rewrite_text: "moderate",
  generate_reply: "moderate",
  autofill_form: "moderate",
  export_csv: "simple",
  export_excel: "simple",
  export_pdf: "simple",
  push_to_hubspot: "simple",
  push_to_salesforce: "simple",
  push_to_notion: "simple",
  push_to_airtable: "simple",
  browser_action: "complex",
  custom_prompt: "complex",
};

// ─── TOOL PLANNING ────────────────────────────────────────────

const TASK_TOOL_MAP: Record<TaskType, ToolName[]> = {
  smart_paste: ["detect_forms", "autofill_fields"],
  summarize: ["extract_visible_content", "summarize_content"],
  translate: ["extract_visible_content", "translate_content"],
  extract_data: ["extract_visible_content", "extract_tables"],
  extract_emails: ["extract_visible_content", "extract_emails"],
  extract_prices: ["extract_visible_content", "extract_prices"],
  extract_companies: ["extract_visible_content", "extract_tables"],
  extract_links: ["extract_links"],
  rewrite_text: ["rewrite_text"],
  generate_reply: ["extract_visible_content", "generate_reply"],
  autofill_form: ["detect_forms", "autofill_fields"],
  export_csv: ["extract_visible_content", "extract_tables", "export_csv"],
  export_excel: ["extract_visible_content", "extract_tables", "export_excel"],
  export_pdf: ["extract_visible_content", "export_pdf"],
  push_to_hubspot: ["extract_visible_content", "push_to_hubspot"],
  push_to_salesforce: ["extract_visible_content", "push_to_salesforce"],
  push_to_notion: ["extract_visible_content", "create_notion_page"],
  push_to_airtable: ["extract_visible_content", "create_airtable_record"],
  browser_action: ["extract_visible_content", "click_element", "type_text"],
  custom_prompt: ["extract_visible_content"],
};

// ─── ORCHESTRATOR ────────────────────────────────────────────

export class TaskPilotOrchestrator {
  private tokenOptimizer: TokenOptimizer;
  private semanticCache: SemanticCache;
  private toolRegistry: ToolRegistry;
  private openaiApiKey: string;

  constructor(openaiApiKey: string, redisUrl?: string) {
    this.openaiApiKey = openaiApiKey;
    this.tokenOptimizer = new TokenOptimizer();
    this.semanticCache = new SemanticCache(redisUrl);
    this.toolRegistry = new ToolRegistry();
  }

  // ── MAIN EXECUTION PIPELINE ──────────────────────────────

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    // 1. Check semantic cache
    const cacheKey = this.buildCacheKey(request);
    const cached = await this.semanticCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        request_id: request.id,
        cached: true,
        execution_time_ms: Date.now() - startTime,
      };
    }

    // 2. Detect intent & select tools
    const tools = this.selectTools(request.task_type);
    const complexity = TASK_COMPLEXITY[request.task_type];
    const model = request.model_override || MODEL_ROUTING[complexity];

    // 3. Extract & optimize context
    const optimizedContext = this.tokenOptimizer.optimize(
      request.context,
      request.task_type
    );

    // 4. Execute tool pipeline
    const toolResults: ToolExecutionResult[] = [];
    for (const toolName of tools) {
      const result = await this.toolRegistry.execute(toolName, {
        context: optimizedContext,
        input: request.input,
        previousResults: toolResults,
      });
      toolResults.push(result);
      if (!result.success) break; // Stop on failure
    }

    // 5. Determine if AI call is needed
    const needsAI = this.requiresAICall(request.task_type, toolResults);
    let aiResult: unknown = null;
    let tokenUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
    };

    if (needsAI) {
      const aiCall = await this.callAI(
        request,
        model,
        optimizedContext,
        toolResults
      );
      aiResult = aiCall.result;
      tokenUsage = aiCall.tokens;
    }

    // 6. Assemble final result
    const finalResult = this.assembleResult(request.task_type, toolResults, aiResult);

    // 7. Build response
    const response: AIResponse = {
      request_id: request.id,
      result: finalResult,
      tools_executed: toolResults,
      model_used: model,
      tokens_used: tokenUsage,
      execution_time_ms: Date.now() - startTime,
      cached: false,
      confidence: this.calculateConfidence(toolResults),
    };

    // 8. Cache the response
    await this.semanticCache.set(cacheKey, response, 300); // 5min TTL

    return response;
  }

  // ── INTENT → TOOLS ───────────────────────────────────────

  private selectTools(taskType: TaskType): ToolName[] {
    return TASK_TOOL_MAP[taskType] || ["extract_visible_content"];
  }

  // ── HEURISTIC ROUTING (skip AI if possible) ──────────────

  private requiresAICall(taskType: TaskType, toolResults: ToolExecutionResult[]): boolean {
    // These tasks can be handled purely by tools without AI
    const toolOnlyTasks: TaskType[] = [
      "extract_emails",
      "extract_links",
      "extract_prices",
      "export_csv",
    ];
    if (toolOnlyTasks.includes(taskType)) return false;

    // Check if tools already produced sufficient data
    const successfulTools = toolResults.filter((r) => r.success);
    if (successfulTools.length === 0) return true;

    // Smart paste: only call AI if confidence < 0.7
    if (taskType === "smart_paste") {
      const formResult = toolResults.find((r) => r.tool === "detect_forms");
      if (formResult?.data && (formResult.data as { confidence: number }).confidence > 0.7) {
        return false;
      }
    }

    return true;
  }

  // ── AI CALL ──────────────────────────────────────────────

  private async callAI(
    request: AIRequest,
    model: AIModel,
    context: Partial<PageContext>,
    toolResults: ToolExecutionResult[]
  ): Promise<{ result: unknown; tokens: TokenUsage }> {
    const prompt = this.buildPrompt(request, context, toolResults);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model === "gpt-4.1-mini" ? "gpt-4o-mini" : "gpt-4o",
        messages: [
          { role: "system", content: this.getSystemPrompt(request.task_type) },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    const usage = data.usage;

    return {
      result: content,
      tokens: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        estimated_cost_usd: this.estimateCost(model, usage.total_tokens),
      },
    };
  }

  // ── PROMPT BUILDERS ──────────────────────────────────────

  private buildPrompt(
    request: AIRequest,
    context: Partial<PageContext>,
    toolResults: ToolExecutionResult[]
  ): string {
    const toolData = toolResults
      .filter((r) => r.success && r.data)
      .map((r) => `${r.tool}: ${JSON.stringify(r.data).slice(0, 500)}`)
      .join("\n");

    return `URL: ${context.url}
Title: ${context.title}
User request: ${request.input}

Tool results:
${toolData}

Page content (truncated):
${(context.visible_text || "").slice(0, 2000)}

Respond with a JSON object containing the result.`;
  }

  private getSystemPrompt(taskType: TaskType): string {
    const prompts: Partial<Record<TaskType, string>> = {
      smart_paste: `You are a form intelligence engine. Map clipboard data to form fields accurately. Return: {"mappings": [{"field_selector": "...", "value": "...", "confidence": 0.0-1.0}], "confidence": 0.0-1.0}`,
      summarize: `You are a content summarizer. Create concise, structured summaries. Return: {"summary": "...", "key_points": [...], "reading_time_min": 0}`,
      extract_data: `You are a data extraction engine. Extract structured data from web content. Return: {"data": [...], "columns": [...], "row_count": 0}`,
      generate_reply: `You are an email/message reply assistant. Write professional, contextually appropriate replies. Return: {"reply": "...", "tone": "...", "subject_suggestion": "..."}`,
      rewrite_text: `You are a text rewriting assistant. Improve clarity and professionalism. Return: {"rewritten": "...", "changes_summary": "..."}`,
      translate: `You are a translation engine. Translate accurately preserving tone. Return: {"translated": "...", "detected_language": "...", "target_language": "..."}`,
    };
    return (
      prompts[taskType] ||
      `You are TaskPilot AI. Complete the requested task accurately. Return a JSON object with the result.`
    );
  }

  // ── RESULT ASSEMBLY ──────────────────────────────────────

  private assembleResult(
    taskType: TaskType,
    toolResults: ToolExecutionResult[],
    aiResult: unknown
  ): unknown {
    if (aiResult) return aiResult;

    // Return tool results data when AI not used
    const primaryResult = toolResults.find((r) => r.success && r.data);
    return primaryResult?.data || null;
  }

  // ── UTILITIES ────────────────────────────────────────────

  private buildCacheKey(request: AIRequest): string {
    const { task_type, input, context } = request;
    const contextHash = this.hashString(
      `${context.url}:${(context.visible_text || "").slice(0, 200)}`
    );
    return `tp:${task_type}:${this.hashString(input)}:${contextHash}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private calculateConfidence(toolResults: ToolExecutionResult[]): number {
    if (toolResults.length === 0) return 0;
    const successful = toolResults.filter((r) => r.success).length;
    return successful / toolResults.length;
  }

  private estimateCost(model: AIModel, tokens: number): number {
    const rates: Record<AIModel, number> = {
      "gpt-4.1-mini": 0.00000015,
      "gpt-4.1": 0.0000025,
      "claude-sonnet-4-20250514": 0.000003,
      "claude-haiku-4-5-20251001": 0.00000025,
    };
    return tokens * (rates[model] || rates["gpt-4.1-mini"]);
  }
}
