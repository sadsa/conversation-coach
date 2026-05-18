// app/debug/transcribe-compare/page.tsx
//
// Side-by-side STT comparison page used to evaluate input transcription
// quality across providers for the practice voice surface. Tees one mic
// stream into Gemini Live (our current source for `inputTranscription`)
// AND AssemblyAI Universal-3 Pro Streaming, displays both transcripts as
// they arrive. Investigation-only — not linked from any production nav.
//
// Reached by typing the URL directly. Auth-gated like the rest of the app.

import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { TranscribeCompareClient } from '@/components/TranscribeCompareClient'

export default async function TranscribeComparePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  const targetLanguage = (user.targetLanguage as 'es-AR' | 'en-NZ' | null) ?? 'es-AR'
  return <TranscribeCompareClient initialTargetLanguage={targetLanguage} />
}
