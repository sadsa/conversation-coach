// lib/wild-capture.ts
import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

const ENRICH_PROMPT_ES_AR = `You are an expert Argentine Spanish language coach.
Given a Spanish phrase a learner heard in real life and the context in which it was used,
generate flashcard fields to help them study it.

Respond ONLY with a JSON object in this exact shape:
{
  "flashcard_front": "An invented English sentence that uses the phrase in context, with the key phrase wrapped in [[double brackets]]. Example: \\"He said [[che, ¿qué onda?]] when we arrived.\\"",
  "flashcard_back": "The equivalent Spanish sentence using the phrase, wrapped in [[double brackets]]. Example: \\"Dijo [[che, ¿qué onda?]] cuando llegamos.\\"",
  "flashcard_note": "1-2 sentences in English explaining the phrase from a Rioplatense register perspective."
}

No other text. No explanations outside the JSON.`

const ENRICH_PROMPT_EN_NZ = `You are an expert New Zealand English language coach.
Given an English phrase a learner heard in real life and the context in which it was used,
generate flashcard fields to help them study it.

Respond ONLY with a JSON object in this exact shape:
{
  "flashcard_front": "An invented Spanish (Rioplatense) sentence that expresses the same meaning, with the key phrase wrapped in [[double brackets]]. Example: \\"[[Nos vemos]] después del trabajo.\\"",
  "flashcard_back": "The NZ English sentence using the phrase, wrapped in [[double brackets]]. Example: \\"[[Catch you later]] after work.\\"",
  "flashcard_note": "1-2 sentences in Spanish (Rioplatense) explaining the phrase from a New Zealand English perspective."
}

No other text. No explanations outside the JSON.`

const ENRICH_PROMPTS: Record<TargetLanguage, string> = {
  'es-AR': ENRICH_PROMPT_ES_AR,
  'en-NZ': ENRICH_PROMPT_EN_NZ,
}

export interface EnrichedFields {
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
}

export async function enrichWildCapture(
  phrase: string,
  context: string,
  targetLanguage: TargetLanguage = 'es-AR',
): Promise<EnrichedFields> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userContent = `Phrase: ${phrase}\nContext: ${context}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: ENRICH_PROMPTS[targetLanguage],
      messages: [{ role: 'user', content: userContent }],
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

    const parsed = JSON.parse(text) as {
      flashcard_front?: string
      flashcard_back?: string
      flashcard_note?: string
    }

    return {
      flashcard_front: parsed.flashcard_front ?? null,
      flashcard_back: parsed.flashcard_back ?? null,
      flashcard_note: parsed.flashcard_note ?? null,
    }
  } catch (err) {
    log.warn('Wild capture enrichment failed', { phrase, error: (err as Error).message })
    return { flashcard_front: null, flashcard_back: null, flashcard_note: null }
  }
}
