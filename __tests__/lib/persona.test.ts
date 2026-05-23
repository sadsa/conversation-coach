// __tests__/lib/persona.test.ts

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
  pickCharacter,
  CHARACTER_ROSTER,
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
  opener: 'Ah, hola, soy Nora. ¿Tenés un segundo?',
  backstory: 'Vos y Nora se conocen del edificio hace años. La semana pasada el plomero del edificio le dijo a Nora que hay una humedad en el segundo piso que viene de tu departamento.',
  systemPromptAddendum: 'Estás preocupada pero no querés armar drama. Guardá el detalle del plomero para después de que el aprendiz pregunte qué pasó exactamente.',
}

function mockClaudeResponse(json: unknown) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
  })
}

// ─── CHARACTER_ROSTER ────────────────────────────────────────────────────────

describe('CHARACTER_ROSTER', () => {
  it('has 8 es-AR characters', () => {
    const esAR = CHARACTER_ROSTER.filter(c => c.language === 'es-AR')
    expect(esAR).toHaveLength(8)
  })

  it('has 8 en-NZ characters', () => {
    const enNZ = CHARACTER_ROSTER.filter(c => c.language === 'en-NZ')
    expect(enNZ).toHaveLength(8)
  })

  it('every character has all required fields non-empty', () => {
    for (const c of CHARACTER_ROSTER) {
      expect(c.id, `${c.name} missing id`).toBeTruthy()
      expect(c.name, `character missing name`).toBeTruthy()
      expect(c.ageYears, `${c.name} missing age`).toBeGreaterThan(0)
      expect(c.voiceName, `${c.name} missing voiceName`).toBeTruthy()
      expect(c.region, `${c.name} missing region`).toBeTruthy()
      expect(c.relationship, `${c.name} missing relationship`).toBeTruthy()
      expect(c.personality, `${c.name} missing personality`).toBeTruthy()
      expect(c.lifeContext, `${c.name} missing lifeContext`).toBeTruthy()
    }
  })

  it('all character ids are unique', () => {
    const ids = CHARACTER_ROSTER.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every character voice exists in VOICE_CATALOG', () => {
    const validVoices = new Set(VOICE_CATALOG.map(v => v.name))
    for (const c of CHARACTER_ROSTER) {
      expect(validVoices.has(c.voiceName), `${c.name} has invalid voice "${c.voiceName}"`).toBe(true)
    }
  })
})

// ─── pickCharacter ───────────────────────────────────────────────────────────

describe('pickCharacter', () => {
  it('returns a character with matching language for es-AR', () => {
    const char = pickCharacter('es-AR')
    expect(char.language).toBe('es-AR')
  })

  it('returns a character with matching language for en-NZ', () => {
    const char = pickCharacter('en-NZ')
    expect(char.language).toBe('en-NZ')
  })

  it('produces variety across 50 draws (does not always return the same character)', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) ids.add(pickCharacter('es-AR').id)
    expect(ids.size).toBeGreaterThanOrEqual(4)
  })
})

// ─── generatePersona ─────────────────────────────────────────────────────────

describe('generatePersona', () => {
  it('returns a Persona with all required fields including backstory', async () => {
    mockClaudeResponse(validWriterOutput)
    const result = await generatePersona('es-AR')
    expect(result.opener).toBe(validWriterOutput.opener)
    expect(result.backstory).toBe(validWriterOutput.backstory)
    expect(result.systemPromptAddendum).toContain(validWriterOutput.systemPromptAddendum)
    expect(result.name).toBeTruthy()
    const voiceNames = VOICE_CATALOG.map(v => v.name)
    expect(voiceNames).toContain(result.voiceName)
  })

  it('prepends character identity block to systemPromptAddendum', async () => {
    mockClaudeResponse(validWriterOutput)
    const result = await generatePersona('es-AR')
    // Character identity is pre-rendered before Claude's addendum
    expect(result.systemPromptAddendum).toMatch(/\d+ años/)
  })

  it('strips ```json fences before parsing', async () => {
    mockClaudeResponse('```json\n' + JSON.stringify(validWriterOutput) + '\n```')
    const result = await generatePersona('es-AR')
    expect(result.opener).toBe(validWriterOutput.opener)
  })

  it('falls back to template when Claude returns non-JSON', async () => {
    mockClaudeResponse('not even close to json')
    const result = await generatePersona('es-AR')
    expect(result.name).toBeTruthy()
    expect(result.opener).toBeTruthy()
    expect(result.systemPromptAddendum).toBeTruthy()
    expect(result.backstory).toBeTruthy()
    expect(result.voiceName).toBeTruthy()
  })

  it('falls back when backstory is missing from Claude response', async () => {
    mockClaudeResponse({ opener: 'Hola.', systemPromptAddendum: 'Sos Nora.' })
    const result = await generatePersona('es-AR')
    expect(result.backstory).toBeTruthy()
    expect(result.opener).not.toBe('Hola.')
  })

  it("always returns the character's locked voice, not anything Claude returns", async () => {
    mockClaudeResponse(validWriterOutput)
    const result = await generatePersona('es-AR')
    const esArVoices = new Set(
      CHARACTER_ROSTER.filter(c => c.language === 'es-AR').map(c => c.voiceName)
    )
    expect(esArVoices.has(result.voiceName)).toBe(true)
  })

  it('sends an en-NZ writer prompt for English learners', async () => {
    mockClaudeResponse({
      opener: "Hey, it's Aroha — you got a sec?",
      backstory: 'You and Aroha go to the same gym.',
      systemPromptAddendum: 'You are Aroha. Hold back the reason.',
    })
    await generatePersona('en-NZ')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('NZ register')
    expect(systemPrompt).not.toContain('voseo')
  })

  it('sends a rioplatense writer prompt for es-AR learners', async () => {
    mockClaudeResponse(validWriterOutput)
    await generatePersona('es-AR')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('voseo')
    expect(systemPrompt).toContain('rioplatense')
  })

  it('passes character brief with name and age to Claude', async () => {
    mockClaudeResponse(validWriterOutput)
    await generatePersona('es-AR')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toMatch(/Nombre: \w+/)
    expect(systemPrompt).toMatch(/Edad: \d+/)
    expect(systemPrompt).toMatch(/ESTADO EMOCIONAL/i)
  })
})

// ─── buildPersonaSystemPrompt ─────────────────────────────────────────────────

describe('buildPersonaSystemPrompt', () => {
  const basePrompt = 'You are a casual conversation partner.'
  const persona: Persona = {
    name: 'Nora',
    voiceName: 'Vindemiatrix',
    opener: '¿Hola, sos vos?',
    systemPromptAddendum: 'Sos Nora, 65 años, vecina del tercer piso.',
    backstory: 'Hace una semana el plomero rompió un caño en el edificio y Nora necesita hablar con el encargado.',
  }

  it('includes the base prompt', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toContain(basePrompt)
  })

  it('includes systemPromptAddendum', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toContain(persona.systemPromptAddendum)
  })

  it('includes the backstory', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toContain(persona.backstory)
  })

  it('includes the opener', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toContain(persona.opener)
  })

  it('includes call-pacing instructions', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    expect(result).toMatch(/CONVERSATION DYNAMICS/)
    expect(result).toMatch(/gradually|one piece|one detail/i)
    expect(result).toMatch(/short|1.{0,3}2 short sentences/i)
  })

  it('has the backstory section before the conversation dynamics section', () => {
    const result = buildPersonaSystemPrompt(basePrompt, persona)
    const backstoryPos = result.indexOf(persona.backstory)
    const dynamicsPos = result.indexOf('CONVERSATION DYNAMICS')
    expect(backstoryPos).toBeGreaterThan(0)
    expect(backstoryPos).toBeLessThan(dynamicsPos)
  })
})

// ─── VOICE_CATALOG ────────────────────────────────────────────────────────────

describe('VOICE_CATALOG', () => {
  it('exposes at least 10 voices', () => {
    expect(VOICE_CATALOG.length).toBeGreaterThanOrEqual(10)
  })

  it('every entry has name and vibe', () => {
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
