# ADR 0008 — PWA install nudge as post-language-pick onboarding step

**Status:** Accepted  
**Date:** 2026-06-11

## Context

Sofi attempted to find the app in an app store rather than installing it via the browser's "Add to Home Screen" flow. The existing `IosInstallHint` — a small text line on the login page — is easy to overlook and covers iOS Safari only.

Three placement options were considered:

- **A** — Full-screen gate before login (blocks entry until dismissed)
- **B** — New onboarding step after language pick, skippable
- **C** — Prominent nudge on the login page (replacing the existing hint)

Android's `beforeinstallprompt` event means we can trigger the native install dialog directly rather than giving manual menu instructions, which changes the iOS vs Android UX meaningfully enough to warrant platform-specific branches.

## Decision

**Option B** — a new onboarding step inserted after the language pick, before the user lands on `/?welcome=true`.

- **After language pick, not before**: language is a permanent profile decision; install is a recommendation. Sequencing the meaningful config first, then the optional upgrade, matches the "you're set up, here's how to get the best experience" framing.
- **Skippable ("Maybe Later")**: the messaging is explicitly a recommendation, not a requirement. A hard gate contradicts that tone.
- **Mobile only**: iOS Safari and Android Chrome. Desktop PWA install is a weaker story and was not the reported problem.
- **Single component, two branches**: same layout and framing; iOS branch shows Safari share icon + screenshot + manual steps; Android branch shows a native install button (via `beforeinstallprompt`) + screenshot.
- **Real device screenshots** (`/public/install-{ios|android}-{light|dark}.png`): illustrating the actual OS UI removes ambiguity about where to tap.
- **Disappears once installed**: `navigator.standalone` (iOS) and `window.matchMedia('(display-mode: standalone)')` (Android) — step skipped entirely if already installed when onboarding runs.

## Consequence

Users who skip the onboarding step see a dismissible banner on `/` until they install or dismiss it (`cc:install-dismissed` localStorage key, same pattern as `cc:sheet-nav-hint:v1`). The banner also disappears once standalone mode is detected. Desktop users never see either surface.
