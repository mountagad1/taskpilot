import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const runtime = 'edge'

// GET /api/auth/session — return current session + profile
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    return NextResponse.json({ authenticated: false, user: null })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, plan, created_at')
    .eq('id', session.user.id)
    .single()

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      ...profile,
    },
    expiresAt: session.expires_at,
  })
}

// POST /api/auth/session — exchange extension token
export async function POST(req: NextRequest) {
  let body: { accessToken?: string; refreshToken?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.accessToken || !body.refreshToken) {
    return NextResponse.json({ error: 'accessToken and refreshToken required' }, { status: 400 })
  }

  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase.auth.setSession({
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({ success: true, userId: data.user?.id })
}

// DELETE /api/auth/session — sign out
export async function DELETE() {
  const supabase = createRouteHandlerClient({ cookies })
  await supabase.auth.signOut()
  return NextResponse.json({ success: true })
}
