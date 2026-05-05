// lib/assemblyai.ts
import { AssemblyAI } from 'assemblyai'
import { log } from '@/lib/logger'

function getClient() {
  return new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
}

export interface ParsedSegment {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
  position: number
  /** Populated by mapParagraphsToSegments; '[]' for legacy or short utterances. */
  paragraph_breaks: number[]
}

export interface ParsedWebhook {
  speakerCount: number
  segments: ParsedSegment[]
}

/** Base URL of the app (must be reachable by AssemblyAI for webhooks).
 *  Uses VERCEL_URL in production; falls back to APP_URL for local dev tunnels (e.g. ngrok). */
function getWebhookBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const appUrl = process.env.APP_URL
  if (appUrl) return appUrl.replace(/\/$/, '')
  throw new Error('Set APP_URL to your tunnel URL (e.g. ngrok) so AssemblyAI can send webhooks.')
}

/** Header AssemblyAI sends with webhook requests when webhook_auth_header_* is set. */
export const WEBHOOK_AUTH_HEADER_NAME = 'X-Webhook-Secret'

/** Submit an audio file URL for transcription with speaker diarization.
 *  Omit `speakersExpected` so AssemblyAI infers speaker count from the audio. */
export async function createJob(audioUrl: string, speakersExpected?: number): Promise<string> {
  const client = getClient()
  const bypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const bypassParam = bypassToken ? `?x-vercel-protection-bypass=${bypassToken}` : ''
  const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/assemblyai${bypassParam}`
  const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET!
  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    webhook_url: webhookUrl,
    webhook_auth_header_name: WEBHOOK_AUTH_HEADER_NAME,
    webhook_auth_header_value: webhookSecret,
    speech_models: ['universal-3-pro', 'universal-2'],
    speaker_labels: true,
    ...(speakersExpected != null ? { speakers_expected: speakersExpected } : {}),
    language_code: 'es',
  })
  return transcript.id
}

/** Attempt to cancel a job. Swallows errors (best-effort). */
export async function cancelJob(jobId: string): Promise<void> {
  try {
    const client = getClient()
    await client.transcripts.delete(jobId)
  } catch (err) {
    log.error('AssemblyAI cancel failed', { jobId, err })
  }
}

/** Fetch the full transcript object for a completed job. */
export async function getTranscript(jobId: string): Promise<Record<string, unknown>> {
  const client = getClient()
  const transcript = await client.transcripts.get(jobId)
  return transcript as unknown as Record<string, unknown>
}

/** Fetch the speech-aware paragraph grouping for a completed job. */
export async function getParagraphs(jobId: string): Promise<TranscriptParagraph[]> {
  const client = getClient()
  const { paragraphs } = await client.transcripts.paragraphs(jobId)
  return paragraphs as TranscriptParagraph[]
}

/** Subset of AssemblyAI's TranscriptParagraph response we actually use.
 *  Source: https://www.assemblyai.com/docs/api-reference/transcripts/get-paragraphs */
export interface TranscriptParagraph {
  text: string
  start: number
  end: number
  confidence: number
  words: Array<{ start: number; end: number; text: string }>
}

/**
 * Map AssemblyAI's transcript-level paragraphs back to per-segment character
 * offsets. Returns a NEW array of segments with `paragraph_breaks` populated
 * based on each paragraph's timestamp + text match within its containing
 * segment.
 *
 * Algorithm (per paragraph, in order):
 *   1. Find the first segment whose [start_ms, end_ms] (inclusive) contains
 *      paragraph.start. Boundary ties go to the earlier segment.
 *   2. If none, skip + warn ('Paragraph timestamp outside all segment ranges').
 *   3. Within that segment's text, indexOf(paragraph.text) starting from a
 *      per-segment cursor that advances past each successful match.
 *   4. If indexOf returns -1, skip + warn ('Paragraph text not found in
 *      segment text'); do NOT advance the cursor.
 *   5. If offset > 0, append to that segment's paragraph_breaks. Offset 0 is
 *      the implicit first paragraph and is not stored.
 *   6. Validate per segment after processing: offsets must be strictly > 0,
 *      < text.length, and strictly monotonically increasing. Throws otherwise.
 */
export function mapParagraphsToSegments(
  segments: ParsedSegment[],
  paragraphs: TranscriptParagraph[],
): ParsedSegment[] {
  const out: ParsedSegment[] = segments.map(s => ({ ...s, paragraph_breaks: [] }))
  const cursors = new Array<number>(out.length).fill(0)

  for (const p of paragraphs) {
    const segIndex = out.findIndex(s => s.start_ms <= p.start && p.start <= s.end_ms)
    if (segIndex === -1) {
      log.warn('Paragraph timestamp outside all segment ranges', {
        paragraphStart: p.start,
        paragraphTextSample: p.text.slice(0, 40),
      })
      continue
    }

    const segment = out[segIndex]
    const offset = segment.text.indexOf(p.text, cursors[segIndex])
    if (offset === -1) {
      log.warn('Paragraph text not found in segment text', {
        segmentPosition: segment.position,
        paragraphTextSample: p.text.slice(0, 40),
      })
      continue
    }

    if (offset > 0) {
      segment.paragraph_breaks.push(offset)
    }
    cursors[segIndex] = offset + p.text.length
  }

  for (const s of out) {
    let last = 0
    for (const b of s.paragraph_breaks) {
      if (b <= 0 || b >= s.text.length) {
        throw new Error(
          `mapParagraphsToSegments: break ${b} out of range for segment text length ${s.text.length} (position ${s.position})`,
        )
      }
      if (b <= last) {
        throw new Error(
          `mapParagraphsToSegments: non-monotonic break ${b} after ${last} (position ${s.position})`,
        )
      }
      last = b
    }
  }

  return out
}

/** Parse the raw AssemblyAI webhook body into typed segments. */
export function parseWebhookBody(body: Record<string, unknown>): ParsedWebhook {
  if (body.status === 'error') {
    throw new Error(`AssemblyAI error: ${body.error ?? 'unknown'}`)
  }

  const utterances = (body.utterances as Array<{
    speaker: string
    text: string
    start: number
    end: number
  }>) ?? []

  const segments: ParsedSegment[] = utterances.map((u, i) => ({
    speaker: u.speaker,
    text: u.text,
    start_ms: u.start,
    end_ms: u.end,
    position: i,
    paragraph_breaks: [],
  }))

  const uniqueSpeakers = new Set(segments.map(s => s.speaker))

  return { speakerCount: uniqueSpeakers.size, segments }
}
