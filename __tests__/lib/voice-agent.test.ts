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

  it('explicitly directs the en-NZ accent and forbids drift to US English', () => {
    // Guards the accent enforcement. Gemini Live's API doesn't accept
    // `en-NZ` as a language_code (the supported list is en-US / en-IN), so
    // accent is steered entirely from the system prompt. Without an
    // explicit instruction the model defaults toward US English even
    // though we identify the speaker as a NZ-er. The prompt MUST: name
    // the accent (NZ / Kiwi), forbid the common drift (American / "neutral"),
    // and reinforce the instruction is durable across all turns rather than
    // just the first one. If any of those three guardrails goes missing
    // we'll start hearing American-accented "Kiwi" personas again.
    const prompt = buildPracticeSystemPrompt('en-NZ')
    expect(prompt).toMatch(/New Zealand.*accent|Kiwi.*accent/i)
    expect(prompt).toMatch(/never.*American|not.*American/i)
    expect(prompt).toMatch(/never.*neutral|not.*neutral/i)
    expect(prompt).toMatch(/every.*turn|throughout|entire conversation|do not drift/i)
  })

  it('explicitly directs the Rioplatense accent and the sheísmo pronunciation cue', () => {
    // Same accent-guardrail story for Spanish — Gemini Live doesn't accept
    // `es-AR` as a language_code (closest is `es-US`), so we rely on the
    // system prompt to keep the model from drifting to Castilian or
    // Mexican Spanish. The sheísmo cue (ll/y → sh sound) is the single
    // most defining feature of Rioplatense pronunciation; calling it out
    // explicitly gives the model something concrete to lock onto rather
    // than the abstract "speak Argentine".
    const prompt = buildPracticeSystemPrompt('es-AR')
    expect(prompt).toMatch(/rioplatense|porteño/i)
    expect(prompt).toMatch(/acento/i)
    expect(prompt).toMatch(/sheísmo|zheísmo|sonido sh/i)
    expect(prompt).toMatch(/nunca.*castellano|no.*neutro/i)
  })
})
