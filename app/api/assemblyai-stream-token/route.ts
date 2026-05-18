// app/api/assemblyai-stream-token/route.ts
//
// Mints a short-lived AssemblyAI streaming token so the browser can open a
// WebSocket directly to `wss://streaming.assemblyai.com/v3/ws` without ever
// seeing the long-lived ASSEMBLYAI_API_KEY. Each token is single-use and
// must be redeemed within `expires_in_seconds` of issuance.
//
// Only used by the debug transcription comparison surface
// (`/debug/transcribe-compare`) so far — kept narrow on purpose. If we ever
// productionise side-by-side STT, harden + reuse this route.
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    log.error('ASSEMBLYAI_API_KEY is not set')
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 500 })
  }

  try {
    const res = await fetch(
      'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60',
      { headers: { Authorization: apiKey } },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.error('AssemblyAI token mint failed', { status: res.status, body })
      return NextResponse.json({ error: 'Token fetch failed' }, { status: 502 })
    }
    const data = (await res.json()) as { token?: string }
    if (!data.token) {
      log.error('AssemblyAI token response missing token field', { data })
      return NextResponse.json({ error: 'Token fetch failed' }, { status: 502 })
    }
    return NextResponse.json({ token: data.token })
  } catch (err) {
    log.error('AssemblyAI token mint threw', { error: (err as Error).message })
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 502 })
  }
}
