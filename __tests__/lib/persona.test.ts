// __tests__/lib/persona.test.ts
//
// Persona generator + system-prompt builder. The generator now pre-picks
// the persona's axes (name, age, gender, relation, location, emotion,
// reason, voice) in JS using Math.random, and Claude is only asked to
// flesh out the opener + addendum from that brief. Tests cover:
//   - Claude's role: parse opener/addendum and merge with the seed
//   - JSON-parse + missing-field fallbacks still produce a complete Persona
//   - VOICE_CATALOG export integrity
//   - pickPersonaSeed diversity over many draws
//   - buildPersonaSystemPrompt wiring (unchanged behaviour)

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}))

import Anthropic from '@anthropic-ai/sdk'
import {
  generatePersona,
  buildPersonaSystemPrompt,
  pickPersonaSeed,
  VOICE_CATALOG,
  type Persona,
} from '@/lib/persona'

const mockCreate = vi.fn()

beforeEach(() => {
  mockCreate.mockClear()
  vi.mocked(Anthropic).mockImplementation(function () {
    return { messages: { create: mockCreate } } as unknown as Anthropic
  })
})

const validWriterOutput = {
  opener: 'Hola, soy Mateo, te llamo desde Ezeiza — perdí el vuelo.',
  systemPromptAddendum: 'Sos Mateo, programador. Llamás frustrado porque perdiste el vuelo.',
}

function mockClaudeResponse(json: unknown) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
  })
}

describe('generatePersona', () => {
  it('merges Claude\'s opener/addendum with the seed\'s name + voice', async () => {
    mockClaudeResponse(validWriterOutput)
    const result = await generatePersona('es-AR')
    expect(result.opener).toBe(validWriterOutput.opener)
    expect(result.systemPromptAddendum).toBe(validWriterOutput.systemPromptAddendum)
    // name and voice come from the JS seed, not Claude
    expect(result.name).toBeTruthy()
    const voiceNames = VOICE_CATALOG.map(v => v.name)
    expect(voiceNames).toContain(result.voiceName)
  })

  it('strips ```json fences before parsing — Claude sometimes wraps output', async () => {
    mockClaudeResponse('```json\n' + JSON.stringify(validWriterOutput) + '\n```')
    const result = await generatePersona('es-AR')
    expect(result.opener).toBe(validWriterOutput.opener)
  })

  it('falls back to a templated opener when Claude returns non-JSON', async () => {
    mockClaudeResponse('not even close to json')
    const result = await generatePersona('es-AR')
    // Template fallback uses the seed — every field is still populated.
    expect(result.name).toBeTruthy()
    expect(result.opener).toBeTruthy()
    expect(result.systemPromptAddendum).toBeTruthy()
    expect(result.voiceName).toBeTruthy()
  })

  it('falls back when required fields are missing from Claude\'s response', async () => {
    mockClaudeResponse({ opener: 'Just an opener, no addendum.' })
    const result = await generatePersona('es-AR')
    // Both opener and addendum required — falls through to the template.
    expect(result.opener).toBeTruthy()
    expect(result.systemPromptAddendum).toBeTruthy()
    expect(result.opener).not.toBe('Just an opener, no addendum.')
  })

  it('always returns a voice from the catalog regardless of Claude output', async () => {
    // Even if Claude tried to inject a voiceName, the generator ignores it —
    // voice is locked server-side from the seed.
    mockClaudeResponse({
      ...validWriterOutput,
      voiceName: 'TotallyMadeUpVoice',
    })
    const result = await generatePersona('es-AR')
    const voiceNames = VOICE_CATALOG.map(v => v.name)
    expect(voiceNames).toContain(result.voiceName)
    expect(result.voiceName).not.toBe('TotallyMadeUpVoice')
  })

  it('routes to the en-NZ writer prompt for English learners', async () => {
    mockClaudeResponse({
      opener: "Hey, it's Sam — quick favour?",
      systemPromptAddendum: "You are Sam, friendly neighbour.",
    })
    await generatePersona('en-NZ')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('English')
    expect(systemPrompt).not.toContain('voseo')
    expect(systemPrompt).toContain('NZ register')
  })

  it('uses the Spanish writer prompt for es-AR with voseo guidance', async () => {
    mockClaudeResponse(validWriterOutput)
    await generatePersona('es-AR')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('voseo')
    expect(systemPrompt).toContain('rioplatense')
  })

  it('passes a fully-specified character brief to Claude (not generic axes)', async () => {
    mockClaudeResponse(validWriterOutput)
    await generatePersona('es-AR')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    // Brief includes all the pre-picked axes so Claude has nothing to invent.
    expect(systemPrompt).toContain('PERSONAJE')
    expect(systemPrompt).toMatch(/Nombre: \w+/)
    expect(systemPrompt).toMatch(/Edad: \d+/)
    // The "Motivo" label now carries a parenthetical reminding the writer
    // model that this is INTERNAL context — it should NOT be spilled in the
    // opener. The brief still includes the reason; the framing just made
    // explicit it's character motivation, not opening-line material.
    expect(systemPrompt).toMatch(/Motivo de la llamada \(INTERNO/)
    expect(systemPrompt).toMatch(/Está llamando desde:/)
    expect(systemPrompt).toMatch(/Estado emocional:/)
  })
})

describe('pickPersonaSeed diversity', () => {
  // Statistical sanity check. With 100 draws across pools of 20+ items
  // per axis we should see broad coverage, not the runaway clustering we
  // had when Claude picked the axes itself (3/9 same name, 6/9 same voice).
  it('produces a wide spread of names, locations, and reasons across 100 draws', () => {
    const names = new Set<string>()
    const locations = new Set<string>()
    const reasons = new Set<string>()
    const voices = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const seed = pickPersonaSeed('es-AR')
      names.add(seed.name)
      // Probe internals via the brief so we don't need to expose private fields.
      locations.add((seed as unknown as { callingFrom: string }).callingFrom)
      reasons.add((seed as unknown as { reason: string }).reason)
      voices.add(seed.voiceName)
    }
    expect(names.size).toBeGreaterThanOrEqual(25)
    expect(locations.size).toBeGreaterThanOrEqual(15)
    expect(reasons.size).toBeGreaterThanOrEqual(15)
    expect(voices.size).toBeGreaterThanOrEqual(6)
  })

  it('always picks a voice that exists in VOICE_CATALOG', () => {
    const catalog = new Set(VOICE_CATALOG.map(v => v.name))
    for (let i = 0; i < 50; i++) {
      const seed = pickPersonaSeed('es-AR')
      expect(catalog.has(seed.voiceName)).toBe(true)
    }
  })

  it('matches voice gender to persona gender (hard constraint)', () => {
    // Reading the VOICE_CATALOG to assert this generically — if the catalog
    // grows a new voice, this stays valid.
    const voicesByGender = new Map(VOICE_CATALOG.map(v => [v.name, v.gender]))
    for (let i = 0; i < 200; i++) {
      const seed = pickPersonaSeed('es-AR')
      if (seed.gender === 'masculino') {
        expect(voicesByGender.get(seed.voiceName)).toBe('male')
      } else if (seed.gender === 'femenino') {
        expect(voicesByGender.get(seed.voiceName)).toBe('female')
      }
      // non-binary personas may draw any voice — no assertion.
    }
  })

  it('keeps age fit as a soft preference within the matched gender', () => {
    // Older female personas (65+) should land on a 'older' fit voice when
    // one exists in their gender. Soft-fail: if the intersection is ever
    // empty, gender wins. With the current catalog, female has Vindemiatrix
    // and Gacrux as older fits — so every 65+ female should hit one of them.
    const femaleOlder = VOICE_CATALOG
      .filter(v => v.gender === 'female' && v.ageFit === 'older')
      .map(v => v.name)
    expect(femaleOlder.length).toBeGreaterThan(0)
    for (let i = 0; i < 200; i++) {
      const seed = pickPersonaSeed('es-AR')
      const age = (seed as unknown as { ageYears: number }).ageYears
      if (seed.gender === 'femenino' && age >= 65) {
        expect(femaleOlder).toContain(seed.voiceName)
      }
    }
  })

  it('never gives a masculine name a feminine voice — the "Carlos" bug', () => {
    // Sentinel for the specific regression the user reported: persona named
    // Carlos / Mateo / etc. speaking with Pulcherrima / Sulafat / etc.
    const femaleVoices = new Set(
      VOICE_CATALOG.filter(v => v.gender === 'female').map(v => v.name)
    )
    for (let i = 0; i < 500; i++) {
      const seed = pickPersonaSeed('es-AR')
      if (seed.gender === 'masculino') {
        expect(femaleVoices.has(seed.voiceName)).toBe(false)
      }
    }
  })

  it('never picks a fast-paced voice for learner-paced sessions', () => {
    // Guards the speech-speed lever: fast voices (Excitable/Forward/Upbeat/
    // Lively) outpace beginner comprehension, so `pickVoice` filters them
    // out. They stay in VOICE_CATALOG for future "natural pace" toggle, but
    // must never reach a default learner session.
    const fastVoices = new Set(
      VOICE_CATALOG.filter(v => v.pace === 'fast').map(v => v.name)
    )
    // Sanity check the catalog still has fast voices to exclude — guards
    // against accidental retagging that would silently make this test pass.
    expect(fastVoices.size).toBeGreaterThan(0)
    for (let i = 0; i < 500; i++) {
      const seed = pickPersonaSeed('es-AR')
      expect(fastVoices.has(seed.voiceName)).toBe(false)
    }
  })
})

describe('buildPersonaSystemPrompt', () => {
  const basePrompt = 'You are a casual conversation partner.'
  const persona: Persona = {
    name: 'Mateo',
    voiceName: 'Fenrir',
    opener: 'Hola, soy Mateo.',
    systemPromptAddendum: 'Sos Mateo, treintañero.',
  }

  it('appends the persona character block + the opener line', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toContain(basePrompt)
    expect(result).toContain(persona.systemPromptAddendum)
    expect(result).toContain(persona.opener)
  })

  it('instructs the model to wait for the learner to greet before speaking', () => {
    // The whole point of the refactor: the LEARNER picks up the phone and
    // greets first ("Hello, Josh speaking"); the persona responds. If this
    // wait-for-greeting instruction disappears the agent will auto-speak
    // again and the answer-the-phone practice surface dissolves.
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toMatch(/Stay silent until they speak first|wait.*they.*speak/i)
    expect(result).toMatch(/greet/i)
  })

  it('frames the opener as a reply to the learner\'s greeting (adaptable, not verbatim)', () => {
    // The opener is now the agent's FIRST RESPONSE after the learner greets,
    // not an unprompted cold-open. The prompt tells the model it may adapt
    // the line lightly (e.g. address the learner by name if they introduced
    // themselves) — that nuance keeps the conversation feeling like a real
    // reply instead of an awkwardly canned line.
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toMatch(/adapt.*lightly|adapt.*fit/i)
  })

  it('no longer references the legacy __START_CALL__ auto-speak trigger', () => {
    // Guard against accidentally reintroducing the trigger pattern — if the
    // prompt mentions __START_CALL__ but PracticeClient stops sending it,
    // the agent will sit silent waiting for a cue that never arrives.
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).not.toContain('__START_CALL__')
    expect(result).not.toMatch(/Speak this exact line FIRST/)
  })

  it('includes call-pacing instructions so the model eases in instead of info-dumping', () => {
    // Guards the fix for the "first turn dumps the whole situation" bug.
    // We don't pin exact wording — just that the prompt explicitly tells
    // the model to (a) reveal gradually, (b) keep turns short, and (c) wait
    // for follow-up questions. If those three behaviours disappear, the
    // overwhelm regression is back.
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toMatch(/CONVERSATION DYNAMICS/)
    expect(result).toMatch(/gradually|one piece|one detail/i)
    expect(result).toMatch(/short|1.{0,3}2 short sentences/i)
    expect(result).toMatch(/follow-up|wait for the learner/i)
  })
})

describe('VOICE_CATALOG', () => {
  it('exposes at least 10 voices for variety', () => {
    expect(VOICE_CATALOG.length).toBeGreaterThanOrEqual(10)
  })

  it('every entry has both name and vibe', () => {
    for (const entry of VOICE_CATALOG) {
      expect(entry.name).toBeTruthy()
      expect(entry.vibe).toBeTruthy()
    }
  })

  it('voice names are unique', () => {
    const names = VOICE_CATALOG.map(v => v.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
