// lib/persona.ts
//
// Generates a fresh conversation persona for the Practice page's "Pick up a
// call" mode. Each call gets a Claude-generated character with:
//
//   - name           : first name only (currently for logging / future caller-ID)
//   - voiceName      : one of ~15 curated Gemini Live voices, chosen to match vibe
//   - opener         : Spanish (or English) opening line the agent speaks first
//   - systemPromptAddendum : situation + character description, appended to base prompt
//
// Voice matters as much as words. Calm voice saying frustrated words = uncanny
// valley. The catalog below pairs each voice with its "vibe" tag from Google's
// docs so Claude can pick the right voice for the emotional cast of the persona.
//
// Tone is "anything goes" — most personas grounded (vecino, kiosquero, ex-compañera
// de tango), occasional absurd (time-travelling milonguero). Per design decision.

import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

/** Subset of Gemini Live's 30 prebuilt voices, curated for character variety.
 *  Each entry's `vibe` is the official Google descriptor — Claude uses it to
 *  pick a voice that matches the persona's emotional cast. */
export const VOICE_CATALOG: Array<{ name: string; vibe: string }> = [
  { name: 'Fenrir',         vibe: 'Excitable — frustrated, urgent, agitated callers' },
  { name: 'Pulcherrima',    vibe: 'Forward — assertive, gossipy, outraged' },
  { name: 'Vindemiatrix',   vibe: 'Gentle — soft-spoken, warm, older' },
  { name: 'Gacrux',         vibe: 'Mature — older, settled, weighed down by life' },
  { name: 'Algenib',        vibe: 'Gravelly — older men, character voices' },
  { name: 'Leda',           vibe: 'Youthful — children, young adults' },
  { name: 'Enceladus',      vibe: 'Breathy — conspiratorial, intimate, sharing secrets' },
  { name: 'Alnilam',        vibe: 'Firm — confident, salesy, official' },
  { name: 'Achernar',       vibe: 'Soft — uncertain, bewildered, shy' },
  { name: 'Zubenelgenubi',  vibe: 'Casual — laid-back, easygoing friend' },
  { name: 'Achird',         vibe: 'Friendly — warm, approachable' },
  { name: 'Sulafat',        vibe: 'Warm — kindhearted, caring' },
  { name: 'Sadachbia',      vibe: 'Lively — energetic, animated' },
  { name: 'Charon',         vibe: 'Informative — knowledgeable, official' },
  { name: 'Aoede',          vibe: 'Breezy — light, neutral, cheerful' },
]

const VOICE_NAMES = new Set(VOICE_CATALOG.map(v => v.name))
const FALLBACK_VOICE = 'Zubenelgenubi' // casual, neutral safety net

export interface Persona {
  /** First name only — reserved for future caller-ID UI. */
  name: string
  /** Gemini Live voice — one of VOICE_CATALOG.name. */
  voiceName: string
  /** Exact opening line the agent speaks first. */
  opener: string
  /** Character + situation block appended to the practice system prompt. */
  systemPromptAddendum: string
}

const VOICE_GUIDE = VOICE_CATALOG.map(v => `- ${v.name}: ${v.vibe}`).join('\n')

const SYSTEM_PROMPT_ES_AR = `You design fresh, varied characters who phone a Spanish learner out of the blue for a 5-minute conversation practice. Output is JSON only — no prose.

The character could be: a neighbour, a friend, a stranger with a wrong number, a kiosquero settling a debt, a gossipy ex-compañera de tango, a telemarketer, a niece who needs help, a confused tourist, an excited barber sharing news. Most are grounded everyday Argentine life. About 1 in 8 can be playfully absurd (time-traveller, parrot's owner, somebody calling from a movie set).

Vary along these axes EVERY call — never repeat a previous persona's combination:
- Age and gender (mix it up: 8-year-old girl, 70-year-old señor, 28-year-old programadora, 45-year-old vendedor ambulante)
- Reason for calling (gossip, ask favour, settle plan, wrong number, share news, sell something, vent, ask advice)
- Emotional state (excited, sleepy, gossipy, frustrated, distracted, in a hurry, conspiratorial)
- Where they're calling from (colectivo, cocina, kiosco, plaza, aeropuerto, oficina)
- Hook (a strange thing they just saw, a plan that fell through, a favour with a twist, news that needs a reaction)

OUTPUT JSON shape:
{
  "name": "<first name only, no surname>",
  "voiceName": "<exact name from voice catalog below>",
  "opener": "<single Spanish line, 1–3 sentences, must introduce who they are by name AND give a reason for the call. Rioplatense voseo. The learner should be able to react with a short Spanish phrase.>",
  "systemPromptAddendum": "<2–4 lines in Spanish (voseo) describing: who you are (name, age, situation), why you're calling, your emotional state, what direction the conversation might go. Written as instructions to the model in second person: 'Sos X. Llamás porque Y. Estás Z.'>"
}

VOICE CATALOG — pick the one whose vibe matches the persona's emotional cast:
${VOICE_GUIDE}

CRITICAL:
- The opener must work as the model's VERY FIRST spoken line — no prior context. It must contain a greeting, the caller's name, and a hook the learner can respond to.
- The opener must end with either a question or a clear conversational beat the learner can pick up.
- Keep the opener short — 1–3 sentences max. The learner needs space to respond.
- Use Rioplatense voseo throughout (sos, tenés, hablás, podés). Lunfardo welcome but not forced.
- systemPromptAddendum should set tone EXPLICITLY: "Hablás con tono frustrado", "Hablás suave y bajito", "Hablás rápido y entusiasmada" — voice choice alone is not enough.

Respond ONLY with the JSON object. No explanation.`

const SYSTEM_PROMPT_EN_NZ = `You design fresh, varied characters who phone an English learner out of the blue for a 5-minute conversation practice. Output is JSON only — no prose.

The character could be: a neighbour, a friend, a stranger with a wrong number, a shopkeeper chasing payment, a chatty mate from the tramping club, a telemarketer, a niece who needs help, a confused tourist, an excited builder sharing news. Most are grounded everyday New Zealand life. About 1 in 8 can be playfully absurd (time-traveller, parrot's owner, somebody calling from a film set).

Vary along these axes EVERY call — never repeat a previous persona's combination:
- Age and gender
- Reason for calling (gossip, ask favour, settle plan, wrong number, share news, sell something, vent, ask advice)
- Emotional state (excited, sleepy, gossipy, frustrated, distracted, in a hurry, conspiratorial)
- Where they're calling from (bus, kitchen, dairy, beach, airport, office)
- Hook (a strange thing they just saw, a plan that fell through, a favour with a twist, news that needs a reaction)

OUTPUT JSON shape:
{
  "name": "<first name only, no surname>",
  "voiceName": "<exact name from voice catalog below>",
  "opener": "<single English line, 1–3 sentences, must introduce who they are by name AND give a reason for the call. Casual NZ register. The learner should be able to react with a short English phrase.>",
  "systemPromptAddendum": "<2–4 lines in English describing: who you are (name, age, situation), why you're calling, your emotional state, what direction the conversation might go. Written as instructions to the model in second person: 'You are X. You're calling because Y. You sound Z.'>"
}

VOICE CATALOG — pick the one whose vibe matches the persona's emotional cast:
${VOICE_GUIDE}

CRITICAL:
- The opener must work as the model's VERY FIRST spoken line — no prior context.
- The opener must end with either a question or a clear conversational beat the learner can pick up.
- Keep the opener short — 1–3 sentences max.
- Casual NZ register: "yeah nah", "mate", "eh" sparingly and only when it fits the character.
- systemPromptAddendum should set tone EXPLICITLY: "You speak with frustration", "You speak softly", "You speak quickly and energetically" — voice choice alone is not enough.

Respond ONLY with the JSON object. No explanation.`

const PROMPTS: Record<TargetLanguage, string> = {
  'es-AR': SYSTEM_PROMPT_ES_AR,
  'en-NZ': SYSTEM_PROMPT_EN_NZ,
}

/**
 * Build the combined system prompt for a persona call:
 * base practice rules + persona-specific situation block + opener trigger.
 *
 * The trigger pattern: we send "__START_CALL__" via clientContent after the
 * Gemini Live setup completes. clientContent text input does NOT pass through
 * STT (it bypasses inputTranscription) so it never shows up as a user bubble.
 * The system prompt instructs the model to deliver the opener verbatim on
 * receiving the trigger.
 */
export function buildPersonaSystemPrompt(
  basePrompt: string,
  persona: Persona,
): string {
  return `${basePrompt}

—— YOUR CHARACTER FOR THIS CALL ——
${persona.systemPromptAddendum}

—— OPENING THE CALL ——
You will receive a single text message "__START_CALL__" from the user. That is your cue to begin the call. Speak this exact line FIRST as your spoken response:

"${persona.opener}"

Do NOT mention the trigger. Do NOT translate or explain the opener. Just say it as your character would, then wait for the learner to respond and continue the conversation in character.`
}

/**
 * Calls Claude to generate a fresh persona. Cheap + fast — uses Haiku.
 * Validates voiceName against the catalog and falls back if Claude
 * hallucinates one outside the list.
 */
export async function generatePersona(targetLanguage: TargetLanguage): Promise<Persona> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    system: PROMPTS[targetLanguage],
    messages: [{ role: 'user', content: 'Generate one persona now.' }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  let parsed: Partial<Persona>
  try {
    parsed = JSON.parse(text) as Partial<Persona>
  } catch {
    log.warn('Persona generator returned non-JSON, using fallback', { preview: text.slice(0, 200) })
    return fallbackPersona(targetLanguage)
  }

  const name = (parsed.name ?? '').trim()
  const opener = (parsed.opener ?? '').trim()
  const systemPromptAddendum = (parsed.systemPromptAddendum ?? '').trim()
  const voiceName = (parsed.voiceName ?? '').trim()

  if (!name || !opener || !systemPromptAddendum) {
    log.warn('Persona generator missing required fields, using fallback', { parsed })
    return fallbackPersona(targetLanguage)
  }

  const validVoice = VOICE_NAMES.has(voiceName) ? voiceName : FALLBACK_VOICE
  if (validVoice !== voiceName) {
    log.warn('Persona generator picked invalid voice, falling back', { picked: voiceName })
  }

  return { name, voiceName: validVoice, opener, systemPromptAddendum }
}

/** Hand-written fallback used when Claude returns garbage. Rare. */
function fallbackPersona(targetLanguage: TargetLanguage): Persona {
  if (targetLanguage === 'en-NZ') {
    return {
      name: 'Sam',
      voiceName: 'Zubenelgenubi',
      opener: "Hey, it's Sam from next door. The cat's gone up the tree again — got a minute to give us a hand?",
      systemPromptAddendum:
        "You are Sam, a friendly neighbour in your 30s. You're calling because your cat keeps climbing the tree out front and you can't reach it. You sound casual but slightly stressed. The conversation can drift to weekend plans, the weather, or other neighbourhood gossip.",
    }
  }
  return {
    name: 'Mateo',
    voiceName: 'Zubenelgenubi',
    opener: 'Hola, ¿cómo va? Soy Mateo, te llamo porque ando un poco aburrido y quería charlar un rato. ¿Vos qué andás haciendo?',
    systemPromptAddendum:
      'Sos Mateo, treintañero, programador en Buenos Aires. Llamás porque estás aburrido un sábado a la tarde y querés charlar. Hablás relajado, con tono amistoso y curioso. La conversación puede ir hacia trabajo, planes del finde, o cualquier cosa que el otro proponga.',
  }
}
