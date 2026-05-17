// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildPracticeSystemPrompt } from '@/lib/voice-agent'

describe('buildPracticeSystemPrompt', () => {
  it('instructs Gemini to use Rioplatense register for es-AR', () => {
    const prompt = buildPracticeSystemPrompt('es-AR')
    expect(prompt).toContain('rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('NO corrijas')
    expect(prompt).toContain('Río de la Plata')
  })

  it('instructs Gemini to use NZ English for en-NZ', () => {
    const prompt = buildPracticeSystemPrompt('en-NZ')
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Do NOT correct')
    expect(prompt).not.toContain('Rioplatense')
  })

  it('does not mention coaching mid-conversation', () => {
    const esPrompt = buildPracticeSystemPrompt('es-AR')
    const enPrompt = buildPracticeSystemPrompt('en-NZ')
    expect(esPrompt).toContain('NO corrijas los errores del aprendiz durante la conversación')
    expect(enPrompt).toContain('Do NOT correct the learner')
  })

  it('tells Gemini to speak at a slower learner-friendly pace', () => {
    // Guards the speech-speed lever for both languages. We don't pin exact
    // wording — just that the prompt explicitly slows the model down without
    // tipping into "teacher voice" (which would feel patronising and break
    // the casual-conversation framing).
    const esPrompt = buildPracticeSystemPrompt('es-AR')
    const enPrompt = buildPracticeSystemPrompt('en-NZ')

    expect(esPrompt).toMatch(/pausado|tranquilo|sin apuro/i)
    expect(esPrompt).toMatch(/aprendiendo el idioma/)
    expect(esPrompt).toMatch(/NO uses voz de "maestro/)

    expect(enPrompt).toMatch(/deliberate|calm|unhurried/i)
    expect(enPrompt).toMatch(/learning English/)
    expect(enPrompt).toMatch(/NOT.*teacher voice/i)
  })
})
