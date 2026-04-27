import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/logger'

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.MAINTENANCE_TOKEN
  if (!token) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${token}`
}

function parseRetentionDays(): number {
  const raw = process.env.AUDIO_RETENTION_DAYS ?? '14'
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 14
  return Math.floor(parsed)
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const retentionDays = parseRetentionDays()
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const db = createServerClient()

  const { data: sessions, error } = await db
    .from('sessions')
    .select('id, audio_r2_key')
    .not('audio_r2_key', 'is', null)
    .lte('processing_completed_at', cutoffIso)

  if (error) {
    log.error('Audio retention query failed', { error: error.message, cutoffIso, retentionDays })
    return NextResponse.json({ error: 'Failed to query sessions' }, { status: 500 })
  }

  const rows = sessions ?? []
  let deleted = 0
  for (const row of rows) {
    if (!row.audio_r2_key) continue
    await deleteObject(row.audio_r2_key)
    await db
      .from('sessions')
      .update({ audio_r2_key: null })
      .eq('id', row.id)
    deleted += 1
  }

  log.info('Audio retention cleanup complete', {
    scanned: rows.length,
    deleted,
    retentionDays,
  })

  return NextResponse.json({ ok: true, scanned: rows.length, deleted, retentionDays })
}
