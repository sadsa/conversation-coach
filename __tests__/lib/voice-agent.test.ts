// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildPracticeSystemPrompt, buildResumeSystemPrompt } from '@/lib/voice-agent'
import type { TranscriptTurn } from '@/lib/types'

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

describe('buildResumeSystemPrompt', () => {
  const base = 'BASE_PROMPT'
  const turns: TranscriptTurn[] = [
    { role: 'user',  text: 'Hola, ¿cómo estás?', wallMs: 1000 },
    { role: 'model', text: 'Bien, gracias. ¿Y vos?', wallMs: 2000 },
    { role: 'user',  text: 'Bien también.',         wallMs: 3000 },
  ]

  it('returns base prompt unchanged when turns array is empty', () => {
    const result = buildResumeSystemPrompt(base, [], 'Nora')
    expect(result).toBe(base)
  })

  it('appends history block after base prompt (not before)', () => {
    const result = buildResumeSystemPrompt(base, turns, 'Nora')
    expect(result.startsWith('BASE_PROMPT')).toBe(true)
  })

  it('labels user turns as [User]', () => {
    const result = buildResumeSystemPrompt(base, turns, 'Nora')
    expect(result).toContain('[User] Hola, ¿cómo estás?')
    expect(result).toContain('[User] Bien también.')
  })

  it('labels model turns with the provided agentLabel', () => {
    const result = buildResumeSystemPrompt(base, turns, 'Nora')
    expect(result).toContain('[Nora] Bien, gracias. ¿Y vos?')
  })

  it('uses a different agentLabel when provided', () => {
    const result = buildResumeSystemPrompt(base, turns, 'Coach')
    expect(result).toContain('[Coach] Bien, gracias. ¿Y vos?')
    expect(result).not.toContain('[Nora]')
  })

  it('excludes turns with empty text', () => {
    const turnsWithEmpty: TranscriptTurn[] = [
      { role: 'user',  text: 'Hola',  wallMs: 1000 },
      { role: 'model', text: '',      wallMs: 2000 },
      { role: 'model', text: '   ',   wallMs: 2500 },
      { role: 'user',  text: 'Adiós', wallMs: 3000 },
    ]
    const result = buildResumeSystemPrompt(base, turnsWithEmpty, 'Nora')
    expect(result).toContain('[User] Hola')
    expect(result).toContain('[User] Adiós')
    const lines = result.split('\n')
    expect(lines.some(l => l.startsWith('[Nora]') && l.replace('[Nora]', '').trim() === '')).toBe(false)
    // Whitespace-only text must also be excluded
    expect(result).not.toContain('[Nora]   ')
  })

  it('excludes pending turns', () => {
    const turnsWithPending: TranscriptTurn[] = [
      { role: 'user',  text: 'Hola',           wallMs: 1000 },
      { role: 'user',  text: 'en camino...',    wallMs: 2000, pending: true },
      { role: 'model', text: '¡Buenas!',        wallMs: 3000 },
    ]
    const result = buildResumeSystemPrompt(base, turnsWithPending, 'Nora')
    expect(result).toContain('[User] Hola')
    expect(result).toContain('[Nora] ¡Buenas!')
    expect(result).not.toContain('en camino...')
  })

  it('includes the resume instruction header', () => {
    const result = buildResumeSystemPrompt(base, turns, 'Nora')
    expect(result).toContain('CONVERSATION SO FAR')
    expect(result).toMatch(/resume naturally|wait for the user/i)
    expect(result).toContain('do not repeat your introduction')
  })
})
