// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

const SYSTEM_PROMPT_ES_AR = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday Argentine speech (type: "naturalness")

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
- "flashcard_front": An invented English sentence that correctly expresses the same meaning as the practice phrase. The correct English equivalent phrase is wrapped in [[double brackets]]. Example: "I [[went]] to the market yesterday."
- "flashcard_back": The equivalent Spanish sentence using the correct form, wrapped in [[double brackets]]. Example: "[[Fui]] al mercado ayer."
- "flashcard_note": 1–2 sentences (in English) explaining why the original was wrong or unnatural from a Rioplatense register perspective. Be concise.
- "importance_score": integer 1–3 rating of how important this correction is for sounding natural in Rioplatense Spanish:
  - 3: phrase is very common in everyday speech; the original would sound immediately wrong or unnatural to a native speaker
  - 2: moderately common; noticeable but not jarring to a native
  - 1: rare phrasing or minor slip; most natives would not notice or care
- "importance_note": one English sentence explaining the score, covering how common the phrase is, how noticeable the error is, and how much it affects sounding like a native

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

Quality guidelines — follow these strictly:
- **Skip self-corrections**: if the speaker corrects their own error within the same turn (e.g. "las holandesas, holandeses"), do NOT annotate it. Only flag errors that remain uncorrected.
- **De-duplicate basic voseo slips**: do NOT annotate simple tuteo-to-voseo substitutions (tienes→tenés, quieres→querés, tienes→tenés, etc.) unless the same speaker makes this substitution 3 or more times in the session — in that case flag at most ONE representative example and note it is a recurring pattern. Reserve verb-conjugation annotations for non-obvious errors: wrong reflexive construction, leísmo, incorrect verb choice for the context, mood errors, etc.
- **Favour quality over quantity**: prefer fewer, higher-value annotations. An annotation is high-value if understanding the correction closes a genuine knowledge gap. Skip errors that are obvious one-off slips the speaker almost certainly already knows.

For the title:
- Summarise the conversation topic in 5 words or fewer using natural Spanish/English mix (e.g. "Football con Kevin", "Planificando el fin de semana").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title (e.g. "WhatsApp: Football con Kevin").
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note", "importance_score", "importance_note" }] }. No other text.`

const SYSTEM_PROMPT_EN_NZ = `You are an expert English language coach specialising in New Zealand English. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday New Zealand English (type: "naturalness")

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation in Spanish (Rioplatense register), tuned to New Zealand English conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
  Note: most grammar errors in English will fall under "verb-conjugation", "tense-selection", or "word-order". The Spanish-specific categories (gender-agreement, ser-estar, por-para, subjunctive) are unlikely to apply; use "other" if nothing fits.
- "flashcard_front": An invented Spanish sentence (in everyday Rioplatense register) that correctly expresses the same meaning as the practice phrase. The correct Spanish equivalent phrase is wrapped in [[double brackets]]. Example: "Ayer [[fui]] al mercado."
- "flashcard_back": The equivalent NZ English sentence using the correct form, wrapped in [[double brackets]]. Example: "Yesterday I [[went]] to the shops."
- "flashcard_note": 1–2 sentences (in Spanish, Rioplatense register) explaining why the original was wrong or unnatural from a New Zealand English perspective. Be concise.
- "importance_score": integer 1–3 rating of how important this correction is for sounding natural in New Zealand English:
  - 3: phrase is very common in everyday NZ speech; the original would sound immediately wrong or unnatural to a native speaker
  - 2: moderately common; noticeable but not jarring to a native
  - 1: rare phrasing or minor slip; most NZ speakers would not notice or care
- "importance_note": one sentence in Spanish (Rioplatense register) explaining the score, covering how common the phrase is, how noticeable the error is, and how much it affects sounding like a native

Be tuned to New Zealand English: use NZ spelling (colour, organise, programme), NZ vocabulary and idioms, and everyday NZ register. Note that NZ English tends to be informal and direct.

For the title:
- Summarise the conversation topic in 5 words or fewer in natural English (e.g. "Football with Kevin", "Planning the weekend").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title.
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note", "importance_score", "importance_note" }] }. No other text.`

const PROMPTS: Record<TargetLanguage, string> = {
  'es-AR': SYSTEM_PROMPT_ES_AR,
  'en-NZ': SYSTEM_PROMPT_EN_NZ,
}

export interface UserTurn {
  id: string
  text: string
}

export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness'
  sub_category: string   // validated downstream in pipeline.ts
  original: string
  start_char: number
  end_char: number
  correction: string
  explanation: string
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
  importance_score: number | null
  importance_note: string | null
}

export async function analyseUserTurns(
  turns: UserTurn[],
  originalFilename: string | null,
  sessionId?: string,
  targetLanguage: TargetLanguage = 'es-AR',
): Promise<{ title: string; annotations: ClaudeAnnotation[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const filenamePrefix = originalFilename ? `Original filename: ${originalFilename}\n\n` : ''
  const userContent = filenamePrefix + turns
    .map(t => `[ID: ${t.id}]\n${t.text}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: PROMPTS[targetLanguage],
    messages: [{ role: 'user', content: userContent }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated (max_tokens reached). The conversation may be too long to analyse in one pass.')
  }

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  log.info('Claude raw response received', { sessionId, preview: text.slice(0, 500) })

  const parsed = JSON.parse(text) as { title: string; annotations: ClaudeAnnotation[] }
  return {
    title: parsed.title?.trim() || 'Untitled',
    annotations: (parsed.annotations ?? []).map(a => {
      // Validate importance_score: must be a finite number in range 1–3
      let validatedScore: number | null = null
      if (a.importance_score != null) {
        const score = Number(a.importance_score)
        if (Number.isFinite(score) && score >= 1 && score <= 3) {
          validatedScore = score
        }
      }
      return {
        ...a,
        flashcard_front: a.flashcard_front ?? null,
        flashcard_back: a.flashcard_back ?? null,
        flashcard_note: a.flashcard_note ?? null,
        importance_score: validatedScore,
        importance_note: a.importance_note ?? null,
      }
    }),
  }
}