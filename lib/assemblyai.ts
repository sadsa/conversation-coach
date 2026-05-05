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
