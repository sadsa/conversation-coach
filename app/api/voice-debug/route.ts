// app/api/voice-debug/route.ts
//
// Temporary diagnostics sink for the voice session. `lib/voice-agent.ts`
// runs in the browser, so its `log.*` calls land in the device console (not
// Vercel). This route lets the client POST a timestamped event timeline that
// then logs server-side — making it visible in Vercel for the "first word
// clipped on Android" investigation. Remove once that bug is closed out.
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    /* malformed body — log what we can */
  }

  log.info('voice debug timeline', { userId: user.id, ...body })
  return NextResponse.json({ ok: true })
}
