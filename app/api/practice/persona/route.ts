// app/api/practice/persona/route.ts
//
// GET /api/practice/persona — Generates a fresh Claude persona for the
// Practice page's "Pick up a call" mode. Auth-gated; targetLanguage comes
// from the authenticated user's metadata.
//
// Called twice per call session:
//   1. When the user taps "Pick up a call" on the idle screen
//   2. When the user taps "Try another line" mid-call (max 3 rerolls)
//
// Cheap (~$0.001/call, ~1.5s). No DB writes — personas are ephemeral.

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generatePersona } from '@/lib/persona'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const targetLanguage: TargetLanguage =
    (user.targetLanguage as TargetLanguage) ?? 'es-AR'

  try {
    const persona = await generatePersona(targetLanguage)
    return NextResponse.json({ persona })
  } catch (err) {
    log.error('Persona generation failed', {
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Persona generation failed' }, { status: 500 })
  }
}
