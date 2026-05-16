// __tests__/lib/persona.test.ts
//
// Persona generator + system-prompt builder. Covers the hardening that
// matters at the route boundary: schema validation, voice catalog
// constraints, JSON-parse fallback, and trigger-prompt wiring.

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

const validPersona: Persona = {
  name: 'Mateo',
  voiceName: 'Fenrir',
  opener: 'Hola, soy Mateo, te llamo desde Ezeiza — perdí el vuelo.',
  systemPromptAddendum: 'Sos Mateo, programador. Llamás frustrado porque perdiste el vuelo.',
}

function mockClaudeResponse(json: unknown) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
  })
}

describe('generatePersona', () => {
  it('returns the parsed persona when Claude returns valid JSON', async () => {
    mockClaudeResponse(validPersona)
    const result = await generatePersona('es-AR')
    expect(result).toEqual(validPersona)
  })

  it('strips ```json fences before parsing — Claude sometimes wraps output', async () => {
    mockClaudeResponse('```json\n' + JSON.stringify(validPersona) + '\n```')
    const result = await generatePersona('es-AR')
    expect(result.name).toBe('Mateo')
  })

  it('falls back to a built-in persona when Claude returns non-JSON', async () => {
    mockClaudeResponse('not even close to json')
    const result = await generatePersona('es-AR')
    expect(result.name).toBeTruthy()
    expect(result.opener).toBeTruthy()
    expect(result.voiceName).toBeTruthy()
  })

  it('falls back when required fields are missing', async () => {
    mockClaudeResponse({ name: 'Mateo' })
    const result = await generatePersona('es-AR')
    // Fallback persona, not the partial one
    expect(result.opener).toBeTruthy()
    expect(result.systemPromptAddendum).toBeTruthy()
  })

  it('replaces an unknown voiceName with the safety fallback voice', async () => {
    mockClaudeResponse({ ...validPersona, voiceName: 'TotallyMadeUpVoice' })
    const result = await generatePersona('es-AR')
    const voiceNames = VOICE_CATALOG.map(v => v.name)
    expect(voiceNames).toContain(result.voiceName)
  })

  it('honours an unfamiliar but-valid voice from the catalog (e.g. Pulcherrima)', async () => {
    mockClaudeResponse({ ...validPersona, voiceName: 'Pulcherrima' })
    const result = await generatePersona('es-AR')
    expect(result.voiceName).toBe('Pulcherrima')
  })

  it('routes to the en-NZ system prompt for English learners', async () => {
    mockClaudeResponse({
      ...validPersona,
      name: 'Sam',
      opener: "Hey, it's Sam — quick favour?",
      systemPromptAddendum: "You are Sam, friendly neighbour.",
    })
    await generatePersona('en-NZ')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    // The English prompt mentions "NZ register" — the Spanish one mentions "voseo".
    expect(systemPrompt).toContain('English')
    expect(systemPrompt).not.toContain('voseo')
  })

  it('uses the Spanish prompt for es-AR with explicit voseo guidance', async () => {
    mockClaudeResponse(validPersona)
    await generatePersona('es-AR')
    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('voseo')
    expect(systemPrompt).toContain('Rioplatense')
  })
})

describe('buildPersonaSystemPrompt', () => {
  const basePrompt = 'You are a casual conversation partner.'

  it('appends the persona block + opener trigger instructions', () => {
    const result = buildPersonaSystemPrompt(basePrompt, validPersona)
    expect(result).toContain(basePrompt)
    expect(result).toContain(validPersona.systemPromptAddendum)
    expect(result).toContain(validPersona.opener)
  })

  it('instructs the model to speak the opener on the __START_CALL__ trigger', () => {
    const result = buildPersonaSystemPrompt(basePrompt, validPersona)
    expect(result).toContain('__START_CALL__')
    expect(result).toMatch(/Speak this exact line FIRST/)
  })

  it('warns the model not to repeat the trigger token aloud', () => {
    const result = buildPersonaSystemPrompt(basePrompt, validPersona)
    expect(result).toMatch(/Do NOT mention the trigger/)
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
