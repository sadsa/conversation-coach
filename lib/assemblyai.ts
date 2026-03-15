// lib/assemblyai.ts
import { AssemblyAI } from 'assemblyai'

function getClient() {
  return new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
}

export interface ParsedSegment {
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
}

export interface ParsedWebhook {
  speakerCount: number
  segments: ParsedSegment[]
}

/** Base URL of the app (must be reachable by AssemblyAI for webhooks). Use APP_URL or Vercel sets VERCEL_URL. */
function getWebhookBaseUrl(): string {
  const appUrl = process.env.APP_URL
  if (appUrl) return appUrl.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  throw new Error('Set APP_URL (e.g. https://your-app.vercel.app) so AssemblyAI can send webhooks. For local dev use a tunnel (e.g. ngrok) and set APP_URL to its URL.')
}

/** Header AssemblyAI sends with webhook requests when webhook_auth_header_* is set. */
export const WEBHOOK_AUTH_HEADER_NAME = 'X-Webhook-Secret'

/** Submit an audio file URL for transcription with speaker diarization. */
export async function createJob(audioUrl: string): Promise<string> {
  const client = getClient()
  const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/assemblyai`
  const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET!
  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    webhook_url: webhookUrl,
    webhook_auth_header_name: WEBHOOK_AUTH_HEADER_NAME,
    webhook_auth_header_value: webhookSecret,
    speech_models: ['universal-3-pro', 'universal-2'],
    speaker_labels: true,
    speakers_expected: 2,
    language_code: 'es',
  })
  return transcript.id
}

/** Attempt to cancel a job. Swallows errors (best-effort). */
export async function cancelJob(jobId: string): Promise<void> {
  try {
    const client = getClient()
    await client.transcripts.delete(jobId)
  } catch {
    console.error(`AssemblyAI cancel failed for job ${jobId}`)
  }
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
    speaker: u.speaker as 'A' | 'B',
    text: u.text,
    start_ms: u.start,
    end_ms: u.end,
    position: i,
  }))

  const uniqueSpeakers = new Set(segments.map(s => s.speaker))

  return { speakerCount: uniqueSpeakers.size, segments }
}
