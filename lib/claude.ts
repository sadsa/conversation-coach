// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday Argentine speech (type: "naturalness")
3. Strengths — things the speaker did well, especially correct use of voseo, lunfardo, or natural Argentine expressions (type: "strength")

For each finding:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar", "naturalness", or "strength"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within that turn's text
- "correction": the improved version (null for strengths)
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

Respond ONLY with a JSON array. No other text.`

export interface UserTurn {
  id: string
  text: string
}

export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness' | 'strength'
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
}

export async function analyseUserTurns(turns: UserTurn[]): Promise<ClaudeAnnotation[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userContent = turns
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
  return JSON.parse(text) as ClaudeAnnotation[]
}
