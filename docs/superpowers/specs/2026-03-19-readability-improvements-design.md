# Readability Improvements Design

**Date:** 2026-03-19
**Status:** Approved

## Problem

Two readability issues on the transcript page:

1. **Annotation highlights** use 25% opacity colours on a near-black (`#030712`) background, producing dark muddy tints that are nearly invisible. The `<mark>` element's browser defaults can also override text colour to black, causing black text on a dark background.
2. **Text is too small**, especially on mobile. Transcript text uses `text-sm` (14px) with no responsive scaling.

## Solution Overview

Four changes:

1. Fix annotation highlight contrast (new colour scheme)
2. Add a `/settings` page with a global font size control
3. Apply font scaling globally via root `font-size`
4. Change transcript segment layout from side-by-side to stacked

---

## 1. Annotation Highlight Contrast Fix

**File:** `components/AnnotatedText.tsx`

Replace the 25%-opacity `TYPE_CLASS` map with dark-tinted chips using Tailwind arbitrary value syntax:

```ts
const TYPE_CLASS: Record<string, string> = {
  grammar:     'bg-[#3b1a1a] text-[#fca5a5] decoration-[#f87171]',
  naturalness: 'bg-[#3b2e0a] text-[#fde68a] decoration-[#fbbf24]',
  strength:    'bg-[#0f2e1a] text-[#86efac] decoration-[#4ade80]',
}
```

The `<mark>` element className changes from `rounded-sm px-0.5` to `rounded-sm px-1` (slightly more padding — intentional, makes chips more legible). The explicit `text-[...]` class on the `<mark>` prevents browser UA stylesheet overrides from setting text colour to black.

---

## 2. Font Scaling Architecture

**Approach:** Override root `font-size` on `<html>`. Tailwind uses `rem` throughout, so all font sizes scale automatically with no component changes.

- **Range:** 14–22px in 2px steps (5 options: 14, 16, 18, 20, 22)
- **Default:** 16px
- **Persistence:** `localStorage` key `fontSize`

### FOUC mitigation

A `useEffect`-based component would flash at the default size for one frame. To prevent this, add an inline `<script>` in `<head>` (similar to the existing SW registration script) that applies the stored value synchronously before first paint:

```html
<script dangerouslySetInnerHTML={{ __html: `
  (function() {
    var s = localStorage.getItem('fontSize');
    if (s) document.documentElement.style.fontSize = s + 'px';
  })();
` }} />
```

### FontSizeProvider

**New file:** `components/FontSizeProvider.tsx` — `'use client'` component.

This component does **not** wrap children (to avoid converting the root Server Component layout to a client component). It renders `null` and uses `useEffect` to sync the localStorage value on navigation/hydration:

```tsx
'use client'
import { useEffect } from 'react'
export function FontSizeProvider() {
  useEffect(() => {
    const s = localStorage.getItem('fontSize')
    if (s) document.documentElement.style.fontSize = s + 'px'
  }, [])
  return null
}
```

Rendered as a sibling before `<main>` inside `<body>` in `app/layout.tsx` — not wrapping `<main>`:

```tsx
<body className="min-h-screen bg-gray-950 text-gray-100">
  {/* inline script for FOUC prevention */}
  <FontSizeProvider />
  <nav>...</nav>
  <main>...</main>
</body>
```

---

## 3. Settings Page

**New file:** `app/settings/page.tsx` — `'use client'` component.

### Layout

```
Settings
────────────────────────────
Text Size

  [−]  18px  [+]

Preview:
┌─────────────────────────────────────────┐
│ YOU                                     │
│ Hoy fui al mercado y compré muchas      │
│ cosas para la semana.                   │
│                                         │
│ THEM                                    │
│ ¿Y qué compraste?                       │
└─────────────────────────────────────────┘
```

### Behaviour

- `−` decrements by 2px (min 14, button disabled at limit). `+` increments by 2px (max 22, button disabled at limit).
- Each change immediately sets `document.documentElement.style.fontSize = newSize + 'px'` (live preview) and writes `localStorage.setItem('fontSize', String(newSize))`.
- The preview block duplicates the stacked transcript segment markup (same classes as `TranscriptView`) using hardcoded sample text. This is intentional duplication — the settings page is a standalone page and the preview is a simple, static mockup. If the transcript layout changes again, the preview should be updated alongside it.

### Nav link

Add "Settings" link to the nav in `app/layout.tsx` alongside "Practice Items".

---

## 4. Transcript Layout Change

**File:** `components/TranscriptView.tsx`

Change each segment from a `flex gap-4` row to a stacked block. The outer wrapper `<div>` drops its `flex gap-4` and becomes a plain `<div>` (block). The `opacity-40` class moves with the outer wrapper for "Them" segments.

**Speaker label** — replace `<span className="text-xs text-gray-500 w-14 text-right pt-0.5 shrink-0">` with:
```tsx
<p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
```

**Text block** — the `<span className="text-sm leading-relaxed">` becomes full-width (no offset needed).

**AnnotationCard indent** — change from `ml-6` to `ml-0` (no longer needs to offset the removed label column).

---

## Files Changed

| File | Change |
|---|---|
| `components/AnnotatedText.tsx` | New highlight colour scheme with explicit text colours |
| `components/TranscriptView.tsx` | Stacked segment layout |
| `components/FontSizeProvider.tsx` | New — syncs localStorage font size on mount |
| `app/settings/page.tsx` | New — settings page with font size control |
| `app/layout.tsx` | Inline FOUC-prevention script; mount FontSizeProvider; add Settings nav link |

## Files Not Changed

- `app/globals.css` — no changes needed
- `tailwind.config.ts` — no changes needed
- All API routes, DB schema, Supabase, R2 — unaffected

---

## Non-Goals

- No server-side persistence of font preference
- No dark/light theme toggle
- No per-component font size overrides
