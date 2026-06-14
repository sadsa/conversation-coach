// __tests__/api/practice-starters.test.ts
//
// Regression guard for the silent-fallback bug: Haiku wraps its JSON array in
// a ```json fence, the route used to JSON.parse it raw, throw, and 500 — so
// the client fell back to the same 3 static starter strings on every load.
// The route must strip the fence and return the model's (varying) topics.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { getAuthenticatedUser } from '@/lib/auth'

const mockUser = { id: 'user-123', email: 'test@example.com', targetLanguage: 'es-AR' }

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

const STARTERS = [
  { topic: 'Your favourite local restaurant', category: 'food' },
  { topic: 'A trip you want to take', category: 'travel' },
  { topic: 'What you watch to relax', category: 'media' },
]

async function callGet(lang = 'en') {
  const { GET } = await import('@/app/api/practice-starters/route')
  return GET(new Request(`http://localhost/api/practice-starters?lang=${lang}`))
}

describe('GET /api/practice-starters', () => {
  beforeEach(() => {
    vi.resetModules()
    createMock.mockReset()
    vi.mocked(getAuthenticatedUser).mockResolvedValue(mockUser as any)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    const res = await callGet()
    expect(res.status).toBe(401)
  })

  it('parses a ```json-fenced model response (the regression)', async () => {
    createMock.mockResolvedValue(
      textResponse('```json\n' + JSON.stringify(STARTERS) + '\n```'),
    )
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.starters).toEqual(STARTERS)
  })

  it('parses a bare (unfenced) JSON array', async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(STARTERS)))
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.starters).toEqual(STARTERS)
  })

  it('coerces unknown categories to misc', async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify([
        { topic: 'One', category: 'wormholes' },
        { topic: 'Two', category: 'food' },
        { topic: 'Three', category: 'travel' },
      ])),
    )
    const res = await callGet()
    const body = await res.json()
    expect(body.starters[0].category).toBe('misc')
  })

  it('500s on genuinely unparseable output (so the client falls back)', async () => {
    createMock.mockResolvedValue(textResponse('sorry, I cannot help with that'))
    const res = await callGet()
    expect(res.status).toBe(500)
  })
})
