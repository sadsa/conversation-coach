// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

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

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

For the title:
- Summarise the conversation topic in 5 words or fewer using natural Spanish/English mix (e.g. "Football con Kevin", "Planificando el fin de semana").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title (e.g. "WhatsApp: Football con Kevin").
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation" }] }. No other text.`

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
}

export async function analyseUserTurns(
  turns: UserTurn[],
  originalFilename: string | null,
): Promise<{ title: string; annotations: ClaudeAnnotation[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const filenamePrefix = originalFilename ? `Original filename: ${originalFilename}\n\n` : ''
  const userContent = filenamePrefix + turns
    .map(t => `[ID: ${t.id}]\n${t.text}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  console.log('[claude] raw response:', text.slice(0, 500))

  const parsed = JSON.parse(text) as { title: string; annotations: ClaudeAnnotation[] }
  return {
    title: parsed.title?.trim() || 'Untitled',
    annotations: parsed.annotations ?? [],
  }
}
