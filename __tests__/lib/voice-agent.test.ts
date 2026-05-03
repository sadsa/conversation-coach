import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/voice-agent'
import type { FocusedCorrection } from '@/lib/voice-agent'

const items: FocusedCorrection[] = [
  { original: 'fui', correction: 'anduve', explanation: '"Andar" for movement through a space.' },
  { original: 'tengo calor', correction: 'hace calor', explanation: 'Impersonal weather expression.' },
]

describe('buildSystemPrompt', () => {
  it('includes Rioplatense instructions for es-AR', () => {
    const prompt = buildSystemPrompt('es-AR', items)
    expect(prompt).toContain('Rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('Argentine Spanish')
  })

  it('includes Kiwi instructions for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items)
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Kiwi')
  })

  it('lists up to 10 items', () => {
    const manyItems: FocusedCorrection[] = Array.from({ length: 15 }, (_, i) => ({
      original: `word${i}`,
      correction: `fix${i}`,
      explanation: `Reason ${i}.`,
    }))
    const prompt = buildSystemPrompt('es-AR', manyItems)
    expect(prompt).toContain('word9')
    expect(prompt).not.toContain('word10')
  })

  it('lists all provided items', () => {
    const prompt = buildSystemPrompt('es-AR', items)
    expect(prompt).toContain('tengo calor')
    expect(prompt).toContain('hace calor')
  })

  it('appends a Write-list hint when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('es-AR', items, { kind: 'write' })
    expect(prompt).toContain('lista de cosas para escribir')
  })

  it('appends an English Write-list hint when routeContext.kind is "write" and language is en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items, { kind: 'write' })
    expect(prompt).toContain('Write list')
    expect(prompt).toContain('saved corrections')
  })

  it('appends a session-review hint with the title when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('es-AR', items, {
      kind: 'session',
      sessionTitle: 'Café con Mati',
    })
    expect(prompt).toContain("'Café con Mati'")
    expect(prompt).toContain('repasando')
  })

  it('uses English session-review wording for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items, {
      kind: 'session',
      sessionTitle: 'Coffee with Mati',
    })
    expect(prompt).toContain("'Coffee with Mati'")
    expect(prompt).toContain('reviewing')
  })

  it('does not append a hint when routeContext.kind is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', items, { kind: 'other' })
    expect(prompt).not.toContain('Write list')
    expect(prompt).not.toContain('reviewing')
    expect(prompt).not.toContain('repasando')
  })

  it('tells the agent to greet open-endedly when items empty and route is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', [], { kind: 'other' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('omits the items block entirely when items is an empty array', () => {
    const prompt = buildSystemPrompt('es-AR', [], { kind: 'other' })
    expect(prompt).not.toContain('corrections to review')
  })

  it('uses an open-ended closer when items empty even on the write route', () => {
    const prompt = buildSystemPrompt('es-AR', [], { kind: 'write' })
    expect(prompt).not.toContain('which correction they want to discuss')
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('strips apostrophes from session titles to keep quoting intact', () => {
    const prompt = buildSystemPrompt('en-NZ', items, {
      kind: 'session',
      sessionTitle: "Lucia's birthday",
    })
    expect(prompt).toContain("'Lucias birthday'")
    expect(prompt).not.toContain("'Lucia's birthday'")
  })
})
