// __tests__/api/practice-persona.test.ts
//
// Persona route is intentionally narrow — auth gate, target-language wiring
// to the generator, and surface error mapping. The persona content itself
// is Claude's responsibility; lib/persona.test.ts covers the
// schema-validation + voice-catalog fallbacks.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/persona', () => ({ generatePersona: vi.fn() }))

import { getAuthenticatedUser } from '@/lib/auth'
import { generatePersona } from '@/lib/persona'

const mockUser = { id: 'user-123', email: 'test@example.com', targetLanguage: 'es-AR' }

const samplePersona = {
  name: 'Mateo',
  voiceName: 'Fenrir',
  opener: 'Hola hola, soy Mateo, te llamo desde el aeropuerto…',
  systemPromptAddendum: 'Sos Mateo, treintañero, programador. Llamás porque perdiste el vuelo.',
}

describe('GET /api/practice/persona', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(getAuthenticatedUser).mockResolvedValue(mockUser as any)
    vi.mocked(generatePersona).mockResolvedValue(samplePersona)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    const { GET } = await import('@/app/api/practice/persona/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns persona JSON on success', async () => {
    const { GET } = await import('@/app/api/practice/persona/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.persona).toEqual(samplePersona)
  })

  it('passes the user target language to the persona generator', async () => {
    const { GET } = await import('@/app/api/practice/persona/route')
    await GET()
    expect(generatePersona).toHaveBeenCalledWith('es-AR')
  })

  it('defaults to es-AR when user has no targetLanguage', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: 'user-999',
      email: null,
      targetLanguage: null,
    } as any)
    const { GET } = await import('@/app/api/practice/persona/route')
    await GET()
    expect(generatePersona).toHaveBeenCalledWith('es-AR')
  })

  it('honours en-NZ when the user is on the English target', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: 'user-456',
      email: 'kiwi@example.com',
      targetLanguage: 'en-NZ',
    } as any)
    const { GET } = await import('@/app/api/practice/persona/route')
    await GET()
    expect(generatePersona).toHaveBeenCalledWith('en-NZ')
  })

  it('returns 500 when the generator throws', async () => {
    vi.mocked(generatePersona).mockRejectedValueOnce(new Error('Claude exploded'))
    const { GET } = await import('@/app/api/practice/persona/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
