// app/api/sessions/[id]/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyOwnedSession } from '@/lib/ownership'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'
import { transitionToReanalysing } from '@/lib/session-pipeline'

export const maxDuration = 300

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  if (!(await verifyOwnedSession(db, params.id, user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.from('annotations').delete().eq('session_id', params.id)

  const result = await transitionToReanalysing(params.id)
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'no_transcript' ? 400 : 409
    return NextResponse.json({ error: result.detail }, { status })
  }

  const targetLanguage = (user.targetLanguage as TargetLanguage | null) ?? 'es-AR'
  log.info('Re-analysis triggered', { sessionId: params.id, targetLanguage })

  waitUntil(runClaudeAnalysis(params.id, targetLanguage).catch(err =>
    log.error('Re-analysis failed (fire-and-forget)', { sessionId: params.id, err })
  ))

  return NextResponse.json({ status: 'analysing' })
}
