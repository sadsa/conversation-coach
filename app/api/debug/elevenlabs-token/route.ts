import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    log.error('ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID is not set')
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 500 })
  }

  let res: Response
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': apiKey } },
    )
  } catch (err) {
    log.error('ElevenLabs fetch failed', { error: String(err) })
    return NextResponse.json({ error: 'Failed to reach ElevenLabs' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to get signed URL' }, { status: 502 })
  }

  const body = await res.json() as { signed_url?: string }
  if (!body.signed_url) {
    log.error('ElevenLabs response missing signed_url', { body })
    return NextResponse.json({ error: 'Unexpected ElevenLabs response' }, { status: 502 })
  }

  return NextResponse.json({ signedUrl: body.signed_url })
}
