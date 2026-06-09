// app/api/sessions/[id]/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'
import { transitionToReanalysing } from '@/lib/session-pipeline'

export const maxDuration = 300

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data: owned } = await db
    .from('sessions')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.from('annotations').delete().eq('session_id', params.id)

  const result = await transitionToReanalysing(params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.detail }, { status: result.reason === 'not_found' ? 404 : 409 })
  }

  const targetLanguage = (user.targetLanguage as TargetLanguage | null) ?? 'es-AR'
  log.info('Re-analysis triggered', { sessionId: params.id, targetLanguage })

  waitUntil(runClaudeAnalysis(params.id, targetLanguage).catch(err =>
    log.error('Re-analysis failed (fire-and-forget)', { sessionId: params.id, err })
  ))

  return NextResponse.json({ status: 'analysing' })
}
