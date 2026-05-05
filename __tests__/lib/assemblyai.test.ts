// __tests__/lib/assemblyai.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseWebhookBody, mapParagraphsToSegments } from '@/lib/assemblyai'
import type { ParsedSegment, TranscriptParagraph } from '@/lib/assemblyai'
import { log } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

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

function seg(overrides: Partial<ParsedSegment> = {}): ParsedSegment {
  return {
    speaker: 'A',
    text: 'sample text',
    start_ms: 0,
    end_ms: 1000,
    position: 0,
    paragraph_breaks: [],
    ...overrides,
  }
}

function para(overrides: Partial<TranscriptParagraph> = {}): TranscriptParagraph {
  return {
    text: 'sample text',
    start: 0,
    end: 1000,
    confidence: 0.99,
    words: [],
    ...overrides,
  }
}

describe('mapParagraphsToSegments', () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockClear()
  })

  it('returns empty paragraph_breaks when one paragraph fills one segment', () => {
    const segs = [seg({ text: 'Hola mundo entero.', start_ms: 0, end_ms: 1000 })]
    const paras = [para({ text: 'Hola mundo entero.', start: 0, end: 1000 })]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
  })

  it('records breaks at correct offsets when one segment contains three paragraphs', () => {
    const text = 'First paragraph here. Second paragraph too. Last bit.'
    const segs = [seg({ text, start_ms: 0, end_ms: 9000 })]
    const paras = [
      para({ text: 'First paragraph here.', start: 0,    end: 3000 }),
      para({ text: 'Second paragraph too.', start: 3500, end: 6000 }),
      para({ text: 'Last bit.',             start: 6500, end: 9000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([22, 44])
  })

  it('attributes paragraphs to the correct segment by timestamp', () => {
    const segs = [
      seg({ text: 'Speaker A here. More A.', start_ms: 0,    end_ms: 5000, position: 0 }),
      seg({ text: 'Speaker B reply.',         start_ms: 5500, end_ms: 8000, position: 1, speaker: 'B' }),
    ]
    const paras = [
      para({ text: 'Speaker A here.',   start: 0,    end: 2000 }),
      para({ text: 'More A.',           start: 2500, end: 5000 }),
      para({ text: 'Speaker B reply.',  start: 5500, end: 8000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([16])
    expect(out[1].paragraph_breaks).toEqual([])
  })

  it('attributes a paragraph at a shared boundary timestamp to the EARLIER segment', () => {
    const segs = [
      seg({ text: 'Edge case.', start_ms: 0,    end_ms: 1000, position: 0 }),
      seg({ text: 'Next part.', start_ms: 1000, end_ms: 2000, position: 1 }),
    ]
    const paras = [
      para({ text: 'Edge case.', start: 0,    end: 500 }),
      para({ text: 'Next part.', start: 1000, end: 2000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
    expect(out[1].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph text not found in segment text',
      expect.any(Object)
    )
  })

  it('skips paragraphs whose timestamps fall outside every segment range', () => {
    const segs = [seg({ text: 'Only segment.', start_ms: 0, end_ms: 1000 })]
    const paras = [
      para({ text: 'Only segment.', start: 0, end: 1000 }),
      para({ text: 'Stray.',        start: 5000, end: 6000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph timestamp outside all segment ranges',
      expect.any(Object)
    )
  })

  it('skips a paragraph whose text is not found in the segment text', () => {
    const segs = [seg({ text: 'Hola mundo.', start_ms: 0, end_ms: 1000 })]
    const paras = [
      para({ text: 'Adiós mundo.', start: 0, end: 1000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph text not found in segment text',
      expect.any(Object)
    )
  })

  it('uses progressive search to disambiguate repeated paragraph text', () => {
    const text = 'OK. OK. OK.'
    const segs = [seg({ text, start_ms: 0, end_ms: 3000 })]
    const paras = [
      para({ text: 'OK.', start: 0,    end: 1000 }),
      para({ text: 'OK.', start: 1000, end: 2000 }),
      para({ text: 'OK.', start: 2000, end: 3000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([4, 8])
  })

  it('returns segments unmodified when paragraphs array is empty', () => {
    const segs = [seg({ text: 'Hola.', start_ms: 0, end_ms: 1000 })]
    const out = mapParagraphsToSegments(segs, [])
    expect(out[0].paragraph_breaks).toEqual([])
  })
})
