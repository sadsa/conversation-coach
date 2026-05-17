// lib/persona.ts
//
// Generates a fresh conversation persona for the Practice page's "Pick up a
// call" mode. Each call gets a server-randomised character + a Claude-written
// opener and addendum:
//
//   - name           : pre-picked from a gender-appropriate pool (first only)
//   - voiceName      : pre-picked from VOICE_CATALOG with a soft age match
//   - opener         : Claude writes the actual first line in target language
//   - systemPromptAddendum : Claude writes the in-character situation block
//
// Why pre-pick the axes in JS rather than ask Claude to vary them?
// Empirically Claude (Haiku) collapses to the modal output across calls
// even at temperature 1.0 — six out of nine generations during diagnosis
// were "gossipy female neighbour from apartment XB who just saw something
// weird in the building". Asking the same model to both choose axes and
// flesh them out gives the bias two surfaces to compound on. Moving axis
// selection to JS guarantees diversity from real entropy (Math.random)
// and leaves Claude doing only what it's good at: writing fluent voseo /
// NZ-English in character.

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

/** Subset of Gemini Live's 30 prebuilt voices, curated for character variety.
 *  Each entry's `vibe` is the official Google descriptor — surfaced to the
 *  writer model so it can reflect the voice's energy in the addendum.
 *  `gender` is sourced from Google's official catalog. */
export const VOICE_CATALOG: Array<{
  name: string
  vibe: string
  gender: VoiceGender
  ageFit: VoiceAgeFit
}> = [
  { name: 'Fenrir',         gender: 'male',   ageFit: 'any',   vibe: 'Excitable — frustrated, urgent, agitated callers' },
  { name: 'Pulcherrima',    gender: 'female', ageFit: 'any',   vibe: 'Forward — assertive, gossipy, outraged' },
  { name: 'Vindemiatrix',   gender: 'female', ageFit: 'older', vibe: 'Gentle — soft-spoken, warm, older' },
  { name: 'Gacrux',         gender: 'female', ageFit: 'older', vibe: 'Mature — older, settled, weighed down by life' },
  { name: 'Algenib',        gender: 'male',   ageFit: 'older', vibe: 'Gravelly — older men, character voices' },
  { name: 'Leda',           gender: 'female', ageFit: 'youth', vibe: 'Youthful — children, young adults' },
  { name: 'Puck',           gender: 'male',   ageFit: 'youth', vibe: 'Upbeat — energetic young adult / teen' },
  { name: 'Enceladus',      gender: 'male',   ageFit: 'any',   vibe: 'Breathy — conspiratorial, intimate, sharing secrets' },
  { name: 'Alnilam',        gender: 'male',   ageFit: 'any',   vibe: 'Firm — confident, salesy, official' },
  { name: 'Achernar',       gender: 'female', ageFit: 'any',   vibe: 'Soft — uncertain, bewildered, shy' },
  { name: 'Zubenelgenubi',  gender: 'male',   ageFit: 'any',   vibe: 'Casual — laid-back, easygoing friend' },
  { name: 'Achird',         gender: 'male',   ageFit: 'any',   vibe: 'Friendly — warm, approachable' },
  { name: 'Sulafat',        gender: 'female', ageFit: 'any',   vibe: 'Warm — kindhearted, caring' },
  { name: 'Sadachbia',      gender: 'male',   ageFit: 'any',   vibe: 'Lively — energetic, animated' },
  { name: 'Charon',         gender: 'male',   ageFit: 'any',   vibe: 'Informative — knowledgeable, official' },
  { name: 'Aoede',          gender: 'female', ageFit: 'any',   vibe: 'Breezy — light, neutral, cheerful' },
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
}

/** All the axes JS pre-picks before calling Claude. Bundling them in one
 *  object keeps the prompt construction tidy and makes the fallback path
 *  trivial (no Claude → still a fully-formed persona, just with a
 *  hand-written opener template). */
interface PersonaSeed {
  name: string
  ageYears: number
  gender: 'masculino' | 'femenino' | 'no-binarie'
  relation: string
  callingFrom: string
  emotion: string
  reason: string
  twist: string | null
  voiceName: string
  voiceVibe: string
}

// ─── Pools ─────────────────────────────────────────────────────────────────
// Sized to make repeated combinations vanishingly rare in normal use. Each
// pool is intentionally varied along multiple sub-dimensions (age, social
// class, register) so a uniform random pick keeps drifting through the
// space rather than clustering.

const POOLS_ES_AR = {
  namesMasc: [
    'Lucas', 'Diego', 'Tomás', 'Facundo', 'Joaquín', 'Mateo', 'Bruno',
    'Lautaro', 'Nicolás', 'Sebastián', 'Agustín', 'Esteban', 'Ramiro',
    'Fernando', 'Gonzalo', 'Pablo', 'Ezequiel', 'Hernán', 'Ignacio',
    'Damián', 'Federico', 'Cristian', 'Rodrigo', 'Adrián', 'Jorge',
    'Héctor', 'Raúl', 'Walter', 'Osvaldo', 'Carlos', 'Rubén', 'Norberto',
    'Juan Pablo', 'José Luis', 'Alejandro', 'Sergio', 'Gustavo',
  ],
  namesFem: [
    'Camila', 'Sofía', 'Lucía', 'Valentina', 'Florencia', 'Agustina',
    'Julieta', 'Pilar', 'Antonella', 'Mora', 'Renata', 'Catalina',
    'Delfina', 'Emilia', 'Bianca', 'Constanza', 'Micaela', 'Romina',
    'Carla', 'Paula', 'Vanesa', 'Brenda', 'Gabriela', 'Marina',
    'Verónica', 'Cecilia', 'Susana', 'Patricia', 'Nora', 'Beatriz',
    'Liliana', 'Graciela', 'Estela', 'Mirta', 'Norma', 'Silvia',
  ],
  namesNB: ['Ariel', 'Andi', 'Sam', 'Robin', 'Sasha', 'Quim'],
  // Ages are deliberately granular and span the full life arc so we don't
  // keep landing on "early thirties professional".
  ages: [
    8, 11, 14, 16, 19, 21, 24, 27, 29, 32, 36, 39, 42, 46, 49, 52,
    55, 58, 61, 64, 67, 71, 75, 80, 84,
  ],
  relations: [
    'un vecino del edificio que casi no conocés',
    'la kiosquera de la esquina',
    'tu primo segundo del interior',
    'una tía lejana que hace años no te llama',
    'tu sobrino adolescente',
    'el verdulero del barrio',
    'un ex-compañero del último laburo',
    'una amiga de una amiga',
    'tu peluquero/a de toda la vida',
    'el dueño del bar de la esquina',
    'el plomero del edificio',
    'una persona totalmente desconocida con número equivocado',
    'tu ex-profesor/a de tango',
    'el portero del edificio',
    'un fan tuyo de Instagram',
    'tu ex-jefa de hace dos trabajos',
    'una periodista freelance que quiere hacerte una nota',
    'el encargado del PH',
    'un primo lejano que vive en Mendoza',
    'un vendedor ambulante que te conoce de vista',
    'alguien que conociste en un cumpleaños hace meses',
    'el dueño de la rotisería de la cuadra',
    'tu compañero del colegio que hace años no veías',
    'tu ex-vecina que se mudó a Pinamar',
    'el chofer del Uber que tomaste anteayer',
    'una compañera del gimnasio',
    'tu profesor de manejo',
    'la madre de un amigo del nene',
    'tu suegra (o ex-suegra)',
    'un compañero del club de barrio',
  ],
  locations: [
    'un colectivo de la 60 yendo al centro',
    'la cocina mientras cocina milanesas',
    'el subte línea D en hora pico',
    'la cola del banco esperando ser atendido',
    'una panadería en plena Avenida Cabildo',
    'el patio de su casa tomando mate',
    'el aeropuerto de Ezeiza esperando un vuelo demorado',
    'la peluquería con los rulos puestos',
    'una plaza llena de pibitos jugando al fútbol',
    'un boliche bailable a las cuatro de la mañana',
    'un consultorio médico esperando turno',
    'una verdulería discutiendo el precio del tomate',
    'un Uber camino a Palermo',
    'la oficina con su jefe pasando atrás',
    'una librería de Corrientes',
    'el balcón mirando la lluvia',
    'un quincho organizando un asado',
    'una cancha de paddle en Belgrano',
    'un café en San Telmo',
    'la pileta del club',
    'la sala de espera de un mecánico',
    'un parripollo a la siesta del domingo',
    'el supermercado chino del barrio',
    'una farmacia de turno a la madrugada',
    'la terraza del PH tendiendo la ropa',
    'una fiesta de quince esperando el vals',
    'la sala de espera de un dentista',
    'un viaje en tren a La Plata',
    'el quincho de un amigo encendiendo el fuego',
    'una cabina de peaje de la Panamericana',
  ],
  emotions: [
    'eufórico porque le acaba de pasar algo bueno',
    'medio dormido y todavía despertándose',
    'recién enamorado y necesita contarlo',
    'ofendido por algo que le hicieron hoy',
    'apurado porque va llegando tarde a algo importante',
    'tímido y un poco incómodo de estar llamando',
    'medio borracho en una previa',
    'preocupado por algo que no sabe cómo explicar',
    'aburridísimo a la siesta del domingo',
    'nostálgico porque se acordó de algo viejo',
    'indignado y necesita desahogarse YA',
    'conspirativo, hablando bajito',
    'sospechosamente alegre, sin motivo claro',
    'cansado después de un día larguísimo',
    'curioso y un poco entrometido',
    'frustrado con la tecnología y ya cansado de pelear',
    'distraído porque está haciendo otra cosa al mismo tiempo',
    'angustiado pero tratando de disimularlo',
    'orgulloso de algo que logró y necesita presumir un poco',
    'medio paranoico, mirando para los costados',
    'súper formal, casi rígido',
    'con voz de recién despertado, ronca',
    'agitado, le falta el aire',
    'tranquilísimo, casi en cámara lenta',
    'haciéndose el simpático aunque está claramente molesto',
  ],
  reasons: [
    'necesita un favor medio raro y no sabe cómo pedirlo',
    'se equivocó de número pero le da fiaca cortar',
    'quiere venderte algo absurdo',
    'tiene una novedad que no puede guardarse adentro',
    'quiere pedirte un consejo personal',
    'necesita devolverte algo que te había prestado y ni te acordás',
    'quiere proponerte un plan loco para el finde',
    'te debe plata y viene a darte una explicación larga',
    'quiere chusmear sobre alguien que ambos conocen',
    'tiene una pregunta técnica que no sabe a quién más preguntarle',
    'se enteró de algo y necesita confirmarlo con vos',
    'te invita a un evento muy específico',
    'busca recomendaciones (de plomero, de restaurante, de lo que sea)',
    'necesita ayuda para tomar una decisión en los próximos diez minutos',
    'te quiere agradecer por algo que hiciste hace tiempo',
    'tiene un dilema moral y necesita una segunda opinión',
    'quiere disculparse por algo que pasó',
    'se enojó con alguien y necesita ventilar',
    'te cuenta una teoría conspirativa que se le ocurrió',
    'quiere coordinar algo logístico (un cumpleaños, una mudanza)',
    'te pide la gauchada de ir a buscar algo',
    'le pasó algo gracioso y necesita contarlo',
    'tiene una idea de negocio que quiere proponerte',
    'recibió una noticia rara y no sabe cómo interpretarla',
    'te llama para reclamarte algo que dijiste hace meses',
    'está perdido y necesita indicaciones',
    'quiere recomendarte una serie con detalles innecesarios',
    'tiene una superstición que quiere chequear con vos',
  ],
  // Optional flavour-twists used about 40% of the time to add specificity.
  twists: [
    'pero hay un detalle que cambia todo',
    'pero no quiere que nadie más se entere',
    'pero no termina de entender lo que pasó',
    'y vos sos la única persona que puede ayudarlo',
    'pero la persona que le interesa contarlo no le contesta',
    'y necesita una respuesta en los próximos minutos',
    'aunque sabe que vos te vas a reír',
    'y resulta que vos estás involucrado sin saberlo',
    'pero recién se da cuenta que tal vez no es tan importante',
    'mientras de fondo se escucha algo raro',
    'aunque le da un poco de vergüenza pedirlo',
  ],
}

const POOLS_EN_NZ = {
  namesMasc: [
    'Liam', 'Oliver', 'Jack', 'Noah', 'Hunter', 'Mason', 'Cody', 'Caleb',
    'Riley', 'Ethan', 'Tane', 'Manaia', 'Hemi', 'Wiremu', 'Wiri',
    'Cameron', 'Blake', 'Jordan', 'Brayden', 'Harvey', 'Kingi', 'Dave',
    'Pete', 'Bazza', 'Macca', 'Stu', 'Kev', 'Dwayne', 'Trev', 'Mike',
  ],
  namesFem: [
    'Charlotte', 'Olivia', 'Mia', 'Amelia', 'Ruby', 'Aroha', 'Anahera',
    'Maia', 'Kiri', 'Ava', 'Sophie', 'Isla', 'Hannah', 'Grace',
    'Emily', 'Chloe', 'Lucy', 'Jess', 'Tash', 'Kayla', 'Steph', 'Dee',
    'Sharon', 'Glenys', 'Robyn', 'Trish', 'Lynne', 'Beverley', 'Margo', 'Pam',
  ],
  namesNB: ['Sam', 'Alex', 'Robin', 'Ash', 'Kai'],
  ages: [
    8, 11, 14, 16, 19, 21, 24, 27, 29, 32, 36, 39, 42, 46, 49, 52,
    55, 58, 61, 64, 67, 71, 75, 80, 84,
  ],
  relations: [
    'a neighbour from down the road',
    'the dairy owner from the corner shop',
    'a second cousin you barely remember',
    'your aunty who hasn\'t rung in years',
    'your teenage nephew',
    'the greengrocer at the local market',
    'an ex-workmate from a job two ago',
    'a friend of a friend',
    'your hairdresser of fifteen years',
    'the publican from the local',
    'the plumber doing a quote at your flat',
    'a complete stranger with a wrong number',
    'your tramping club leader',
    'the building manager',
    'an Instagram follower who tracked down your number',
    'your boss from two jobs ago',
    'a freelance journalist chasing a story',
    'the body corp chair',
    'a distant cousin who lives in Dunedin',
    'the bloke who delivers your firewood',
    'someone you met at a birthday party months ago',
    'the takeaway shop owner on your street',
    'an old school mate you haven\'t seen in years',
    'your ex-neighbour who moved to the Coromandel',
    'your Uber driver from the other night',
    'a mate from the gym',
    'your driving instructor',
    'another parent from school pickup',
    'your mother-in-law (or ex)',
    'a bowling club member',
  ],
  locations: [
    'a bus heading into town',
    'their kitchen mid-cooking',
    'a queue at the Post Shop',
    'a bakery on Cuba Street',
    'their back deck with a coffee',
    'Auckland airport on a delayed flight',
    'the hairdresser with foils in',
    'a playground full of yelling kids',
    'a bar at one in the morning',
    'a doctor\'s waiting room',
    'the greengrocer arguing about avocado prices',
    'an Uber heading to Newtown',
    'the office with their boss walking past',
    'a bookshop on Lambton Quay',
    'a balcony watching the rain',
    'a backyard setting up a barbecue',
    'a paddle court in Mt Eden',
    'a cafe in Ponsonby',
    'the public pool',
    'a mechanic\'s waiting room',
    'a Sunday roast lunch',
    'an Asian supermarket',
    'a 24-hour pharmacy at midnight',
    'the line for the ferry in Wellington',
    'a kids\' birthday party',
    'the dentist\'s waiting room',
    'a train heading to Hutt Valley',
    'a mate\'s shed starting the smoker',
    'a toll booth on the motorway',
    'the supermarket at five to closing',
  ],
  emotions: [
    'buzzing because something great just happened',
    'half asleep and still waking up',
    'newly loved-up and dying to tell someone',
    'offended by something that happened today',
    'in a rush because they\'re running late',
    'shy and a bit awkward about calling',
    'a bit tipsy at a pre-game',
    'worried about something they can\'t quite explain',
    'bored out of their mind on a Sunday afternoon',
    'nostalgic because something old just came back to them',
    'fired up and needs to vent NOW',
    'conspiratorial, talking quietly',
    'suspiciously cheerful for no clear reason',
    'shattered after a long day',
    'nosy and a bit too curious',
    'frustrated with tech and over it',
    'distracted because they\'re doing something else at the same time',
    'anxious but trying to play it cool',
    'proud of something they pulled off and wanting to brag a bit',
    'a bit paranoid, looking over their shoulder',
    'overly formal, almost stiff',
    'raspy because they just woke up',
    'puffed and out of breath',
    'unusually calm, almost in slow motion',
    'forced cheerful even though they\'re obviously annoyed',
  ],
  reasons: [
    'needs a slightly weird favour and isn\'t sure how to ask',
    'rang the wrong number but can\'t be bothered hanging up',
    'wants to sell you something ridiculous',
    'has news they can\'t keep to themselves',
    'wants your advice on something personal',
    'needs to return something you lent them ages ago',
    'wants to pitch you a wild weekend plan',
    'owes you money and is launching into a long explanation',
    'wants to gossip about someone you both know',
    'has a tech question they didn\'t know who else to ring',
    'heard something and needs to confirm it with you',
    'is inviting you to a very specific event',
    'is hunting for a recommendation (plumber, restaurant, whatever)',
    'needs help making a decision in the next ten minutes',
    'wants to thank you for something you did months ago',
    'has a moral dilemma and needs a second opinion',
    'wants to apologise for something that happened',
    'got into a fight with someone and needs to vent',
    'wants to share a conspiracy theory they came up with',
    'is trying to organise the logistics of something (party, move)',
    'wants you to do them a quick favour like picking something up',
    'something funny just happened and they need to tell someone',
    'has a business idea they want to run past you',
    'got weird news and doesn\'t know how to interpret it',
    'is calling to relitigate something you said months ago',
    'is lost and needs directions',
    'wants to recommend a TV show with unnecessary detail',
    'has a superstition they want to run past you',
  ],
  twists: [
    'but there\'s a small detail that changes everything',
    'and they don\'t want anyone else to find out',
    'but they don\'t fully understand what happened',
    'and you\'re the only person who can help',
    'but the person they actually wanted to tell isn\'t picking up',
    'and they need an answer in the next few minutes',
    'even though they know you\'ll laugh',
    'and it turns out you\'re involved without realising',
    'but they\'re starting to wonder if it\'s actually a big deal',
    'while something weird is going on in the background',
    'even though they\'re a bit embarrassed to be asking',
  ],
}

type LangPools = typeof POOLS_ES_AR

const POOLS: Record<TargetLanguage, LangPools> = {
  'es-AR': POOLS_ES_AR,
  'en-NZ': POOLS_EN_NZ,
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Maps a persona age to the voice ageFit bucket. */
function ageBucket(ageYears: number): VoiceAgeFit {
  if (ageYears < 18) return 'youth'
  if (ageYears >= 65) return 'older'
  return 'any'
}

/**
 * Pick a voice that matches the persona's gender (HARD constraint) and
 * roughly fits their age (SOFT constraint). The hard/soft split exists so
 * a 14-year-old boy never gets a feminine voice just because no male-youth
 * voice happens to be tagged — falling back to any age within the right
 * gender is always better than crossing genders.
 *
 * Non-binary personas: no gender filter at all (the picker draws from the
 * whole catalog), since the `namesNB` pool deliberately uses gender-ambiguous
 * names where either voice register reads as plausible.
 */
function pickVoice(
  gender: PersonaSeed['gender'],
  ageYears: number,
): { name: string; vibe: string } {
  const bucket = ageBucket(ageYears)
  const genderMatch = gender === 'no-binarie'
    ? VOICE_CATALOG
    : VOICE_CATALOG.filter(v => v.gender === (gender === 'masculino' ? 'male' : 'female'))

  // Try (gender ∩ ageFit) first; if that intersection is empty (e.g. no
  // 'older' voice for some gender at some future catalog state), relax the
  // age constraint and pick from any age within the right gender.
  const ageMatch = genderMatch.filter(v => v.ageFit === bucket)
  const pool = ageMatch.length > 0 ? ageMatch : genderMatch

  const picked = pickOne(pool)
  return { name: picked.name, vibe: picked.vibe }
}

function pickName(pools: LangPools, gender: PersonaSeed['gender']): string {
  if (gender === 'masculino') return pickOne(pools.namesMasc)
  if (gender === 'femenino') return pickOne(pools.namesFem)
  return pickOne(pools.namesNB)
}

function pickGender(): PersonaSeed['gender'] {
  // 47/47/6 split — non-binary kept rare so callers don't feel formulaic,
  // but present so the experience isn't a strict binary either.
  const r = Math.random()
  if (r < 0.47) return 'masculino'
  if (r < 0.94) return 'femenino'
  return 'no-binarie'
}

export function pickPersonaSeed(targetLanguage: TargetLanguage): PersonaSeed {
  const pools = POOLS[targetLanguage]
  const gender = pickGender()
  const ageYears = pickOne(pools.ages)
  const name = pickName(pools, gender)
  const { name: voiceName, vibe: voiceVibe } = pickVoice(gender, ageYears)
  // ~40% of personas get a twist; the rest stay clean so we don't overload
  // every call with quirks.
  const twist = Math.random() < 0.4 ? pickOne(pools.twists) : null
  return {
    name,
    ageYears,
    gender,
    relation: pickOne(pools.relations),
    callingFrom: pickOne(pools.locations),
    emotion: pickOne(pools.emotions),
    reason: pickOne(pools.reasons),
    twist,
    voiceName,
    voiceVibe,
  }
}

function buildWriterPrompt(targetLanguage: TargetLanguage, seed: PersonaSeed): string {
  if (targetLanguage === 'en-NZ') {
    return `You are writing the opening line and a brief character note for a 5-minute English conversation practice call. The character is already decided — your only job is to write the opener and the addendum.

CHARACTER:
- Name: ${seed.name}
- Age: ${seed.ageYears}
- Gender: ${seed.gender === 'masculino' ? 'male' : seed.gender === 'femenino' ? 'female' : 'non-binary'}
- Their relationship to the learner: ${seed.relation}
- Calling from: ${seed.callingFrom}
- Emotional state: ${seed.emotion}
- Reason for the call: ${seed.reason}${seed.twist ? `\n- Twist to weave in: ${seed.twist}` : ''}
- They speak with the voice "${seed.voiceName}" (${seed.voiceVibe}). The addendum should match that energy.

OUTPUT JSON shape:
{
  "opener": "<single English line, 1–3 sentences, casual NZ register. They greet, introduce themselves by name, give the reason for the call, and end with a question or beat the learner can respond to. Must work as the model's FIRST spoken line with no prior context.>",
  "systemPromptAddendum": "<2–4 lines in English, written as instructions in second person ('You are X. You're calling because Y. You sound Z.'). Cover: who you are, why you're calling, your emotional state, where the conversation might go. Be specific so the AI stays in character.>"
}

CRITICAL:
- Use the character's actual age, location, and emotion. Do not soften them into a generic adult.
- Casual NZ register: "yeah nah", "mate", "eh" are fine but use sparingly and only when they fit the character (a 12-year-old won't say "mate").
- Do NOT default to a "neighbour who saw something weird in the building" — work with the axes given above.
- Set the emotional tone EXPLICITLY in the addendum, not just by implication.

Respond ONLY with the JSON object. No prose, no markdown fence.`
  }

  return `Estás escribiendo la línea de apertura y una nota breve de personaje para una llamada de práctica de conversación en español de 5 minutos. El personaje ya está definido — tu única tarea es escribir el opener y el addendum.

PERSONAJE:
- Nombre: ${seed.name}
- Edad: ${seed.ageYears} años
- Género: ${seed.gender}
- Relación con quien aprende: ${seed.relation}
- Está llamando desde: ${seed.callingFrom}
- Estado emocional: ${seed.emotion}
- Motivo de la llamada: ${seed.reason}${seed.twist ? `\n- Detalle para incorporar: ${seed.twist}` : ''}
- Habla con la voz "${seed.voiceName}" (${seed.voiceVibe}). El addendum debería reflejar esa energía.

FORMA DE LA SALIDA (JSON):
{
  "opener": "<una sola línea en español rioplatense, 1–3 oraciones. Saluda, dice su nombre, da el motivo de la llamada, y termina con una pregunta o un beat que el aprendiz pueda agarrar. Tiene que funcionar como la PRIMERA frase del modelo, sin contexto previo.>",
  "systemPromptAddendum": "<2–4 líneas en español (voseo), escritas como instrucciones en segunda persona ('Sos X. Llamás porque Y. Estás Z.'). Cubrir: quién sos, por qué llamás, cómo estás emocionalmente, hacia dónde puede ir la charla. Sé específico para que el modelo no se salga de personaje.>"
}

CRÍTICO:
- Usá la edad, ubicación y emoción reales del personaje. No los suavices a "adulto genérico".
- Usá voseo rioplatense (sos, tenés, hablás, podés). Lunfardo bienvenido pero sin forzar.
- NO te vayas al cliché del "vecino que vio algo raro en el edificio" — trabajá con los ejes dados arriba.
- Fijá el tono emocional EXPLÍCITAMENTE en el addendum, no solo por implicación.
- Si el personaje tiene menos de 16 años, hablá como adolescente/niño — sin formalismos.
- Si tiene más de 65, evitá modismos demasiado modernos.

Respondé SOLO con el objeto JSON. Sin texto adicional, sin markdown.`
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
 * Calls Claude to flesh out a pre-randomised PersonaSeed into a full Persona.
 * The seed (axes + name + voice) is decided in JS so we get real entropy;
 * Claude only writes the opener + addendum from the brief.
 */
export async function generatePersona(targetLanguage: TargetLanguage): Promise<Persona> {
  const seed = pickPersonaSeed(targetLanguage)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    // temperature stays at the SDK default (1.0). Entropy is now coming
    // from the pre-picked axes — bumping temperature higher mostly damages
    // grammar at this point.
    system: buildWriterPrompt(targetLanguage, seed),
    messages: [{ role: 'user', content: 'Write the opener and addendum for this character.' }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  let parsed: { opener?: string; systemPromptAddendum?: string }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    log.warn('Persona writer returned non-JSON, using template fallback', {
      preview: text.slice(0, 200),
    })
    return templateFallback(targetLanguage, seed)
  }

  const opener = (parsed.opener ?? '').trim()
  const systemPromptAddendum = (parsed.systemPromptAddendum ?? '').trim()

  if (!opener || !systemPromptAddendum) {
    log.warn('Persona writer missing required fields, using template fallback', { parsed, seed })
    return templateFallback(targetLanguage, seed)
  }

  return {
    name: seed.name,
    voiceName: seed.voiceName,
    opener,
    systemPromptAddendum,
  }
}

/**
 * Hand-templated fallback when Claude returns garbage. Unlike the old
 * fixed-character fallback (always "Mateo, programador aburrido"), this one
 * uses the already-randomised seed — so even the fallback path stays varied
 * across calls. Rare in practice but no longer a diversity dead end.
 */
function templateFallback(targetLanguage: TargetLanguage, seed: PersonaSeed): Persona {
  if (targetLanguage === 'en-NZ') {
    return {
      name: seed.name,
      voiceName: seed.voiceName,
      opener: `Hey, it's ${seed.name} — listen, I'm calling because I ${seed.reason.replace(/^needs to|^wants to|^has /, m => m.startsWith('needs to') ? 'need to' : m.startsWith('wants to') ? 'want to' : 'have ')}. Got a sec?`,
      systemPromptAddendum:
        `You are ${seed.name}, ${seed.ageYears} years old, ${seed.relation}. You're calling from ${seed.callingFrom}. You sound ${seed.emotion}. The reason for the call: ${seed.reason}.${seed.twist ? ` ${seed.twist[0].toUpperCase() + seed.twist.slice(1)}.` : ''} Stay in character, keep turns short, let the learner respond.`,
    }
  }
  return {
    name: seed.name,
    voiceName: seed.voiceName,
    opener: `Hola, soy ${seed.name}. Te llamo porque ${seed.reason}. ¿Tenés un minuto?`,
    systemPromptAddendum:
      `Sos ${seed.name}, tenés ${seed.ageYears} años, sos ${seed.relation}. Llamás desde ${seed.callingFrom}. Estás ${seed.emotion}. El motivo de la llamada: ${seed.reason}.${seed.twist ? ` ${seed.twist[0].toUpperCase() + seed.twist.slice(1)}.` : ''} Mantenete en personaje, hablá en voseo, dejá espacio para que el aprendiz responda.`,
  }
}
