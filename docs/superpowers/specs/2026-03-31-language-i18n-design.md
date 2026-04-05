# Language & i18n Enhancements

**Date:** 2026-03-31

## Summary

Four related enhancements to the language-awareness of the app:

1. Fix flashcard front/back direction for en-NZ sessions
2. Swipe right to go back on the flashcard screen
3. First-login onboarding screen to select target language
4. Full i18n: UI renders in the user's native language, live-updating when target language changes

---

## Language Model

`target_language` (existing, stored in Supabase `user_metadata`) is the single source of truth. `ui_language` is always derived — never stored:

| target_language | ui_language | Meaning |
|---|---|---|
| `es-AR` | `en` | Learning Spanish → UI in English |
| `en-NZ` | `es` | Learning English → UI in Spanish |

---

## Feature 1: Flashcard Direction Fix (en-NZ)

**Problem:** `SYSTEM_PROMPT_EN_NZ` in `lib/claude.ts` currently generates the same English sentence for both `flashcard_front` and `flashcard_back`. The correct pattern (matching es-AR) is front = native language, back = target language.

**Fix:** Update `SYSTEM_PROMPT_EN_NZ` so:
- `flashcard_front`: A Spanish sentence (native language) illustrating the concept, target phrase in `[[double brackets]]`
- `flashcard_back`: The NZ English equivalent sentence with the correct form in `[[double brackets]]`

**FlashcardDeck hint text:** The hardcoded string "Tap to reveal Spanish" becomes a translation key `flashcard.tapToReveal` resolved via i18n (see Feature 4). For en-NZ it renders "Toca para ver el inglés"; for es-AR "Tap to reveal Spanish".

**Existing data:** Practice items already saved to the DB from en-NZ sessions are unaffected. Users can re-analyse those sessions to regenerate correct flashcard content.

---

## Feature 2: Swipe Right to Go Back (FlashcardDeck)

**Change:** In `components/FlashcardDeck.tsx`, add a `goBack()` function that decrements `currentIndex` (wrapping to `items.length - 1` when at 0) and resets `isFlipped` and `isExplainOpen`.

In `onDragEnd`, add an `x > 80` branch that animates the card off to the right (`x: 400, opacity: 0`) then calls `goBack()` and resets position, mirroring the existing left-swipe advance logic.

---

## Feature 3: First-Login Onboarding Screen

**Detection:** After `exchangeCodeForSession` in `app/auth/callback/route.ts`, read `user.user_metadata?.target_language`. If unset, redirect to `/onboarding` instead of `/`.

**Page:** `app/onboarding/page.tsx` — client component.
- Rendered in English (hardcoded; target language is unknown at this point)
- Heading: "What are you learning?"
- Subtext: "Choose the language you want to practise. You can change this later in Settings."
- Two selectable cards: 🇦🇷 Spanish (Rioplatense · Argentine) and 🇳🇿 English (New Zealand English)
- "Get started →" button, disabled until a language is selected
- On confirm: calls `supabase.auth.updateUser({ data: { target_language: lang } })` then redirects to `/`

**Layout:** The onboarding page uses the existing `app/layout.tsx` shell but should not render `BottomNav` (user hasn't completed setup). `ConditionalBottomNav` already conditionally suppresses the nav on certain routes — add `/onboarding` to that list.

---

## Feature 4: Internationalisation

### `lib/i18n.ts`

- `UiLanguage` type: `'en' | 'es'`
- `inferUiLanguage(target: TargetLanguage): UiLanguage` — derives UI language from target
- `TRANSLATIONS: Record<UiLanguage, Record<string, string>>` — flat key/value dictionaries for all UI strings in both languages
- `t(key: string, lang: UiLanguage): string` — pure lookup function, returns key as fallback if missing

Translation keys cover all visible UI text, including:
- Navigation labels (`nav.home`, `nav.practice`, `nav.insights`, `nav.flashcards`, `nav.settings`)
- Page headings and subheadings
- Button labels (`button.addToPractice`, `button.addedToPractice`, `button.signOut`, `button.sendMagicLink`, etc.)
- Status and pipeline messages
- Error messages
- Settings labels (`settings.textSize`, `settings.targetLanguage`, `settings.account`)
- Flashcard hints (`flashcard.tapToReveal`, `flashcard.explainThis`)
- Upload/drop zone text
- Practice list strings
- Insights page text

### `components/LanguageProvider.tsx`

Client component wrapping the app. Provides `LanguageContext` with:
- `targetLanguage: TargetLanguage`
- `setTargetLanguage(lang: TargetLanguage): void` — updates React state immediately, then persists to Supabase in the background
- `t(key: string): string` — bound to the current `uiLanguage`

### `app/layout.tsx`

Calls `getAuthenticatedUser()` server-side to read `user_metadata.target_language`. Passes it as `initialTargetLanguage` prop to `LanguageProvider`. This prevents a flash-of-wrong-language on initial load. Unauthenticated users default to `'es-AR'` (English UI).

### Settings page

Removes its own `language` state and `updateLanguage` function. Uses `setTargetLanguage` from `useTranslation()` context instead. Because `setTargetLanguage` updates React state synchronously, all `t()` calls across the entire app re-render immediately when the user changes their target language — including the text-size preview wording in Settings itself.

### All other components

Replace every hardcoded UI string with a `t('key')` call via `useTranslation()`. All page and component files in this codebase are already `'use client'`, so no component-type changes are needed.

---

## Data Flow

```
app/layout.tsx (Server Component)
  └─ getAuthenticatedUser() → user_metadata.target_language
  └─ <LanguageProvider initialTargetLanguage={...}>
       └─ all client components via useTranslation()
            ├─ t('key') → TRANSLATIONS[uiLanguage][key]
            └─ setTargetLanguage(lang) → state update + Supabase persist
```

---

## Out of Scope

- URL-based locale routing (language is account-bound, not URL-bound)
- Translating Claude-generated content (annotations, explanations, flashcard text) — these remain in the language Claude generates them
- Adding further languages beyond English and Spanish
- Retroactively fixing existing en-NZ practice items in the database
