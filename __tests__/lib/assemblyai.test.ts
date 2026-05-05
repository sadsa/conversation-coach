// __tests__/lib/assemblyai.test.ts
import { describe, it, expect } from 'vitest'
import { parseWebhookBody } from '@/lib/assemblyai'

describe('parseWebhookBody', () => {
  it('extracts segments and speaker count from AssemblyAI transcript', () => {
    const body = {
      transcript_id: 'job123',
      status: 'completed',
      utterances: [
        { speaker: 'A', text: 'Hola, ¿cómo estás?', start: 0, end: 2000 },
        { speaker: 'B', text: 'Bien, gracias.', start: 2500, end: 4000 },
        { speaker: 'A', text: 'Me alegra.', start: 4500, end: 5500 },
      ],
    }
    const result = parseWebhookBody(body)
    expect(result.speakerCount).toBe(2)
    expect(result.segments).toHaveLength(3)
    expect(result.segments[0]).toMatchObject({
      speaker: 'A',
      text: 'Hola, ¿cómo estás?',
      start_ms: 0,
      end_ms: 2000,
      position: 0,
      paragraph_breaks: [],
    })
  })

  it('returns speakerCount 1 when only one speaker present', () => {
    const body = {
      transcript_id: 'job456',
      status: 'completed',
      utterances: [
        { speaker: 'A', text: 'Solo yo hablé.', start: 0, end: 1000 },
      ],
    }
    const result = parseWebhookBody(body)
    expect(result.speakerCount).toBe(1)
  })

  it('throws when status is error', () => {
    const body = { transcript_id: 'job789', status: 'error', error: 'Audio too short' }
    expect(() => parseWebhookBody(body)).toThrow('AssemblyAI error: Audio too short')
  })
})
