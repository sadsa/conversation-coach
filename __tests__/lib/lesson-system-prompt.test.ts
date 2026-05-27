import { describe, it, expect } from 'vitest'
import { buildLessonSystemPrompt } from '@/lib/voice-agent'

const phrase = {
  correction: 'Fui al mercado ayer',
  explanation: '"Me fui" adds a reflexive pronoun that shifts the nuance.',
  flashcard_front: 'Me [[fui]] al mercado ayer',
}

describe('buildLessonSystemPrompt', () => {
  it('includes the correction verbatim', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('Fui al mercado ayer')
  })

  it('includes the explanation verbatim', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('"Me fui" adds a reflexive pronoun')
  })

  it('references all four phase names', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('explain')
    expect(prompt).toContain('model')
    expect(prompt).toContain('drill')
    expect(prompt).toContain('free_use')
  })

  it('references set_phase tool', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('set_phase')
  })

  it('includes NZ English accent instruction for en-NZ', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'en-NZ')
    expect(prompt).toMatch(/new zealand/i)
  })

  it('includes Rioplatense instruction for es-AR', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toMatch(/rioplatense/i)
  })
})
