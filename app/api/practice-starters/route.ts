// app/api/practice-starters/route.ts
//
// Returns 3 LLM-generated conversation starter topics for the home chips.
// Topics are in the user's native language (en or es) and vary each request
// so returning users always see fresh suggestions.

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'
import type { UiLanguage } from '@/lib/i18n'

const client = new Anthropic()

const PROMPTS: Record<UiLanguage, string> = {
  en: `Generate exactly 3 short, casual conversation topics for a language learner.
Topics should be everyday, relatable situations easy to talk about for a few minutes.
Return ONLY a JSON array of 3 strings. Each topic: 3–8 words, no trailing punctuation.
Vary the topics — mix personal experiences, plans, opinions, and observations.
Good examples: ["Your favourite local restaurant", "A trip you want to take", "What you watch to relax"]
Bad examples (too abstract, too similar, too heavy): ["Philosophy of life", "Your weekend plans", "Your weekend plans"]`,

  es: `Generá exactamente 3 temas de conversación cortos y cotidianos para alguien que aprende inglés.
Los temas deben ser situaciones del día a día, fáciles de charlar durante unos minutos.
Devolvé SOLO un array JSON de 3 strings. Cada tema: 3–8 palabras, sin puntuación al final.
Variá los temas — mezclá experiencias personales, planes, opiniones y observaciones.
Ejemplos buenos: ["Tu restaurant favorito del barrio", "Un viaje que querés hacer", "Qué mirás para relajarte"]`,
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lang = (searchParams.get('lang') ?? 'en') as UiLanguage

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [{ role: 'user', content: PROMPTS[lang] }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    const starters = JSON.parse(raw) as string[]

    if (!Array.isArray(starters) || starters.length < 3) {
      throw new Error('Unexpected shape from model')
    }

    return NextResponse.json({ starters: starters.slice(0, 3) })
  } catch (err) {
    log.error('practice-starters: generation failed', { err })
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
