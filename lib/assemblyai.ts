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

/** Submit an audio file URL for transcription with speaker diarization. */
export async function createJob(audioUrl: string): Promise<string> {
  const client = getClient()
  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
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
