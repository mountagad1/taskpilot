import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { checkRateLimit, } from '@/lib/security'
import { semanticCache } from '@taskpilot/ai-engine/cache'
import { PLAN_LIMITS } from '@taskpilot/shared'

export const runtime = 'edge'
export const maxDuration = 60

const TASK_PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  summarize: (ctx) =>
    `Summarize the following webpage content concisely (3-5 sentences):\n\nURL: ${ctx.url}\n\n${ctx.content}`,
  translate: (ctx) =>
    `Translate the following content to ${ctx.targetLanguage || 'French'}:\n\n${ctx.content}`,
  extract_data: (ctx) =>
    `Extract all structured data (people, companies, emails, prices, links) from:\n\n${ctx.content}\n\nReturn as JSON.`,
  generate_reply: (ctx) =>
    `Write a professional ${ctx.tone || 'concise'} reply to:\n\n${ctx.selectedText || ctx.content}`,
  rewrite: (ctx) =>
    `Rewrite the following text in a ${ctx.tone || 'professional'} tone:\n\n${ctx.selectedText || ctx.content}`,
  meeting_notes: (ctx) =>
    `Generate structured meeting notes from:\n\n${ctx.content}\n\nInclude: Summary, Key Points, Action Items, Next Steps.`,
  custom: (ctx) => `${ctx.userInput}\n\nWebpage content:\n${ctx.content}`,
}

export async function POST(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'

  const rateLimit = await checkRateLimit(req, ip)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { task, pageContext, selectedText, userInput, options } = body as {
    task: string
    pageContext: { url: string; content: string; title?: string }
    selectedText?: string
    userInput?: string
    options?: Record<string, string>
  }

  if (!task || !TASK_PROMPTS[task]) {
    return NextResponse.json(
      { error: `Unknown task: ${task}. Valid tasks: ${Object.keys(TASK_PROMPTS).join(', ')}` },
      { status: 400 }
    )
  }

  // ─── Auth + Plan check ──────────────────────────────────
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id

  if (userId) {
    const { data: usage } = await supabase
      .from('usage_periods')
      .select('ai_requests')
      .eq('user_id', userId)
      .eq('period_start', new Date().toISOString().slice(0, 7) + '-01')
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single()

    const plan = profile?.plan || 'free'
    const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.ai_actions_limit

    if (limit && usage?.ai_requests >= limit) {
      return NextResponse.json(
        { error: 'Monthly AI request limit reached. Upgrade to Pro for unlimited access.' },
        { status: 402 }
      )
    }
  }

  // ─── Cache check ────────────────────────────────────────
  const content = pageContext?.content || ''
  const cacheKey = semanticCache.generateKey({
    task,
    pageContent: content,
    userInput: userInput || '',
    url: pageContext?.url || '',
  })

  const cached = await semanticCache.get(cacheKey)
  if (cached) {
    return NextResponse.json({ result: cached, cached: true })
  }

  // ─── Build prompt ────────────────────────────────────────
  const promptCtx = {
    content: content.substring(0, 8000),
    url: pageContext?.url || '',
    selectedText: selectedText || '',
    userInput: userInput || '',
    ...(options || {}),
  }

  const prompt = TASK_PROMPTS[task](promptCtx)

  // ─── Determine model ────────────────────────────────────
  const complexTasks = new Set(['generate_reply', 'meeting_notes', 'custom'])
  const model = complexTasks.has(task) ? 'gpt-4.1' : 'gpt-4.1-mini'

  // ─── OpenAI call ────────────────────────────────────────
  try {
    const isJson = task === 'extract_data'
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        ...(isJson && { response_format: { type: 'json_object' } }),
        messages: [
          {
            role: 'system',
            content: 'You are TaskPilot, an AI assistant embedded in the browser. Be concise, accurate, and helpful. Always respond in the same language as the user\'s content.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenAI API error')
    }

    const result = data.choices[0].message.content
    const tokensUsed = data.usage?.total_tokens || 0

    // Cache
    await semanticCache.set(cacheKey, result, { task, model, tokensUsed })

    // Log
    if (userId) {
      await supabase.from('ai_requests').insert({
        user_id: userId,
        task_type: task,
        tokens_used: tokensUsed,
        model,
        cached: false,
        cost_usd: tokensUsed * (model === 'gpt-4.1' ? 0.0000025 : 0.00000015),
        page_url: pageContext?.url,
      })
    }

    return NextResponse.json({
      result,
      cached: false,
      tokensUsed,
      model,
      task,
    })
  } catch (err) {
    console.error('[AI Process] Error:', err)
    return NextResponse.json(
      { error: 'AI request failed. Please try again.' },
      { status: 500 }
    )
  }
}
