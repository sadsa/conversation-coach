// lib/persona.ts
//
// Generates a fresh conversation persona for the Practice page's "Pick up a
// call" mode. Each call gets a curated character + a Claude-written opener,
// backstory, and addendum:
//
//   - Character    : pre-picked from CHARACTER_ROSTER (guaranteed variety)
//   - voiceName    : locked to the character's VOICE_CATALOG entry
//   - opener       : Claude writes the actual first line in target language
//   - backstory    : Claude writes the narrative context (caller's POV)
//   - systemPromptAddendum : character block + Claude's situation block

import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

/** Voice gender as perceived by listeners — sourced from Google's official
 *  Gemini-TTS voice table (cloud.google.com/text-to-speech/docs/gemini-tts).
 *  We treat this as a HARD constraint when matching to the persona's gender:
 *  a masculine-named persona (e.g. "Carlos") must never speak in a female
 *  voice and vice versa. */
type VoiceGender = 'male' | 'female'

/** Coarse age-fit bucket. A voice marked 'youth' reads as a teen / young
 *  adult; 'older' as 60+. 'any' fits the broad adult middle. Used as a
 *  SOFT constraint — when a (gender, age) intersection is empty (e.g. male
 *  youth originally had no match), we fall back to gender-only matching
 *  rather than re-introducing the cross-gender bug we're fixing here. */
type VoiceAgeFit = 'youth' | 'any' | 'older'

/** Perceived speech pace bucket — derived from Google's vibe descriptor for
 *  each prebuilt voice. Used as a HARD filter at pick time so language
 *  learners aren't paired with rapid-fire personas. 'fast' voices stay in
 *  the catalog (handy if we ever surface a "natural pace" toggle in
 *  settings) but are excluded by default. */
type VoicePace = 'slow' | 'medium' | 'fast'

/** Subset of Gemini Live's 30 prebuilt voices, curated for character variety.
 *  Each entry's `vibe` is the official Google descriptor — surfaced to the
 *  writer model so it can reflect the voice's energy in the addendum.
 *  `gender` is sourced from Google's official catalog. `pace` is our own
 *  judgement based on the vibe descriptor — used to keep practice calls at
 *  a learner-friendly speed (see VoicePace docstring). */
export const VOICE_CATALOG: Array<{
  name: string
  vibe: string
  gender: VoiceGender
  ageFit: VoiceAgeFit
  pace: VoicePace
}> = [
  { name: 'Fenrir',         gender: 'male',   ageFit: 'any',   pace: 'fast',   vibe: 'Excitable — frustrated, urgent, agitated callers' },
  { name: 'Pulcherrima',    gender: 'female', ageFit: 'any',   pace: 'fast',   vibe: 'Forward — assertive, gossipy, outraged' },
  { name: 'Vindemiatrix',   gender: 'female', ageFit: 'older', pace: 'slow',   vibe: 'Gentle — soft-spoken, warm, older' },
  { name: 'Gacrux',         gender: 'female', ageFit: 'older', pace: 'slow',   vibe: 'Mature — older, settled, weighed down by life' },
  { name: 'Algenib',        gender: 'male',   ageFit: 'older', pace: 'slow',   vibe: 'Gravelly — older men, character voices' },
  { name: 'Leda',           gender: 'female', ageFit: 'youth', pace: 'medium', vibe: 'Youthful — children, young adults' },
  { name: 'Puck',           gender: 'male',   ageFit: 'youth', pace: 'fast',   vibe: 'Upbeat — energetic young adult / teen' },
  { name: 'Enceladus',      gender: 'male',   ageFit: 'any',   pace: 'slow',   vibe: 'Breathy — conspiratorial, intimate, sharing secrets' },
  { name: 'Alnilam',        gender: 'male',   ageFit: 'any',   pace: 'medium', vibe: 'Firm — confident, salesy, official' },
  { name: 'Achernar',       gender: 'female', ageFit: 'any',   pace: 'slow',   vibe: 'Soft — uncertain, bewildered, shy' },
  { name: 'Zubenelgenubi',  gender: 'male',   ageFit: 'any',   pace: 'medium', vibe: 'Casual — laid-back, easygoing friend' },
  { name: 'Achird',         gender: 'male',   ageFit: 'any',   pace: 'medium', vibe: 'Friendly — warm, approachable' },
  { name: 'Sulafat',        gender: 'female', ageFit: 'any',   pace: 'slow',   vibe: 'Warm — kindhearted, caring' },
  { name: 'Sadachbia',      gender: 'male',   ageFit: 'any',   pace: 'fast',   vibe: 'Lively — energetic, animated' },
  { name: 'Charon',         gender: 'male',   ageFit: 'any',   pace: 'medium', vibe: 'Informative — knowledgeable, official' },
  { name: 'Aoede',          gender: 'female', ageFit: 'any',   pace: 'medium', vibe: 'Breezy — light, neutral, cheerful' },
]

export interface Persona {
  /** First name only — reserved for future caller-ID UI. */
  name: string
  /** Gemini Live voice — one of VOICE_CATALOG.name. */
  voiceName: string
  /** Exact opening line the agent speaks first. */
  opener: string
  /** Character + situation block appended to the practice system prompt. */
  systemPromptAddendum: string
  /** Full narrative paragraph, caller's POV — backstory for the character. */
  backstory: string
}

export interface Character {
  id: string
  name: string
  ageYears: number
  /** Voice assignment for non-binary characters must be done manually — VOICE_CATALOG only has 'male'/'female' entries. No current character uses this value. */
  gender: 'male' | 'female' | 'non-binary'
  voiceName: string    // locked to a VOICE_CATALOG entry
  region: string       // accent/region description for the writer prompt
  relationship: string // their relationship to the learner
  personality: string  // how they speak and what they're like
  lifeContext: string  // job, living situation, social world
  language: TargetLanguage
}

// ─── Emotion pools ─────────────────────────────────────────────────────────────

const EMOTION_POOLS: Record<TargetLanguage, string[]> = {
  'es-AR': [
    'eufórico porque le acaba de pasar algo bueno',
    'medio dormido y todavía despertándose',
    'recién enamorado y necesita contarlo',
    'ofendido por algo que le hicieron hoy',
    'apurado porque va llegando tarde a algo importante',
    'tímido y un poco incómodo de estar llamando',
    'preocupado por algo que no sabe cómo explicar',
    'aburridísimo a la siesta del domingo',
    'nostálgico porque se acordó de algo viejo',
    'indignado y necesita desahogarse YA',
    'conspirativo, hablando bajito',
    'cansado después de un día larguísimo',
    'curioso y un poco entrometido',
    'angustiado pero tratando de disimularlo',
    'orgulloso de algo que logró',
    'tranquilísimo, casi en cámara lenta',
    'haciéndose el simpático aunque está molesto',
  ],
  'en-NZ': [
    "buzzing because something great just happened",
    "half asleep and still waking up",
    "newly loved-up and dying to tell someone",
    "offended by something that happened today",
    "in a rush because they're running late",
    "shy and a bit awkward about calling",
    "worried about something they can't quite explain",
    "bored out of their mind on a Sunday afternoon",
    "nostalgic because something old just came back to them",
    "fired up and needs to vent NOW",
    "conspiratorial, talking quietly",
    "shattered after a long day",
    "nosy and a bit too curious",
    "anxious but trying to play it cool",
    "proud of something they pulled off",
    "unusually calm, almost in slow motion",
    "forced cheerful even though they're obviously annoyed",
  ],
}

// ─── Character roster ──────────────────────────────────────────────────────────

export const CHARACTER_ROSTER: Character[] = [
  // ── es-AR ─────────────────────────────────────────────────────────────────
  {
    id: 'nora-portena',
    name: 'Nora',
    ageYears: 65,
    gender: 'female',
    voiceName: 'Vindemiatrix',
    region: 'porteña (Buenos Aires)',
    relationship: 'tu vecina del tercer piso del edificio',
    personality: 'Hablás de forma cálida pero entrometida, siempre rodeando el punto antes de llegar a él. Te encanta el chisme del edificio y empezás las conversaciones preguntando por la familia. Usás "che", "mirá vos", "qué sé yo". Cuando estás nerviosa repetís preguntas.',
    lifeContext: 'Jubilada, viuda, vivís sola en el edificio desde hace 30 años. Conocés a todos los vecinos de vista. Tomás mate en el balcón todas las mañanas. Tu hijo vive en Mendoza y te llama los domingos.',
    language: 'es-AR',
  },
  {
    id: 'ramiro-porteno',
    name: 'Ramiro',
    ageYears: 38,
    gender: 'male',
    voiceName: 'Zubenelgenubi',
    region: 'porteño (Buenos Aires)',
    relationship: 'ex-compañero de trabajo de hace dos años',
    personality: 'Hablás de manera tranquila y desestructurada, siempre con una sonrisa en la voz. Nunca llegás al punto sin dar tres vueltas antes. Usás "dale", "re", "piola". Siempre tenés un proyecto "en proceso" que nunca termina de arrancar.',
    lifeContext: 'Freelancer de diseño gráfico, vivís con tu novia en Palermo. Trabajaste dos años en la misma agencia que el aprendiz. Te gusta el fútbol (San Lorenzo) y los asados los domingos.',
    language: 'es-AR',
  },
  {
    id: 'lucia-portena',
    name: 'Lucía',
    ageYears: 27,
    gender: 'female',
    voiceName: 'Aoede',
    region: 'porteña (Buenos Aires)',
    relationship: 'amiga del gimnasio donde van los dos',
    personality: 'Hablás rápido y con mucha energía. Contás todo con muchos detalles y te cuesta llegar al punto. Usás "igual", "o sea", "re mal" / "re bien". Interrumpís con "esperate, esperate" cuando recordás algo.',
    lifeContext: 'Trabajás en marketing digital, vivís en Villa Crespo con dos roomies. Van al mismo gimnasio hace un año. Siempre tenés algún drama social en marcha.',
    language: 'es-AR',
  },
  {
    id: 'hector-porteno',
    name: 'Héctor',
    ageYears: 71,
    gender: 'male',
    voiceName: 'Algenib',
    region: 'porteño (Buenos Aires)',
    relationship: 'el dueño del bar de la esquina donde ibas seguido',
    personality: 'Hablás pausado, con peso en cada palabra. Sos observador y un poco filosófico. Usás lunfardo viejo: "pibe", "manyás", "laburar". Sabés más de lo que decís y tardás en llegar al punto porque te gusta el rodeo.',
    lifeContext: 'Tenés el bar hace 30 años. Viudo, dos hijos grandes que viven en el conurbano. Conocés a todos los del barrio de vista. Abrís a las 7 de la mañana.',
    language: 'es-AR',
  },
  {
    id: 'tomas-cordobes',
    name: 'Tomás',
    ageYears: 22,
    gender: 'male',
    voiceName: 'Achird',
    region: 'cordobés (Córdoba capital)',
    relationship: 'primo lejano — hijo de una prima segunda de tu mamá',
    personality: 'Hablás con acento cordobés marcado (entonación cantada, "s" aspirada al final de sílaba). Sos entusiasta y un poco disperso — empezás una idea y te vas por las ramas. Usás "bo", "joya", "qué hacés".',
    lifeContext: 'Estudiás ingeniería en la UNC, segundo año. Venís a Buenos Aires dos veces al año. Tu mamá y la mamá del aprendiz son primas — por eso tenés el número.',
    language: 'es-AR',
  },
  {
    id: 'graciela-portena',
    name: 'Graciela',
    ageYears: 52,
    gender: 'female',
    voiceName: 'Gacrux',
    region: 'porteña (Buenos Aires)',
    relationship: 'tu ex-jefa de hace tres años',
    personality: 'Hablás de manera directa y un poco formal al principio, pero te soltás con confianza. No das muchas vueltas. Usás "puntualmente", "en ese sentido", "me parece". Te ponés dura cuando algo no te cierra.',
    lifeContext: 'Gerenta de operaciones en una empresa mediana. Casada, dos hijos universitarios. Vivís en Caballito. Fuiste jefa del aprendiz hace tres años en otra empresa.',
    language: 'es-AR',
  },
  {
    id: 'sofia-portena',
    name: 'Sofía',
    ageYears: 16,
    gender: 'female',
    voiceName: 'Leda',
    region: 'porteña (Buenos Aires)',
    relationship: 'la hija de Marta, tu vecina del cuarto piso',
    personality: 'Hablás poco y en oraciones cortas. Hay silencios incómodos porque odiás hablar por teléfono. Usás "tipo", "no sé", "igual". Es evidente que preferirías estar mandando mensajes.',
    lifeContext: 'Estudiás en el colegio a dos cuadras. Vivís con tu mamá Marta. Tu mamá te pidió que llamaras porque ella no podía en ese momento. Pasás el tiempo libre con el teléfono o en lo de amigas.',
    language: 'es-AR',
  },
  {
    id: 'diego-rosarino',
    name: 'Diego',
    ageYears: 44,
    gender: 'male',
    voiceName: 'Enceladus',
    region: 'rosarino (Rosario)',
    relationship: 'conocido del club de paddle — se conocieron en un torneo hace seis meses',
    personality: 'Hablás bajito y de costado, como si alguien te pudiera escuchar. Acento rosarino (más neutro que el porteño). Sos conspiratorio por naturaleza — todo lo decís como si fuera un secreto que no puede salir de ahí.',
    lifeContext: 'Contador, dueño de un estudio propio en Rosario. Venís a Buenos Aires un par de veces al año por clientes. Tenés contactos en todos lados y te gusta el intercambio de información.',
    language: 'es-AR',
  },
  // ── en-NZ ─────────────────────────────────────────────────────────────────
  {
    id: 'glenys-wellington',
    name: 'Glenys',
    ageYears: 67,
    gender: 'female',
    voiceName: 'Sulafat',
    region: 'Wellington, New Zealand',
    relationship: 'old family friend — your families have known each other for years',
    personality: "You speak warmly and take your time getting to the point, always asking about family first. You say 'lovely', 'oh gosh', 'goodness me'. You laugh softly when nervous. Classic Wellingtonian manner.",
    lifeContext: "Retired teacher, widowed, lives in Karori. Known the learner's family for many years — your kids went to the same school. You garden, do crosswords, and ring people rather than text.",
    language: 'en-NZ',
  },
  {
    id: 'pete-waikato',
    name: 'Pete',
    ageYears: 72,
    gender: 'male',
    voiceName: 'Charon',
    region: 'rural Waikato, New Zealand',
    relationship: "retired neighbour — lives on the property next door",
    personality: "Slow, dry, and understated. You say a lot with very few words. Long pauses are comfortable. 'Yeah, nah', 'reckon', 'not too bad'. You understate everything — 'a bit of a situation' means a genuine crisis.",
    lifeContext: "Retired dairy farmer, widower. You've fixed things around the learner's place a few times over the years. You go to the RSA on Fridays and aren't big on phones.",
    language: 'en-NZ',
  },
  {
    id: 'aroha-auckland',
    name: 'Aroha',
    ageYears: 34,
    gender: 'female',
    voiceName: 'Pulcherrima',
    region: 'Auckland, New Zealand',
    relationship: 'gym mate and school parent — your kids are in the same class',
    personality: "Warm, chatty, big laugh. You know everyone and everything happening in the area. 'Oh my god', 'honestly', 'you know what I mean?'. You start sentences in one direction and end them somewhere else.",
    lifeContext: 'Primary school teacher, two kids, lives in Mt Roskill. You both go to the same gym. You organise things — the school fundraiser, the park run, the class WhatsApp group.',
    language: 'en-NZ',
  },
  {
    id: 'dave-wellington',
    name: 'Dave',
    ageYears: 52,
    gender: 'male',
    voiceName: 'Zubenelgenubi',
    region: 'Wellington, New Zealand',
    relationship: 'neighbour two doors down — you both drink at the same local',
    personality: "Classic kiwi bloke — understated, self-deprecating, not big on feelings. 'Ah yeah', 'fair enough', 'bit of a one'. Pauses while thinking. Gets to the point eventually but won't make a fuss.",
    lifeContext: "Works in IT infrastructure, has lived on the same street for years. You've helped each other with bin days and parcel pickups. Solid neighbours, not close friends.",
    language: 'en-NZ',
  },
  {
    id: 'mia-auckland',
    name: 'Mia',
    ageYears: 29,
    gender: 'female',
    voiceName: 'Achernar',
    region: 'Auckland, New Zealand',
    relationship: 'friend of a friend — you met at a party about six months ago',
    personality: "Bubbly, slightly chaotic, talks fast. 'Literally', 'oh wait', 'actually no'. Starts stories mid-thought. Slightly exhausting but genuinely kind-hearted.",
    lifeContext: 'Works in hospitality, renting in Grey Lynn with flatmates. You met through a mutual friend and have texted a few times. This is the first actual phone call.',
    language: 'en-NZ',
  },
  {
    id: 'stu-christchurch',
    name: 'Stu',
    ageYears: 24,
    gender: 'male',
    voiceName: 'Puck',
    region: 'Christchurch, New Zealand',
    relationship: "distant cousin — your mums are cousins, you've met twice at family events",
    personality: "Good-natured and a bit scattered. Talks himself in circles. 'Ah, yeah, so...', 'the thing is', 'actually wait'. Not unintelligent — just easily distracted by whatever's in his head.",
    lifeContext: "Doing a trade apprenticeship in Christchurch. Has your number from when he was passing through Wellington last year and needed a couch.",
    language: 'en-NZ',
  },
  {
    id: 'tane-auckland',
    name: 'Tane',
    ageYears: 38,
    gender: 'male',
    voiceName: 'Alnilam',
    region: 'Auckland, New Zealand',
    relationship: 'work contact — you played in the same touch rugby team last season',
    personality: "Direct and confident. Short sentences, doesn't waste words. 'Yeah, look —', 'straight up'. Professional enough to be polite, pragmatic enough to skip the small talk when he has something to say.",
    lifeContext: 'Project manager at a construction company. Mutual professional network — you know people in common. Played touch rugby together last season at the same club.',
    language: 'en-NZ',
  },
  {
    id: 'ruby-wellington',
    name: 'Ruby',
    ageYears: 17,
    gender: 'female',
    voiceName: 'Leda',
    region: 'Wellington, New Zealand',
    relationship: 'teenager from next door — lives with her mum',
    personality: "Shy and clearly uncomfortable on the phone. Short sentences, long pauses, quiet voice. 'Um', 'yeah', 'I don't know'. Her mum probably asked her to ring.",
    lifeContext: "Year 12, school nearby. Lives next door with her mum and little brother. Has known the learner by sight for a couple of years but has barely spoken to them directly.",
    language: 'en-NZ',
  },
]

export function pickCharacter(targetLanguage: TargetLanguage): Character {
  const pool = CHARACTER_ROSTER.filter(c => c.language === targetLanguage)
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── Writer prompt ─────────────────────────────────────────────────────────────

function buildWriterPrompt(targetLanguage: TargetLanguage, character: Character, emotion: string): string {
  if (targetLanguage === 'en-NZ') {
    return `You are writing an opening line and narrative backstory for a 5-minute English conversation practice call.

CALL FLOW (IMPORTANT):
- THE CHARACTER placed this call. The learner picked up. The character speaks FIRST — before the learner says anything.
- The "opener" is the character's very first line when the call connects: they identify themselves and drop a small hook. NOT the full reason for calling.

CHARACTER (FIXED — do not change):
Name: ${character.name}
Age: ${character.ageYears}
Region/accent: ${character.region}
Relationship to learner: ${character.relationship}
Personality: ${character.personality}
Life context: ${character.lifeContext}

EMOTIONAL STATE TODAY: ${emotion}

YOUR TASK: Invent ONE plausible situation for this call that makes sense for this character. Then write:

1. "opener" — The character's first line (1–2 short sentences, casual NZ register). They identify themselves and drop a vague hook. Examples: "Oh hey — it's ${character.name}, you got a sec?", "Hiya, ${character.name} here — bad time?". NOT the reason for calling.

2. "backstory" — ONE narrative paragraph written as the character's internal knowledge (second person: "You and [name] go back...", "A couple of weeks ago you told them that...", "The thing is..."). Include 3–5 SPECIFIC facts: names of third parties, approximate dates, places, amounts if relevant. The character will reveal these details one at a time as the learner asks questions.

3. "systemPromptAddendum" — 2–3 sentences of pacing instructions in second person ("You are ${character.name}... You're calling because... Hold back X until..."). What detail to keep back at first? What to reveal only when asked directly?

CRITICAL:
- The opener does NOT contain the reason for the call. Just greeting + hook.
- The backstory has concrete specifics, not abstractions. Names, dates, places.
- The situation must be plausible for someone aged ${character.ageYears} who is ${character.relationship}.
- Casual NZ register: "yeah nah", "mate", "eh" only if it fits the character's age and personality.

Respond ONLY with the JSON object. No prose, no markdown fence.

{
  "opener": "...",
  "backstory": "...",
  "systemPromptAddendum": "..."
}`
  }

  // Default: es-AR Rioplatense
  return `Estás escribiendo la apertura y un trasfondo narrativo para una llamada de práctica de conversación en español de 5 minutos.

FLUJO DE LA LLAMADA (IMPORTANTE):
- EL PERSONAJE hizo la llamada. El aprendiz atendió. El personaje habla PRIMERO — antes de que el aprendiz diga nada.
- El "opener" es la primera línea del personaje cuando se conecta la llamada: se identifica y deja un gancho pequeño. NO el motivo entero.

PERSONAJE (FIJO — no lo cambies):
Nombre: ${character.name}
Edad: ${character.ageYears} años
Región/acento: ${character.region}
Relación con quien aprende: ${character.relationship}
Personalidad: ${character.personality}
Vida: ${character.lifeContext}

ESTADO EMOCIONAL HOY: ${emotion}

TU TAREA: Inventar UNA situación creíble para esta llamada que tenga sentido para este personaje. Luego escribir:

1. "opener" — Primera línea del personaje (1–2 oraciones cortas, voseo rioplatense). El personaje se identifica y deja un gancho vago. Ejemplos: "Ah, hola, soy ${character.name}, ¿tenés un segundo?", "Che, soy ${character.name}, perdón que te llamo así — ¿estás ocupado/a?". NO el motivo de la llamada.

2. "backstory" — UN párrafo narrativo en segunda persona desde la perspectiva del personaje ("Vos y [nombre] se conocen de...", "Hace dos semanas le dijiste al aprendiz que...", "El tema es que..."). Incluí 3–5 hechos ESPECÍFICOS: nombres de terceros, fechas aproximadas, lugares, montos si aplica. El personaje va a revelar estos detalles de a poco cuando el aprendiz pregunte.

3. "systemPromptAddendum" — 2–3 oraciones de instrucciones de ritmo en segunda persona ("Sos ${character.name}... Llamás porque... Guardá X para después de que pregunten..."). ¿Qué detalle retener al principio? ¿Qué revelar recién si te preguntan?

CRÍTICO:
- El opener NO contiene el motivo. Solo saludo + gancho.
- El backstory tiene hechos concretos, no abstracciones. Nombres, fechas, lugares.
- La situación debe ser plausible para alguien de ${character.ageYears} años que es ${character.relationship}.
- Acento y registro: ${character.region}. Usá voseo rioplatense.

Respondé SOLO con el objeto JSON. Sin markdown, sin texto adicional.

{
  "opener": "...",
  "backstory": "...",
  "systemPromptAddendum": "..."
}`
}

// ─── Character block renderer ──────────────────────────────────────────────────

function renderCharacterBlock(character: Character, targetLanguage: TargetLanguage): string {
  if (targetLanguage === 'en-NZ') {
    return `You are ${character.name}, ${character.ageYears} years old. ${character.relationship}. You speak with a ${character.region} accent.\n${character.personality}\n${character.lifeContext}`
  }
  return `Sos ${character.name}, tenés ${character.ageYears} años. ${character.relationship}. Hablás con acento ${character.region}.\n${character.personality}\n${character.lifeContext}`
}

// ─── Template fallback ─────────────────────────────────────────────────────────

function templateFallback(targetLanguage: TargetLanguage, character: Character, emotion: string): Persona {
  const characterBlock = renderCharacterBlock(character, targetLanguage)
  if (targetLanguage === 'en-NZ') {
    return {
      name: character.name,
      voiceName: character.voiceName,
      opener: `Oh hey — it's ${character.name}, you got a sec?`,
      systemPromptAddendum: `${characterBlock}\n\nYou are ${emotion}. Do NOT spill the reason in your first turn — ease in, greet, and wait for the learner. Reveal your situation gradually across several turns. Keep every turn to 1–2 short sentences.`,
      backstory: `You are ${character.name} and you're calling about something that came up recently. Reveal the reason gradually over the course of the call — one detail at a time in response to the learner's questions.`,
    }
  }
  return {
    name: character.name,
    voiceName: character.voiceName,
    opener: `Ah, hola, soy ${character.name}. ¿Tenés un segundo?`,
    systemPromptAddendum: `${characterBlock}\n\nEstás ${emotion}. NO sueltes el motivo en tu primer turno — saludá, dejá un beat, y esperá. El motivo se va desplegando de a poco. Mantené cada turno en 1 a 2 oraciones cortas. Hablá en voseo rioplatense.`,
    backstory: `Sos ${character.name} y llamás por algo que te pasó recientemente. Revelá el motivo de a poco a lo largo de la llamada, un detalle por vez respondiendo las preguntas del aprendiz.`,
  }
}

// ─── generatePersona ───────────────────────────────────────────────────────────

/**
 * Calls Claude to flesh out a pre-picked Character into a full Persona.
 * The character (fixed attributes) is chosen from CHARACTER_ROSTER; Claude
 * only writes the opener, backstory, and addendum from the brief.
 */
export async function generatePersona(targetLanguage: TargetLanguage): Promise<Persona> {
  const character = pickCharacter(targetLanguage)
  const emotionPool = EMOTION_POOLS[targetLanguage]
  const emotion = emotionPool[Math.floor(Math.random() * emotionPool.length)]
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 900,
    system: buildWriterPrompt(targetLanguage, character, emotion),
    messages: [{ role: 'user', content: 'Write the opener, backstory, and addendum for this character.' }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  let parsed: { opener?: string; backstory?: string; systemPromptAddendum?: string }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    log.warn('Persona writer returned non-JSON, using template fallback', {
      preview: text.slice(0, 200),
    })
    return templateFallback(targetLanguage, character, emotion)
  }

  const opener = (parsed.opener ?? '').trim()
  const backstory = (parsed.backstory ?? '').trim()
  const claudeAddendum = (parsed.systemPromptAddendum ?? '').trim()

  if (!opener || !backstory || !claudeAddendum) {
    log.warn('Persona writer missing required fields, using template fallback', { parsed, characterId: character.id })
    return templateFallback(targetLanguage, character, emotion)
  }

  const characterBlock = renderCharacterBlock(character, targetLanguage)
  const systemPromptAddendum = `${characterBlock}\n\n${claudeAddendum}`

  return {
    name: character.name,
    voiceName: character.voiceName,
    opener,
    systemPromptAddendum,
    backstory,
  }
}

// ─── buildPersonaSystemPrompt ──────────────────────────────────────────────────

/**
 * Build the combined system prompt for a persona call:
 * base practice rules + persona-specific situation block + call-start
 * instructions.
 *
 * The phone-call metaphor: the PERSONA placed the call, the learner picked
 * up. The persona speaks first — delivers the opener line the moment the
 * call-start signal arrives, before the learner says anything. This is the
 * natural phone-call experience: the caller identifies themselves when
 * someone answers. The learner's job is to respond and drive the conversation
 * from there.
 */
export function buildPersonaSystemPrompt(
  basePrompt: string,
  persona: Persona,
): string {
  return `${basePrompt}

—— YOUR CHARACTER FOR THIS CALL ——
${persona.systemPromptAddendum}

—— THIS CALL'S BACKSTORY ——
${persona.backstory}
Draw on these specific details when the learner asks follow-up questions. Reveal one detail per turn — do not volunteer everything at once. If the learner asks "how do you know him?" or "what happened?", answer that specific question with one concrete fact from above.

—— CONVERSATION DYNAMICS (REAL CALL PACING) ——
This is a real phone call between two humans, not a monologue or an exposition dump. Pace yourself the way a real person would:

- Your opener is ONLY a greeting + a small hook. Say it, then STOP. Wait for the learner to respond before continuing.
- Do NOT dump your reason for calling in the first turn or two. Real callers ease in — they say hello, exchange a beat, maybe ask "is this a bad time?", and only then start working into what they actually wanted to talk about.
- Reveal your situation GRADUALLY across the call. Drop one piece of context per turn. Let the learner pull more out of you with follow-up questions — that is the natural rhythm of a phone conversation.
- Be a bit vague before you're specific. Real people often start with "I had this weird thing happen..." or "...I wanted to ask you something" before getting into the detail. Hold back the punchline.
- Keep EVERY turn short — 1 to 2 short sentences max. One thought per turn. If you have more to say, save it for the next turn after the learner responds.
- React specifically to what the learner asks or says. If they ask a clarifying question, answer THAT question — don't pivot to a different chunk of your backstory to deliver more information.
- Leave space for the learner to drive. If they go quiet, a short "...does that make sense?" or "...you with me?" works better than another paragraph of context.
- Use natural call patterns: small hesitations, false starts ("uh, well..."), checking in ("you there?"), and acknowledgements ("yeah, exactly") — the texture of a real call, not a clean speech.

—— STARTING THE CALL ——
YOU placed this call — the learner picked up. Speak first. The moment the call-start signal arrives, deliver your opener line verbatim (you may adapt it very lightly — e.g. if the learner has already said their name, address them by it). Do NOT wait for the learner to say anything first.

Your opener: "${persona.opener}"

After delivering that line, stop and wait for the learner to respond. The reason for the call unfolds over the next few exchanges, not in your first turn. Do NOT translate or explain the opener. If the learner stays completely silent after your opener, a quiet "...hello?" / "¿hola?" is fine, but nothing more.`
}
