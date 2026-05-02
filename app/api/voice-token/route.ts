import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL('https://agents.assemblyai.com/v1/token')
  url.searchParams.set('expires_in_seconds', '300')
  url.searchParams.set('max_session_duration_seconds', '8640')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
  })

  if (!response.ok) {
    log.error('Voice token fetch failed', { status: response.status })
    return new Response('Token fetch failed', { status: 500 })
  }

  const { token } = await response.json() as { token: string }
  return Response.json({ token })
}
