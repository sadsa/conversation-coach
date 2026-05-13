# Onboarding Tutorial Flow — Design Spec

**Date:** 2026-04-22  
**Status:** Approved

---

## Problem

New users land on the home screen after language selection with no guidance on how to get audio into the app. The `DashboardOnboarding` empty-state covers the workflow in text, but doesn't explain the two distinct upload methods (file picker and PWA share target), and disappears after the first upload before the user has internalised them.

---

## Goals

1. Teach both upload methods (file picker, WhatsApp share) before the user reaches the home screen for the first time.
2. Allow users to revisit the tutorial without digging through settings.
3. Keep the existing language-selection step intact.

---

## Approach

Extend `/onboarding` as a multi-step wizard driven by `useSearchParams`. No new routes. No middleware changes. No DB changes.

---

## Routing

| URL | Step | Audience |
|-----|------|----------|
| `/onboarding` | 0 — Language select | First-timers (existing behaviour) |
| `/onboarding?step=1` | 1 — Welcome / how it works | First-timers + revisit |
| `/onboarding?step=2` | 2 — Upload from file system | First-timers + revisit |
| `/onboarding?step=3` | 3 — Share from WhatsApp | First-timers + revisit |

A `revisit=true` query param distinguishes first-run from Settings re-entry:

- **First run:** step 0 → 1 → 2 → 3 → `router.push('/')`
- **Revisit:** starts at step 1 (language step hidden), finishes with `router.push('/settings')`

Navigation between steps uses `router.push` so the browser back button works correctly.

---

## Tutorial Steps

All three steps are mandatory — no skip affordance. Steps share a common shell component (`OnboardingStep`).

### Step 1 — Welcome

- **Progress:** dot 1 of 3 active (pill shape), dots 2–3 inactive
- **Illustration:** four-icon loop — 🎙️ Record → 📤 Upload → ✏️ Review → 📝 Write
- **Heading:** "Here's how it works"
- **Body:** "Record a conversation in Spanish, upload it here, and get gentle corrections on your speech. Save the ones worth remembering and write them down."
- **CTA:** "Next →"

### Step 2 — Upload from file system

- **Progress:** dot 2 of 3 active
- **Illustration:** mock of the "Upload audio" FAB pill with accepted file-type chips below (`.mp3`, `.m4a`, `.wav`, `.opus`)
- **Heading:** "Upload a recording"
- **Body:** "After a conversation, tap **Upload audio** to pick the file from your phone. It gets transcribed automatically — no extra steps."
- **CTA:** "Next →"

### Step 3 — Share from WhatsApp

- **Progress:** dot 3 of 3 active
- **Illustration:** static mock of an iOS share sheet, with the Conversation Coach app icon highlighted and ringed — green-tinted background to suggest the messaging context
- **Heading:** "Or share from WhatsApp"
- **Body:** "Got a voice note in WhatsApp? Hold it → tap **Share** → choose **Conversation Coach**. The audio uploads instantly."
- **CTA (first run):** "Let's go →" → `router.push('/')`
- **CTA (revisit):** "Done" → `router.push('/settings')`

The PWA `share_target` is already wired (`manifest.json` + `/share-target` route handler) — no backend changes needed for step 3.

---

## Progress Indicator

Three dots at the top of each tutorial step. Active dot stretches to a pill shape. Positioned between the app label and the step content. Not shown on step 0 (language select).

---

## `OnboardingStep` Component

New shared component for steps 1–3. Props:

```ts
interface OnboardingStepProps {
  step: 1 | 2 | 3          // controls active dot
  illustration: ReactNode   // slot for the step's visual
  heading: string
  body: string
  ctaLabel: string
  onNext: () => void
}
```

Renders: app label → progress dots → illustration box → heading + body → CTA button. No internal state.

---

## `DashboardOnboarding` Change

One addition: a quiet `"Revisit tutorial →"` text link at the bottom of the section, linking to `/onboarding?step=1&revisit=true`. Visible only while `DashboardOnboarding` is rendered (i.e., until the user's first upload). Uses `text-text-tertiary` + `hover:text-accent-primary` to stay subordinate to the step cards.

---

## Settings Integration

New **Help** section in `/settings/page.tsx`, inserted above the existing App/version section:

- Section heading: "Help" (uses the existing `text-xs font-semibold uppercase tracking-wide text-text-secondary` style)
- One row: "How to upload audio" → `<Link href="/onboarding?step=1&revisit=true">` — same border/bg/hover style as the Sign out button

No other Settings changes.

---

## i18n

New keys required in `lib/i18n.ts` (EN + ES-AR):

```
onboarding.step1.heading
onboarding.step1.body
onboarding.step2.heading
onboarding.step2.body
onboarding.step3.heading
onboarding.step3.body
onboarding.cta.next         → "Next →"
onboarding.cta.letsGo       → "Let's go →"
onboarding.cta.done         → "Done"
onboarding.revisitLink      → "Revisit tutorial →"
settings.help               → "Help"
settings.howToUpload        → "How to upload audio"
```

---

## Files Changed

| File | Change |
|------|--------|
| `app/onboarding/page.tsx` | Rewrite — add step routing, tutorial steps, revisit logic |
| `components/OnboardingStep.tsx` | New — shared shell for steps 1–3 |
| `components/DashboardOnboarding.tsx` | Add "Revisit tutorial →" link |
| `app/settings/page.tsx` | Add Help section with "How to upload audio" row |
| `lib/i18n.ts` | Add new keys (EN + ES-AR) |

---

## Out of Scope

- Animated GIF/video for the share step (static illustration only)
- Skip affordance (tutorial is mandatory for first-timers)
- Voice matching or automatic speaker detection changes
- Any DB or middleware changes
