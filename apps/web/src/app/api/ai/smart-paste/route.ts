import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { checkRateLimit, } from '@/lib/security'
import { semanticCache } from '@taskpilot/ai-engine/cache'

export const runtime = 'edge'
export const maxDuration = 30

interface SmartPasteRequest {
  clipboardText: string
  pageContext: {
    url: string
    title?: string
    forms: unknown[]
    pageType?: string
  }
  sessionToken?: string
}

export async function POST(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'

  // ─── Rate Limit ────────────────────────────────────────
  const rateLimit = await checkRateLimit(req, ip)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before trying again.' },
      { status: 429 }
    )
  }

  let body: SmartPasteRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clipboardText, pageContext, sessionToken } = body

  if (!clipboardText || clipboardText.length > 5000) {
    return NextResponse.json(
      { error: 'clipboardText is required and must be under 5000 characters' },
      { status: 400 }
    )
  }

  // ─── Auth (optional) ────────────────────────────────────
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id

  // ─── Cache check ────────────────────────────────────────
  const cacheKey = semanticCache.generateKey({
    task: 'smart_paste',
    pageContent: clipboardText,
    url: pageContext?.url || '',
  })

  const cached = await semanticCache.get(cacheKey)
  if (cached) {
    return NextResponse.json({
      ...cached,
      cached: true,
      source: 'semantic_cache',
    })
  }

  // ─── Parse with layered approach ────────────────────────
  // Layer 1: Regex parsing (no AI cost)
  const regexResult = parseWithRegex(clipboardText)

  // Layer 2: Heuristics
  const heuristicResult = parseWithHeuristics(clipboardText, regexResult)

  // Layer 3: AI only if confidence < 0.7
  let finalResult = heuristicResult
  if (heuristicResult.confidence < 0.7 && clipboardText.length > 50) {
    finalResult = await parseWithAI(clipboardText, heuristicResult, userId)
  }

  // Cache result
  await semanticCache.set(cacheKey, finalResult, {
    task: 'smart_paste',
    model: finalResult.usedAI ? 'gpt-4.1-mini' : 'heuristic',
    tokensUsed: finalResult.tokensUsed || 0,
  })

  // Log usage to Supabase
  if (userId || sessionToken) {
    await supabase.from('ai_requests').insert({
      user_id: userId || null,
      session_id: sessionToken || null,
      task_type: 'smart_paste',
      tokens_used: finalResult.tokensUsed || 0,
      model: finalResult.usedAI ? 'gpt-4.1-mini' : 'heuristic',
      cached: false,
      cost_usd: (finalResult.tokensUsed || 0) * 0.00000015,
    })
  }

  return NextResponse.json(finalResult)
}

function parseWithRegex(text: string) {
  const result: Record<string, string> = {}

  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) result.email = emailMatch[0]

  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/)
  if (phoneMatch) result.phone = phoneMatch[0]

  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  if (urlMatch) result.website = urlMatch[0]

  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/)
  if (linkedinMatch) result.linkedin = `https://${linkedinMatch[0]}`

  return { fields: result, confidence: Object.keys(result).length > 0 ? 0.6 : 0.2 }
}

function parseWithHeuristics(
  text: string,
  base: ReturnType<typeof parseWithRegex>
) {
  const fields = { ...base.fields }
  const lines = text.split('\n').filter(Boolean)

  for (const line of lines) {
    const trimmed = line.trim()

    // Name detection: title-case 2+ words, not matching other patterns
    if (!fields.firstName && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(trimmed) && !trimmed.includes('@') && !trimmed.includes('http')) {
      const parts = trimmed.split(' ')
      fields.firstName = parts[0]
      fields.lastName = parts.slice(1).join(' ')
    }

    // "Title at Company" pattern
    const atPattern = trimmed.match(/^(.+?)\s+at\s+(.+)$/i)
    if (atPattern && !fields.jobTitle) {
      fields.jobTitle = atPattern[1].trim()
      fields.company = atPattern[2].trim()
    }

    // Job title signals
    const titleSignals = ['CEO', 'CTO', 'CFO', 'VP', 'Director', 'Manager', 'Engineer', 'Designer', 'Founder', 'President', 'Head of']
    if (!fields.jobTitle && titleSignals.some(s => trimmed.includes(s))) {
      fields.jobTitle = trimmed
    }
  }

  const fieldCount = Object.keys(fields).length
  const confidence = Math.min(0.95, base.confidence + fieldCount * 0.1)

  return {
    fields,
    confidence,
    usedAI: false,
    tokensUsed: 0,
    layers: ['regex', 'heuristics'],
  }
}

async function parseWithAI(
  text: string,
  base: ReturnType<typeof parseWithHeuristics>,
  userId?: string
) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract contact fields from text. Return ONLY valid JSON with these keys if found: firstName, lastName, email, phone, jobTitle, company, website, address, city, country, linkedin, twitter. No extra keys.`,
          },
          { role: 'user', content: text },
        ],
      }),
    })

    const data = await response.json()
    const aiFields = JSON.parse(data.choices[0].message.content)
    const tokensUsed = data.usage?.total_tokens || 0

    return {
      fields: { ...base.fields, ...aiFields },
      confidence: 0.92,
      usedAI: true,
      tokensUsed,
      layers: [...base.layers, 'ai'],
    }
  } catch (err) {
    console.error('[SmartPaste] AI parsing failed:', err)
    return { ...base, layers: [...base.layers, 'ai_failed'] }
  }
}
