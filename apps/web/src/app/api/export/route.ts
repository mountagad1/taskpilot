import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/security'

export const runtime = 'nodejs'
export const maxDuration = 60

type ExportFormat = 'csv' | 'excel' | 'json'

export async function POST(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'

  const rateLimit = await checkRateLimit(req, ip)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()

  // Free users: allow up to 5 exports/month
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .single()

    if (profile?.plan === 'free') {
      const { count } = await supabase
        .from('ai_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('task_type', 'export')
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

      if ((count || 0) >= 5) {
        return NextResponse.json(
          { error: 'Free plan export limit reached. Upgrade to Pro for unlimited exports.' },
          { status: 402 }
        )
      }
    }
  }

  let body: { format: ExportFormat; data: unknown[]; filename?: string; headers?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { format, data, filename = 'taskpilot-export', headers: columnHeaders } = body

  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'data must be a non-empty array' }, { status: 400 })
  }

  try {
    if (format === 'csv') {
      const csv = generateCSV(data, columnHeaders)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    }

    if (format === 'json') {
      return new NextResponse(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}.json"`,
        },
      })
    }

    if (format === 'excel') {
      const excelBuffer = await generateExcel(data, columnHeaders, filename)
      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        },
      })
    }

    return NextResponse.json({ error: `Unsupported format: ${format}` }, { status: 400 })
  } catch (err) {
    console.error('[Export] Error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

function generateCSV(data: unknown[], customHeaders?: string[]): string {
  if (!data.length) return ''

  const rows = data as Record<string, unknown>[]
  const headers = customHeaders || Object.keys(rows[0])

  const escape = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val)
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ]

  return '\uFEFF' + lines.join('\r\n') // BOM for Excel UTF-8
}

async function generateExcel(
  data: unknown[],
  customHeaders?: string[],
  sheetName = 'TaskPilot Export'
): Promise<Buffer> {
  // Dynamic import to keep bundle lean
  const XLSX = await import('xlsx')

  const rows = data as Record<string, unknown>[]
  const headers = customHeaders || Object.keys(rows[0])
  const wsData = [
    headers,
    ...rows.map((row) => headers.map((h) => row[h] ?? '')),
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Auto-width
  const colWidths = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((row) => String(row[h] ?? '').length)
    )
    return { wch: Math.min(maxLen + 2, 50) }
  })
  ws['!cols'] = colWidths

  // Style header row
  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i })
    if (!ws[cellRef].s) ws[cellRef].s = {}
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: '6366F1' } } }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31))

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
