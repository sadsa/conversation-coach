import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildFocusUpdateMessage } from '@/lib/voice-agent'
import type { FocusedCorrection } from '@/lib/voice-agent'

const items: FocusedCorrection[] = [
  { original: 'fui', correction: 'anduve', explanation: '"Andar" for movement through a space.' },
  { original: 'tengo calor', correction: 'hace calor', explanation: 'Impersonal weather expression.' },
]

describe('buildSystemPrompt', () => {
  it('includes Rioplatense instructions for es-AR', () => {
    const prompt = buildSystemPrompt('es-AR', items, items[0])
    expect(prompt).toContain('Rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('Argentine Spanish')
  })

  it('includes Kiwi instructions for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items, items[0])
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Kiwi')
  })

  it('lists up to 10 items', () => {
    const manyItems: FocusedCorrection[] = Array.from({ length: 15 }, (_, i) => ({
      original: `word${i}`,
      correction: `fix${i}`,
      explanation: `Reason ${i}.`,
    }))
    const prompt = buildSystemPrompt('es-AR', manyItems, manyItems[0])
    expect(prompt).toContain('word9')
    expect(prompt).not.toContain('word10')
  })

  it('highlights the focused correction', () => {
    const prompt = buildSystemPrompt('es-AR', items, items[1])
    expect(prompt).toContain('Currently discussing')
    expect(prompt).toContain('tengo calor')
    expect(prompt).toContain('hace calor')
  })
})

describe('buildFocusUpdateMessage', () => {
  it('contains the original and correction', () => {
    const msg = buildFocusUpdateMessage({
      original: 'fui',
      correction: 'anduve',
      explanation: '"Andar" for movement through a space.',
    })
    expect(msg).toContain('fui')
    expect(msg).toContain('anduve')
  })

  it('falls back to original when correction is null', () => {
    const msg = buildFocusUpdateMessage({
      original: 'fui',
      correction: null,
      explanation: 'test',
    })
    expect(msg).toContain('fui')
    expect(msg).not.toContain('null')
  })
})
