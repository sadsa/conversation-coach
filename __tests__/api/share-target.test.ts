import { describe, it, expect } from 'vitest'
import { POST } from '@/app/share-target/route'

describe('POST /share-target', () => {
  it('redirects to /', async () => {
    const req = new Request('http://localhost/share-target', { method: 'POST' })
    let redirected = false
    let redirectUrl = ''
    // next/navigation redirect() throws a NEXT_REDIRECT error in test env — catch it
    try {
      await POST(req)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'digest' in e) {
        const digest = (e as { digest: string }).digest
        redirected = digest.includes('NEXT_REDIRECT')
        redirectUrl = digest
      }
    }
    expect(redirected).toBe(true)
    expect(redirectUrl).toContain('/')
  })
})
