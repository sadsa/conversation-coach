// app/api/voice-token/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    log.error('GOOGLE_API_KEY is not set')
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 500 })
  }

  return NextResponse.json({ token: apiKey })
}
