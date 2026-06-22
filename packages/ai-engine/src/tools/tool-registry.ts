import type { ToolName, ToolDefinition } from '@taskpilot/shared'

export interface ToolExecutionContext {
  pageContent: string
  pageUrl: string
  selectedText?: string
  userInput?: string
  tables?: string[][]
  forms?: unknown[]
  pageType?: string
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  tokensUsed?: number
  executionMs?: number
}

export type ToolHandler = (
  ctx: ToolExecutionContext,
  options?: Record<string, unknown>
) => Promise<ToolResult>

class ToolRegistry {
  private tools = new Map<ToolName, ToolDefinition & { handler: ToolHandler }>()

  register(name: ToolName, definition: ToolDefinition, handler: ToolHandler) {
    this.tools.set(name, { ...definition, handler })
  }

  get(name: ToolName) {
    return this.tools.get(name)
  }

  list(): ToolName[] {
    return Array.from(this.tools.keys())
  }

  async execute(
    name: ToolName,
    ctx: ToolExecutionContext,
    options?: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` }
    }

    const start = Date.now()
    try {
      const result = await tool.handler(ctx, options)
      return { ...result, executionMs: Date.now() - start }
    } catch (err) {
      console.error(`[ToolRegistry] Error in tool '${name}':`, err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Tool execution failed',
        executionMs: Date.now() - start,
      }
    }
  }
}

export const toolRegistry = new ToolRegistry()

// ─── Tool Registrations ──────────────────────────────────

toolRegistry.register(
  'extract_visible_content',
  {
    name: 'extract_visible_content',
    description: 'Extract all visible text from the current page',
    schema: {},
    phase: 1,
    costWeight: 0.1,
  },
  async (ctx) => ({
    success: true,
    data: {
      content: ctx.pageContent,
      wordCount: ctx.pageContent.split(/\s+/).length,
      url: ctx.pageUrl,
    },
  })
)

toolRegistry.register(
  'extract_emails',
  {
    name: 'extract_emails',
    description: 'Extract all email addresses from page content',
    schema: {},
    phase: 1,
    costWeight: 0.05,
  },
  async (ctx) => {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
    const emails = [...new Set(ctx.pageContent.match(emailRegex) || [])]
    return { success: true, data: { emails, count: emails.length } }
  }
)

toolRegistry.register(
  'extract_prices',
  {
    name: 'extract_prices',
    description: 'Extract all prices and monetary values from the page',
    schema: {},
    phase: 1,
    costWeight: 0.05,
  },
  async (ctx) => {
    const priceRegex =
      /(?:[$€£¥₹])\s*\d+(?:[.,]\d{1,3})*(?:\.\d{2})?|\d+(?:[.,]\d{1,3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|JPY)/g
    const prices = [...new Set(ctx.pageContent.match(priceRegex) || [])]
    return { success: true, data: { prices, count: prices.length } }
  }
)

toolRegistry.register(
  'extract_links',
  {
    name: 'extract_links',
    description: 'Extract all hyperlinks from the page',
    schema: {},
    phase: 1,
    costWeight: 0.05,
  },
  async (ctx) => {
    // In browser context, this would use DOM; here we extract from content
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
    const links = [...new Set(ctx.pageContent.match(urlRegex) || [])]
    return { success: true, data: { links, count: links.length } }
  }
)

toolRegistry.register(
  'extract_tables',
  {
    name: 'extract_tables',
    description: 'Extract structured table data from the page',
    schema: {},
    phase: 1,
    costWeight: 0.1,
  },
  async (ctx) => {
    return {
      success: true,
      data: {
        tables: ctx.tables || [],
        count: ctx.tables?.length || 0,
      },
    }
  }
)

toolRegistry.register(
  'detect_forms',
  {
    name: 'detect_forms',
    description: 'Detect and analyze form fields on the current page',
    schema: {},
    phase: 1,
    costWeight: 0.1,
  },
  async (ctx) => {
    return {
      success: true,
      data: {
        forms: ctx.forms || [],
        hasForms: (ctx.forms?.length || 0) > 0,
      },
    }
  }
)

toolRegistry.register(
  'summarize_content',
  {
    name: 'summarize_content',
    description: 'Generate a concise summary of page content',
    schema: { length: { type: 'string', enum: ['short', 'medium', 'long'] } },
    phase: 2,
    costWeight: 0.5,
  },
  async (ctx, options = {}) => {
    // This triggers the AI layer in the orchestrator
    return {
      success: true,
      data: {
        requiresAI: true,
        prompt: `Summarize the following content in ${options.length || 'medium'} length:\n\n${ctx.pageContent.substring(0, 4000)}`,
      },
    }
  }
)

toolRegistry.register(
  'rewrite_text',
  {
    name: 'rewrite_text',
    description: 'Rewrite selected text with specified tone',
    schema: {
      tone: {
        type: 'string',
        enum: ['professional', 'casual', 'concise', 'detailed', 'formal'],
      },
    },
    phase: 2,
    costWeight: 0.4,
  },
  async (ctx, options = {}) => {
    if (!ctx.selectedText) {
      return { success: false, error: 'No text selected for rewriting' }
    }
    return {
      success: true,
      data: {
        requiresAI: true,
        prompt: `Rewrite the following text in a ${options.tone || 'professional'} tone:\n\n${ctx.selectedText}`,
      },
    }
  }
)

toolRegistry.register(
  'translate_content',
  {
    name: 'translate_content',
    description: 'Translate page content or selected text to target language',
    schema: { targetLanguage: { type: 'string' } },
    phase: 2,
    costWeight: 0.6,
  },
  async (ctx, options = {}) => {
    const content = ctx.selectedText || ctx.pageContent.substring(0, 4000)
    return {
      success: true,
      data: {
        requiresAI: true,
        prompt: `Translate the following text to ${options.targetLanguage || 'French'}:\n\n${content}`,
      },
    }
  }
)

toolRegistry.register(
  'generate_reply',
  {
    name: 'generate_reply',
    description: 'Generate a professional reply to a message or email',
    schema: {
      tone: { type: 'string', enum: ['professional', 'casual', 'concise'] },
      platform: { type: 'string' },
    },
    phase: 2,
    costWeight: 0.5,
  },
  async (ctx, options = {}) => {
    const message = ctx.selectedText || ctx.pageContent.substring(0, 2000)
    return {
      success: true,
      data: {
        requiresAI: true,
        prompt: `Write a ${options.tone || 'professional'} reply to the following message:\n\n${message}`,
      },
    }
  }
)

toolRegistry.register(
  'autofill_fields',
  {
    name: 'autofill_fields',
    description: 'Intelligently autofill detected form fields with provided data',
    schema: {
      data: { type: 'object' },
      strategy: { type: 'string', enum: ['smart', 'exact'] },
    },
    phase: 2,
    costWeight: 0.3,
  },
  async (ctx, options = {}) => {
    return {
      success: true,
      data: {
        requiresBrowser: true,
        action: 'autofill',
        fields: ctx.forms,
        inputData: options.data,
      },
    }
  }
)

toolRegistry.register(
  'export_csv',
  {
    name: 'export_csv',
    description: 'Export extracted data as a CSV file',
    schema: { data: { type: 'array' }, filename: { type: 'string' } },
    phase: 2,
    costWeight: 0.1,
  },
  async (_, options = {}) => {
    return {
      success: true,
      data: {
        requiresExport: true,
        format: 'csv',
        data: options.data,
        filename: options.filename || 'taskpilot-export.csv',
      },
    }
  }
)

toolRegistry.register(
  'export_excel',
  {
    name: 'export_excel',
    description: 'Export extracted data as an Excel spreadsheet',
    schema: { data: { type: 'array' }, filename: { type: 'string' } },
    phase: 2,
    costWeight: 0.1,
  },
  async (_, options = {}) => {
    return {
      success: true,
      data: {
        requiresExport: true,
        format: 'excel',
        data: options.data,
        filename: options.filename || 'taskpilot-export.xlsx',
      },
    }
  }
)

toolRegistry.register(
  'export_pdf',
  {
    name: 'export_pdf',
    description: 'Export the current page or extracted data as a PDF',
    schema: { includeImages: { type: 'boolean' }, filename: { type: 'string' } },
    phase: 2,
    costWeight: 0.2,
  },
  async (ctx, options = {}) => {
    return {
      success: true,
      data: {
        requiresExport: true,
        format: 'pdf',
        content: ctx.pageContent,
        url: ctx.pageUrl,
        includeImages: options.includeImages ?? false,
        filename: options.filename || 'taskpilot-export.pdf',
      },
    }
  }
)

toolRegistry.register(
  'push_to_hubspot',
  {
    name: 'push_to_hubspot',
    description: 'Push extracted contact/lead data to HubSpot CRM',
    schema: { data: { type: 'object' } },
    phase: 3,
    costWeight: 0.2,
  },
  async (_, options = {}) => {
    return {
      success: true,
      data: {
        requiresIntegration: true,
        integration: 'hubspot',
        data: options.data,
      },
    }
  }
)

toolRegistry.register(
  'push_to_salesforce',
  {
    name: 'push_to_salesforce',
    description: 'Push extracted data to Salesforce CRM',
    schema: { data: { type: 'object' } },
    phase: 3,
    costWeight: 0.2,
  },
  async (_, options = {}) => {
    return {
      success: true,
      data: {
        requiresIntegration: true,
        integration: 'salesforce',
        data: options.data,
      },
    }
  }
)

toolRegistry.register(
  'create_notion_page',
  {
    name: 'create_notion_page',
    description: 'Create a new Notion page with extracted content',
    schema: {
      title: { type: 'string' },
      content: { type: 'string' },
      databaseId: { type: 'string' },
    },
    phase: 3,
    costWeight: 0.2,
  },
  async (ctx, options = {}) => {
    return {
      success: true,
      data: {
        requiresIntegration: true,
        integration: 'notion',
        title: options.title || 'TaskPilot Export',
        content: options.content || ctx.pageContent.substring(0, 5000),
        databaseId: options.databaseId,
      },
    }
  }
)
