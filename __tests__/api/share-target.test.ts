import { describe, it, expect } from 'vitest'
import { POST } from '@/app/share-target/route'

describe('POST /share-target', () => {
  it('redirects to /', async () => {
    const req = new Request('http://localhost/share-target', { method: 'POST' })
    let redirected = false
    let destination = ''
    try {
      await POST(req)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'digest' in e) {
        const digest = (e as { digest: string }).digest
        if (digest.includes('NEXT_REDIRECT')) {
          redirected = true
          destination = digest.split(';')[2] ?? ''
        }
      }
    }
    expect(redirected).toBe(true)
    expect(destination).toBe('/')
  })
})
