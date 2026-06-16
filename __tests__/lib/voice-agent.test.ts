// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildPracticeSystemPrompt, buildResumeSystemPrompt, buildStudySystemPrompt, formatStudyCard, formatStudyCardAdvance } from '@/lib/voice-agent'
import type { TranscriptTurn } from '@/lib/types'
import type { LessonPhrase } from '@/lib/voice-agent'

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

describe('buildStudySystemPrompt', () => {
  const phrases: LessonPhrase[] = [
    { correction: 'me resulta difícil', explanation: 'Use this instead of "es difícil para mí"', flashcard_front: null, flashcard_back: null },
    { correction: 'dale, vamos', explanation: 'Casual agreement / let\'s go', flashcard_front: null, flashcard_back: null },
  ]

  it('shows only the current (first) card, never future cards — the read-ahead guard', () => {
    // Root cause of the "coach drills phrases I'm not reviewing yet" bug: the
    // prompt used to embed the entire deck, so the model read ahead. The fix
    // delivers one card at a time. Card 1 must be present; later cards must NOT
    // appear anywhere in the prompt.
    const prompt = buildStudySystemPrompt(phrases, 'es-AR')
    expect(prompt).toContain('me resulta difícil')
    expect(prompt).not.toContain('dale, vamos')
  })

  it('embeds the first card using the CURRENT CARD delivery format', () => {
    const prompt = buildStudySystemPrompt(phrases, 'es-AR')
    expect(prompt).toContain(formatStudyCard(phrases[0], 0, phrases.length, 'es-AR'))
    expect(prompt).toMatch(/CARTA ACTUAL 1\/2/)
  })

  it('reports the total card count without listing the cards', () => {
    const prompt = buildStudySystemPrompt(phrases, 'es-AR')
    expect(prompt).toMatch(/2 cartas|2 cards/i)
  })

  it('explicitly forbids looking ahead to phrases not yet delivered', () => {
    // The structural guarantee (one card in the prompt) is reinforced by an
    // explicit no-look-ahead instruction in both languages.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/NEVER LOOK AHEAD/i)
    expect(en).toMatch(/do not know the upcoming cards/i)
    expect(es).toMatch(/NUNCA TE ADELANTES/i)
    expect(es).toMatch(/no conocés las cartas que vienen/i)
  })

  it('describes per-card advancement via a new CURRENT CARD message', () => {
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/the next card arrives/i)
    expect(es).toMatch(/la próxima carta te llega/i)
  })

  it('keeps the Rioplatense accent guard for es-AR', () => {
    const prompt = buildStudySystemPrompt(phrases, 'es-AR')
    expect(prompt).toMatch(/rioplatense|porteño/i)
    expect(prompt).toMatch(/voseo/i)
  })

  it('keeps the NZ accent guard for en-NZ', () => {
    const enPhrases: LessonPhrase[] = [
      { correction: 'going to', explanation: 'Use instead of "gonna"', flashcard_front: null, flashcard_back: null },
    ]
    const prompt = buildStudySystemPrompt(enPhrases, 'en-NZ')
    expect(prompt).toMatch(/New Zealand|Kiwi/i)
    expect(prompt).not.toMatch(/rioplatense|porteño/i)
  })

  it('does not include set_phase tool instructions or numbered Phase labels', () => {
    // The phase machine (set_phase tool + the deleted phase-rail UI) is gone.
    // Phases are internal prose; no tool wiring, and no "Phase N" headings.
    const prompt = buildStudySystemPrompt(phrases, 'es-AR')
    expect(prompt).not.toContain('set_phase')
    expect(prompt).not.toMatch(/Phase 1|Phase 2|Phase 3|Phase 4/i)
  })

  it('teaches a card through an explain → model → drill flow', () => {
    // Each card is a self-contained mini-lesson. The three steps must be
    // named so the coach actively leads rather than waiting in silence.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/Explain:/)
    expect(en).toMatch(/Model:/)
    expect(en).toMatch(/Drill:/)
    expect(es).toMatch(/Explicar:/)
    expect(es).toMatch(/Mostrar:/)
    expect(es).toMatch(/Practicar:/)
  })

  it('has no open-ended free-conversation phase', () => {
    // Free chat belongs to Talk freely, not Study. The old free_use phase is
    // removed so a card never drifts into unscripted conversation.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).not.toMatch(/free.use|free conversation|any topic/i)
    expect(es).not.toMatch(/free.use|conversación libre|cualquier tema/i)
  })

  it('keeps the coach drilling instead of going silent, with no time limit', () => {
    // The original complaint: the coach went silent after one drill, leaving
    // dead air. The coach must keep offering drills and never stop on a timer.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/do NOT go silent/i)
    expect(en).toMatch(/no.*time limit/i)
    expect(es).toMatch(/NO te quedes en silencio/i)
    expect(es).toMatch(/límite de tiempo/i)
  })

  it('uses a natural cadence rather than a strict one-sentence-per-turn rule', () => {
    // Bringing back the lesson prompt drops the rigid one-sentence cap that
    // made the coach feel stilted; turns are short but not artificially capped.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).not.toMatch(/ONE SENTENCE PER TURN/i)
    expect(en).toMatch(/not limited to a single sentence/i)
    expect(es).not.toMatch(/UNA ORACIÓN POR TURNO/i)
    expect(es).toMatch(/limitado a una sola oración/i)
  })

  it('invites the learner with the corrected phrase, in the coach\'s own words', () => {
    // The invite embeds the phrase in a question; the coach explains in its
    // own words and never reads the on-screen explanation verbatim.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/Can you try saying/i)
    expect(en).toMatch(/in your own words/i)
    expect(en).toMatch(/already on the learner's screen/i)
    expect(es).toMatch(/¿Podés intentar decir/i)
    expect(es).toMatch(/con tus palabras/i)
    expect(es).toMatch(/ya está en la pantalla/i)
  })

  it('never voices a tap-Got-it cue and forbids mentioning the button', () => {
    // The button is always visible; the learner advances themselves. The coach
    // must never tell them to tap anything or mention any button.
    const en = buildStudySystemPrompt(phrases, 'en-NZ')
    const es = buildStudySystemPrompt(phrases, 'es-AR')
    expect(en).toMatch(/tell the learner to tap/i)
    expect(en).toMatch(/mention any button/i)
    expect(en).not.toMatch(/Tap 'Got it' when you're ready/i)
    expect(es).toMatch(/Nunca le digas al estudiante que toque/i)
    expect(es).toMatch(/ningún botón/i)
    expect(es).not.toMatch(/Tocá '¡Entendido!' cuando estés listo/i)
  })
})

describe('formatStudyCard', () => {
  const phrase: LessonPhrase = {
    correction: 'dale, vamos',
    explanation: 'Casual agreement',
    flashcard_front: null,
    flashcard_back: null,
  }

  it('renders a 1-based position out of the total with the phrase and explanation', () => {
    expect(formatStudyCard(phrase, 1, 3, 'en-NZ')).toBe('CURRENT CARD 2/3: "dale, vamos" — Casual agreement')
  })

  it('localizes the card label for es-AR', () => {
    expect(formatStudyCard(phrase, 1, 3, 'es-AR')).toBe('CARTA ACTUAL 2/3: "dale, vamos" — Casual agreement')
  })

  it('produces the same shape the prompt embeds for card 1', () => {
    // The prompt and the on-advance delivery must agree on the cue format so
    // the model treats card 1 and card N identically.
    const prompt = buildStudySystemPrompt([phrase], 'en-NZ')
    expect(prompt).toContain(formatStudyCard(phrase, 0, 1, 'en-NZ'))
  })
})

describe('formatStudyCardAdvance', () => {
  const phrase: LessonPhrase = {
    correction: 'dale, vamos',
    explanation: 'Casual agreement',
    flashcard_front: null,
    flashcard_back: null,
  }

  it('carries the CURRENT CARD delivery line for the new phrase', () => {
    const msg = formatStudyCardAdvance(phrase, 1, 3, 'en-NZ')
    expect(msg).toContain(formatStudyCard(phrase, 1, 3, 'en-NZ'))
  })

  it('appends a reminder to re-run the explain → model → drill flow', () => {
    const en = formatStudyCardAdvance(phrase, 1, 3, 'en-NZ')
    const es = formatStudyCardAdvance(phrase, 1, 3, 'es-AR')
    expect(en).toMatch(/explain it, model a couple of examples, then keep drilling/i)
    expect(es).toMatch(/explicala, mostrá un par de ejemplos/i)
  })

  it('does not leak earlier or later cards — only the delivered phrase', () => {
    const msg = formatStudyCardAdvance(phrase, 1, 3, 'en-NZ')
    expect(msg).toContain('dale, vamos')
    expect(msg).toContain('2/3')
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
