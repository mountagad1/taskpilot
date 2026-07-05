import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

// Delivers the agent manifest as a downloadable JSON file — the actual
// product a buyer receives. Access is gated server-side: the requester
// must be the seller or hold a completed purchase. (RLS enforces this
// too; we re-check here to return a clean 403 and a nice filename.)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to download this agent' }, { status: 401 })
  }
  const userId = session.user.id
  const agentId = params.id

  const { data: agent } = await supabase
    .from('marketplace_agents')
    .select('id, slug, name, seller_id')
    .eq('id', agentId)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const isSeller = agent.seller_id === userId
  let owns = isSeller
  if (!owns) {
    const { data: purchase } = await supabase
      .from('agent_purchases')
      .select('id')
      .eq('agent_id', agentId)
      .eq('buyer_id', userId)
      .eq('status', 'completed')
      .maybeSingle()
    owns = !!purchase
  }

  if (!owns) {
    return NextResponse.json({ error: 'Purchase this agent to download it' }, { status: 403 })
  }

  const { data: row } = await supabase
    .from('agent_manifests')
    .select('manifest')
    .eq('agent_id', agentId)
    .single()

  if (!row) {
    return NextResponse.json({ error: 'Manifest unavailable' }, { status: 404 })
  }

  return new NextResponse(JSON.stringify(row.manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${agent.slug}.agent.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
