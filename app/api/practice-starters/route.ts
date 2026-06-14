// app/api/practice-starters/route.ts
//
// Returns 3 LLM-generated conversation starters for the Practise home. Each
// starter is `{ topic, category }` — the topic is in the user's native
// language (en or es), and the category is one of a fixed enum the client
// maps to a Phosphor icon (so the model never emits arbitrary emoji). Topics
// vary each request so returning users always see fresh suggestions.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'
import type { UiLanguage } from '@/lib/i18n'

const client = new Anthropic()

// Bounded category set — kept in lockstep with STARTER_CATEGORIES /
// CATEGORY_ICON in components/PractiseClient.tsx. Unknown values from the
// model coerce to 'misc'.
const CATEGORIES = [
  'food', 'travel', 'work', 'home', 'people',
  'media', 'city', 'plans', 'opinion', 'misc',
] as const
type Category = (typeof CATEGORIES)[number]

interface Starter {
  topic: string
  category: Category
}

const PROMPTS: Record<UiLanguage, string> = {
  en: `Generate exactly 3 short, casual conversation topics for a language learner.
Topics should be everyday, relatable situations easy to talk about for a few minutes.
For each topic, pick the single best-fitting category from this exact list:
food, travel, work, home, people, media, city, plans, opinion, misc.
Return ONLY a JSON array of 3 objects, each {"topic": string, "category": string}.
Each topic: 3–8 words, no trailing punctuation. The category must be one of the listed values.
Vary the topics — mix personal experiences, plans, opinions, and observations.
Good example: [{"topic":"Your favourite local restaurant","category":"food"},{"topic":"A trip you want to take","category":"travel"},{"topic":"What you watch to relax","category":"media"}]`,

  es: `Generá exactamente 3 temas de conversación cortos y cotidianos para alguien que aprende inglés.
Los temas deben ser situaciones del día a día, fáciles de charlar durante unos minutos.
Para cada tema, elegí la única categoría que mejor encaje de esta lista exacta:
food, travel, work, home, people, media, city, plans, opinion, misc.
Devolvé SOLO un array JSON de 3 objetos, cada uno {"topic": string, "category": string}.
Cada tema: 3–8 palabras, sin puntuación al final. La categoría debe ser uno de los valores de la lista.
Variá los temas — mezclá experiencias personales, planes, opiniones y observaciones.
Ejemplo bueno: [{"topic":"Tu restaurant favorito del barrio","category":"food"},{"topic":"Un viaje que querés hacer","category":"travel"},{"topic":"Qué mirás para relajarte","category":"media"}]`,
}

function coerceCategory(value: unknown): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : 'misc'
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lang = (searchParams.get('lang') ?? 'en') as UiLanguage

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: PROMPTS[lang] }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed) || parsed.length < 3) {
      throw new Error('Unexpected shape from model')
    }

    const starters: Starter[] = parsed
      .slice(0, 3)
      .map((item) => ({
        topic: String((item as { topic?: unknown })?.topic ?? '').trim(),
        category: coerceCategory((item as { category?: unknown })?.category),
      }))
      .filter((s) => s.topic.length > 0)

    if (starters.length < 3) {
      throw new Error('Too few valid starters from model')
    }

    return NextResponse.json({ starters })
  } catch (err) {
    log.error('practice-starters: generation failed', { err })
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
