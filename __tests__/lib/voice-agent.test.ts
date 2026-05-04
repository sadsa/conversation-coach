// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/voice-agent'
import type { VoicePageContext } from '@/lib/voice-context'

const writeContext: VoicePageContext = {
  kind: 'write',
  items: [
    { original: 'fui', correction: 'anduve', explanation: '"Andar" for movement.', segmentText: null, sessionTitle: 'Café con Mati' },
    { original: 'tengo calor', correction: 'hace calor', explanation: 'Impersonal weather expression.', segmentText: 'Hoy tengo calor.', sessionTitle: 'Clase de español' },
  ],
}

const sessionContext: VoicePageContext = {
  kind: 'session',
  sessionTitle: 'Cena con Marcela',
  excerpts: [
    { position: 4, speaker: 'other', text: '¿Qué querés tomar?', isAnnotated: false },
    { position: 5, speaker: 'user', text: 'Yo quiero agua.', isAnnotated: true },
    { position: 6, speaker: 'other', text: 'Perfecto.', isAnnotated: false },
  ],
  annotations: [
    { segmentPosition: 5, type: 'grammar', original: 'Yo quiero', correction: 'Quiero', explanation: 'Drop pronoun in Rioplatense.' },
  ],
}

const emptySessionContext: VoicePageContext = {
  kind: 'session',
  sessionTitle: 'Clase corta',
  excerpts: [],
  annotations: [],
}

describe('buildSystemPrompt', () => {
  // --- language block ---

  it('includes Rioplatense instructions for es-AR', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).toContain('Rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('Argentine Spanish')
  })

  it('includes Kiwi instructions for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' })
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Kiwi')
  })

  // --- route hint ---

  it('appends a Write-list hint (es-AR) when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' })
    expect(prompt).toContain('lista de cosas para escribir')
  })

  it('appends a Write-list hint (en-NZ) when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'write' })
    expect(prompt).toContain('Write list')
    expect(prompt).toContain('saved corrections')
  })

  it('appends a session-review hint (es-AR) when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'session', sessionTitle: 'Café con Mati' })
    expect(prompt).toContain("'Café con Mati'")
    expect(prompt).toContain('repasando')
  })

  it('appends a session-review hint (en-NZ) when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: 'Coffee with Mati' })
    expect(prompt).toContain("'Coffee with Mati'")
    expect(prompt).toContain('reviewing')
  })

  it('strips apostrophes from session titles in the route hint', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: "Lucia's birthday" })
    expect(prompt).toContain("'Lucias birthday'")
    expect(prompt).not.toContain("'Lucia's birthday'")
  })

  it('appends no route hint when routeContext.kind is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).not.toContain('Write list')
    expect(prompt).not.toContain('lista de cosas')
    expect(prompt).not.toContain('repasando')
    expect(prompt).not.toContain('reviewing')
  })

  // --- page-context block: write ---

  it('renders the write corrections block when pageContext is kind=write', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    expect(prompt).toContain('Pending corrections the user has saved:')
    expect(prompt).toContain('"fui" → "anduve"')
    expect(prompt).toContain('"Andar" for movement.')
    expect(prompt).toContain('(from "Café con Mati")')
    expect(prompt).toContain('"tengo calor" → "hace calor"')
  })

  it('omits the (from "…") part when sessionTitle is null', () => {
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'x', correction: 'y', explanation: 'z', segmentText: null, sessionTitle: null }],
    }
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, ctx)
    expect(prompt).not.toContain('from "')
  })

  it('renders correction as original when correction is null (write context)', () => {
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'x', correction: null, explanation: 'z', segmentText: null, sessionTitle: null }],
    }
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, ctx)
    // No " → " arrow when correction is null
    expect(prompt).not.toContain(' → ')
    expect(prompt).toContain('"x"')
  })

  // --- page-context block: session ---

  it('renders the transcript excerpt block when pageContext is kind=session', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'session', sessionTitle: 'Cena con Marcela' }, sessionContext)
    expect(prompt).toContain('The user is reviewing this conversation excerpt:')
    expect(prompt).toContain('[user, position 5]: Yo quiero agua.  ← annotated')
    expect(prompt).toContain('[other, position 4]: ¿Qué querés tomar?')
    expect(prompt).toContain('Annotations on this excerpt:')
    expect(prompt).toContain('"Yo quiero" → "Quiero"')
    expect(prompt).toContain('Drop pronoun in Rioplatense.')
  })

  it('collapses to a single title line when excerpts is empty', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, emptySessionContext)
    expect(prompt).toContain("The user is reviewing the conversation titled 'Clase corta'.")
    expect(prompt).not.toContain('Annotations on this excerpt:')
  })

  it('omits the annotations header when session has excerpts but no annotations', () => {
    const noAnnCtx: VoicePageContext = {
      kind: 'session',
      sessionTitle: 'Solo session',
      excerpts: [{ position: 3, speaker: 'user', text: 'Hola.', isAnnotated: false }],
      annotations: [],
    }
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, noAnnCtx)
    expect(prompt).toContain('The user is reviewing this conversation excerpt:')
    expect(prompt).toContain('[user, position 3]: Hola.')
    expect(prompt).not.toContain('Annotations on this excerpt:')
  })

  // --- opening guidance ---

  it('uses "greet briefly" guidance when pageContext is absent', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('uses "greet briefly" guidance even on the write route when pageContext is absent', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('uses the deixis guidance when pageContext is present', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    expect(prompt).toContain('may refer to these by deixis')
    expect(prompt).toContain('Be brief')
    expect(prompt).not.toContain('Greet them briefly')
  })

  it('uses the deixis guidance for session context too', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: 'T' }, sessionContext)
    expect(prompt).toContain('may refer to these by deixis')
  })

  // --- page-context is independent of target language ---

  it('renders the same page-context block for both target languages', () => {
    const esPrompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    const enPrompt = buildSystemPrompt('en-NZ', { kind: 'write' }, writeContext)
    // Both contain the (English) structural label
    expect(esPrompt).toContain('Pending corrections the user has saved:')
    expect(enPrompt).toContain('Pending corrections the user has saved:')
    // Both contain the same item content
    expect(esPrompt).toContain('"fui" → "anduve"')
    expect(enPrompt).toContain('"fui" → "anduve"')
  })
})
