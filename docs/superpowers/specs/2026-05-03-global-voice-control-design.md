# Global Voice Control — Design Spec

**Date:** 2026-05-03
**Status:** Approved
**Supersedes:** [`2026-05-02-voice-widget-design.md`](./2026-05-02-voice-widget-design.md) — that spec scoped voice to `/write` only with practice-item context. This one promotes voice to a system-level surface available on every authenticated route.

---

## Overview

Promote the voice coach from a `/write`-only floating FAB to a global, header-anchored control. The user can ask the Conversation Coach for help on any authenticated page; the session survives navigation; on `/write` and `/sessions/[id]` the agent receives a one-line "where you are" hint so it can open with a useful question.

The pattern is modelled on WhatsApp's "Out of Chat Playback" strip: a small persistent trigger lives in the app header, and an active session expands into a thin status strip that pushes content down. When the session ends, the strip retracts and the trigger returns to its idle resting state.

---

## Goals

- One trigger surface across every authenticated route on both mobile and desktop.
- Active session persists across in-app navigation; the user can start on `/write`, walk to `/sessions/123`, and keep talking.
- The agent has a sense of *where* the user is (route-level hint) without scraping page content.
- The current `/write`-specific FAB and its practice-item-as-system-prompt behaviour go away.

## Non-goals

- Page content is **not** sent to the agent. No transcript scraping, no annotation injection, no flashcard list. Just a single sentence of route hint.
- No new pages, no chat transcript UI, no voice-commanded actions ("save this" / "next").
- No mid-session context updates. The route hint is locked at connect time.
- No background-when-tab-hidden persistence. The session survives in-app navigation only — closing the tab still ends the call.

---

## Architecture

### Component placement

The voice surface is mounted inside `ConditionalNav` (which is itself rendered from `app/layout.tsx`'s root `<body>`). `ConditionalNav` is therefore the natural home for state that must out-live route transitions: it is mounted once for the whole authenticated app, and unmounts only on sign-out / on entering an auth-public route.

The active session lives in a new `useVoiceController()` hook inside `ConditionalNav`. The hook owns:
- The `VoiceAgent` instance (WebSocket, AudioContext, mic stream).
- The state machine: `idle` → `connecting` → `active` ↔ `muted` → `idle`.
- The audio-flow RMS refs that drive the indicator dot.

The hook hands its state and handlers to two presentational components: a `VoiceTrigger` rendered inside `AppHeader`'s right cluster, and a new `VoiceStrip` rendered as a sibling between `AppHeader` and `<main>`.

### New files

| File | Purpose |
|------|---------|
| `components/VoiceController.tsx` | `useVoiceController` hook. State, lifecycle, refs. No UI. |
| `components/VoiceTrigger.tsx` | Header mic button. Three visual states (idle / connecting / hidden-while-active). |
| `components/VoiceStrip.tsx` | The 44px status strip. Rendered conditionally when the controller is `active` or `muted`. |

### Modified files

| File | Change |
|------|--------|
| `components/ConditionalNav.tsx` | Mount `useVoiceController`. Pass its handle into `AppHeader` (for the trigger) and render `VoiceStrip` as a sibling of the header. Drop the `/write`-only practice-items fetch. |
| `components/AppHeader.tsx` | Accept a `voice` prop carrying state + handlers. Render `<VoiceTrigger>` in the right cluster. While active, hide both the trigger and the section label (the strip beneath already announces context). |
| `app/globals.css` | Add `--voice-strip-height` CSS variable on `:root`, default `0px`. The controller writes `2.75rem` while active. |
| `app/layout.tsx` | `<main>`'s `padding-top` becomes `calc(var(--header-height) + var(--voice-strip-height) + env(safe-area-inset-top))`. |
| `lib/voice-agent.ts` | `connect()` signature: items become optional (default `[]`); add optional `routeContext: VoiceRouteContext`. |
| `lib/i18n.ts` | Strings: `voice.startLabel` (existing), `voice.coachTitle`, `voice.languagePill.esAR`, `voice.languagePill.enNZ`, `voice.startCoachmark`. |

### Removed files

| File | Why |
|------|-----|
| `components/VoiceWidget.tsx` | Its agent-lifecycle logic moves into `useVoiceController`; its FAB chrome is replaced by `VoiceTrigger` + `VoiceStrip`. |
| `__tests__/components/VoiceWidget.test.tsx` | Replaced by tests against `VoiceController`, `VoiceTrigger`, `VoiceStrip`. |

---

## UI

### Trigger (idle)

A 28px circular button in `AppHeader`'s right cluster, immediately to the left of the existing theme toggle. Same chrome as the toggle (`border-subtle`, `bg-surface`), but the mic glyph itself is `text-accent-primary` so the eye finds it on first scan. The button has a 44px outer hit-area for AAA touch-target compliance, identical to the theme toggle's pattern.

ARIA label: `t('voice.startLabel')` ("Start voice coach" / "Iniciar coach de voz").

### Trigger (connecting)

The mic glyph is replaced with a `spinner` icon (already in `Icon.tsx`), the button gets `aria-busy={true}`, and `disabled` to prevent double-clicks. Layout is unchanged. Connecting is typically <1s.

### Trigger (active)

The trigger button is unmounted while the strip is up. The strip itself is the affordance — having both creates a "two mute buttons" problem.

### Strip

44px-tall element rendered as the immediate next sibling of `AppHeader`. Backed by `color-mix(in oklch, var(--color-surface-elevated) 92%, var(--color-accent-primary) 8%)` so it reads distinct from the neutral header without shouting. Bottom border `border-subtle` matches the header's.

Strip contents, left → right:
1. **Audio-flow dot.** The existing `voice-indicator` element from `globals.css`, with its `data-speaker` and `data-muted` attributes driven by the controller's RMS refs. Reduced-motion users get the colour change but no scale animation.
2. **Title.** Static label `t('voice.coachTitle')` ("Voice coach" / "Coach de voz") in `text-text-primary`, 12px, weight 500.
3. **Language pill.** Compact uppercase chip showing `ES-AR` or `EN-NZ`, derived from the user's `targetLanguage`. Uses `--color-chip-bg` / `--color-chip-text` so it sits inside the existing chip vocabulary.
4. **Spacer.** Pushes the action cluster to the right.
5. **Mute toggle.** 28px circle, same neutral chrome as other action buttons. `aria-pressed` flips when muted; while pressed, the icon swaps to `mic-off` and the background tints with `--color-error-bg`.
6. **End.** 28px circle, neutral chrome. `close` icon. Calls `disconnect()`.

On desktop, the strip stretches the full viewport width but its inner row tracks the same `max-w-2xl mx-auto` reading column the header inner row already uses, so the dot lines up vertically with the section label that was visible immediately before activation.

### Layout shift

`<main>` reads `padding-top: calc(var(--header-height) + var(--voice-strip-height, 0px) + env(safe-area-inset-top))`. The controller writes `--voice-strip-height: 2.75rem` to `document.documentElement.style` while `state` is `active` or `muted`, and clears it (`removeProperty`) on idle.

The strip itself is `position: fixed; top: calc(var(--header-height) + env(safe-area-inset-top))`. Its mount/unmount is animated via `framer-motion` (already in deps): `initial={{ y: -44 }} animate={{ y: 0 }} exit={{ y: -44 }} transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}`. `useReducedMotion()` (also already in deps) clamps the duration to 0 so reduced-motion users get the snap.

The padding-top jump on `<main>` happens in lockstep with the strip's slide because the CSS variable is written in the same React tick as the state flip.

---

## State machine

```
       ┌────────┐  start()    ┌────────────┐  on setupComplete  ┌──────────┐
       │  idle  │ ──────────► │ connecting │ ─────────────────► │  active  │
       └────────┘             └────────────┘                    └──────────┘
            ▲                       │                               │  ▲
            │ disconnect /          │ on error / on permission denied│  │ mute()
            │ ws close              ▼                               ▼  │
            └─────────────────  toast + back to idle  ◄─────────  ┌────────┐
                                                                  │ muted  │
                                                                  └────────┘
                                                          unmute() ▲ │
                                                                   └─┘
```

Identical to the existing `VoiceWidget` machine — it just lives in a hook now.

---

## Page-context hint

### Type

```ts
// lib/voice-agent.ts
export type VoiceRouteContext =
  | { kind: 'write' }
  | { kind: 'session'; sessionTitle: string }
  | { kind: 'other' }
```

### Derivation

Inside `useVoiceController`, the route context is computed at the moment `start()` is called. This pin-at-connect-time choice is deliberate: if the user navigates to a different route mid-session, the agent's mental model of "where you are" doesn't whiplash.

```ts
function deriveRouteContext(pathname: string, sessionTitle?: string): VoiceRouteContext {
  if (pathname.startsWith('/write')) return { kind: 'write' }
  if (pathname.startsWith('/sessions/') && sessionTitle) return { kind: 'session', sessionTitle }
  return { kind: 'other' }
}
```

Session title: when navigating into `/sessions/[id]`, the `TranscriptClient` writes the title to `window.__ccSessionTitle` (a small global) on mount and clears it on unmount. The controller reads it lazily inside `start()`. A global is acceptable here because the controller lives above the route — neither React context nor the URL alone surfaces the session title cleanly, and a global avoids prop-drilling through the layout.

### Prompt addendum

`buildSystemPrompt(targetLanguage, items, routeContext)` appends one sentence after the existing `itemList` block:

| Route kind | Sentence |
|------------|----------|
| `write` | "The user is currently looking at their Write list — saved corrections they want to internalise." |
| `session` (es-AR) | `El usuario está repasando la conversación titulada '${sessionTitle}'.` |
| `session` (en-NZ) | `The user is currently reviewing the conversation titled '${sessionTitle}'.` |
| `other` | (nothing appended) |

When `items` is empty and `routeContext` is `other`, the prompt explicitly tells the agent: "The user has not given you a specific topic. Greet them briefly and ask how you can help." This replaces the `items.length === 0 → return null` short-circuit in the current widget.

---

## Lifecycle

### Connect

`start()` is fired by `VoiceTrigger`. The hook:
1. Sets state to `connecting`.
2. Derives `routeContext` from `usePathname()` + `window.__ccSessionTitle`.
3. Calls `connect(targetLanguage, [], { onStateChange, onError, onUserAudio, onAgentAudio }, routeContext)`.
4. On `onStateChange('active')` → state becomes `active`, plays the existing C5→G5 ready chime.

### Persist across navigation

`ConditionalNav` is mounted once at the layout level and is **not** unmounted on route changes. The hook's `agentRef` survives. The strip and trigger re-render on each route change but the WebSocket and AudioContext don't bounce.

### Disconnect

Triggered by:
- User clicks End on the strip.
- `ConditionalNav` unmounts. `useEffect` cleanup calls `agent.disconnect()`. This covers sign-out, navigation to `/login`/`/onboarding`/`/access-denied`, and tab close.
- Mic stream ends unexpectedly (browser-level revocation). The existing `ws.close` handler already fires `onStateChange('ended')`.

Cancelling a session that's still in `connecting` is **not** supported in v1. The trigger is `disabled` while connecting and the keyboard listener (Esc / Space) is only mounted while `state ∈ {active, muted}` — same as today. Connecting is typically <1s; if it fails, the existing error path returns the user to idle.

### Audio context across routes

The `AudioContext` is created once inside `connect()` and torn down inside the WebSocket `close` handler. Because `ConditionalNav` survives navigation, the context doesn't get GC'd by the route transition. No change needed here vs. the current `voice-agent.ts`.

---

## Accessibility

- **Trigger:** `aria-label`, `aria-busy` while connecting.
- **Strip:** wrapped in `role="region"` with `aria-label={t('voice.regionAria')}`. Inside it the actions group is `role="toolbar"` with its own aria-label (parity with the current widget).
- **Live region:** an `aria-live="polite"` element inside the strip announces the connection event once (`t('voice.connectedAnnouncement')`). Mute / unmute do not announce — `aria-pressed` on the mute button already conveys that state to assistive tech, and a polite live region firing every toggle would be noisy.
- **Keyboard:** Esc ends, Space toggles mute. The keydown listener is mounted at the document level by the hook but is only active while `state ∈ {active, muted}` — same gate as today's widget. Inputs / textareas / contenteditable are still ignored.
- **Reduced motion:** strip slides at duration 0; the audio-flow dot's scale animation is suppressed by the existing `prefers-reduced-motion` check in `globals.css`.
- **Focus:** when the strip mounts, focus is **not** moved automatically. The user is mid-task (reading, typing) — yanking focus into a status strip would interrupt them. The mute and end buttons are still in the natural tab order.
- **Touch targets:** all interactive elements maintain 44px hit areas via padding (the visual circle is 28px, the hit area is 44px), matching the theme toggle.

---

## Errors

Inherits the existing error handling from `VoiceWidget`:
- Mic permission denied → toast `t('voice.micPermission')`, state returns to idle.
- WebSocket error / disconnect → toast `t('voice.sessionEnded')`, state returns to idle.
- Voice-token endpoint failure → toast `t('voice.sessionEnded')` (generic; the endpoint failing is rare and we don't want to leak server-side failure modes to the user).

The toast component is already mounted via `ConditionalNav`; the controller hands it a message via the existing `Toast` integration.

---

## First-run discoverability

A one-shot coachmark over the trigger on first authenticated load. Mirrors the existing `UploadCoachmark` pattern:
- Storage key: `cc:voice-trigger-coachmark:v1`.
- Dismissed on first interaction (tap, focus, or 8s timeout).
- Copy: `t('voice.startCoachmark')` ("Ask the coach anything" / "Pregúntale al coach").
- Mobile-only (`md:hidden`); on desktop the trigger sits next to the theme toggle in plain view, no coachmark needed.

---

## i18n

New keys added to `lib/i18n.ts`:

| Key | en-NZ | es-AR |
|-----|-------|-------|
| `voice.coachTitle` | "Voice coach" | "Coach de voz" |
| `voice.languagePill.esAR` | "ES-AR" | "ES-AR" |
| `voice.languagePill.enNZ` | "EN-NZ" | "EN-NZ" |
| `voice.startCoachmark` | "Ask the coach anything" | "Pregúntale al coach" |
| `voice.regionAria` | "Voice coach session" | "Sesión con el coach de voz" |
| `voice.connectedAnnouncement` | "Voice coach connected" | "Coach de voz conectado" |

Existing keys (`voice.startLabel`, `voice.connecting`, `voice.muteAria`, `voice.unmuteAria`, `voice.endAria`, `voice.micPermission`, `voice.sessionEnded`, `voice.indicatorIdle`, `voice.indicatorMuted`, `voice.toolbarAria`) are reused as-is. `voice.indicatorIdle` and `voice.indicatorMuted` are no longer surfaced via a live region — they remain available for screen-reader-only labels on the indicator dot.

---

## Tests

### Unit

- **`buildSystemPrompt`** — given each of `{ kind: 'write' }`, `{ kind: 'session', sessionTitle }`, `{ kind: 'other' }`, asserts the appended sentence is correct in both `es-AR` and `en-NZ`. Asserts `kind: 'other'` with empty items appends the "no specific topic" instruction.

### Component

- **`VoiceTrigger`** — renders mic glyph when idle; spinner + `aria-busy` when connecting; not rendered at all when active. Click in idle calls `onStart`. Disabled when connecting.
- **`VoiceStrip`** — only renders when `state` ∈ `{active, muted}`. Renders correct language pill from `targetLanguage`. Mute click flips `aria-pressed`. End click calls `onEnd`. Reads `--voice-strip-height` is set to `2.75rem` on mount and removed on unmount.
- **`useVoiceController`** — happy path: idle → start → connecting → active → mute → unmute → end → idle. State transitions fire callbacks correctly. WebSocket cleanup on unmount.

### Integration

- **Cross-route persistence** — render `ConditionalNav` inside a test router. Start a session on `/write`. Navigate to `/sessions/abc`. Assert that the agent's `disconnect` was NOT called and the strip is still rendered.
- **Sign-out cleanup** — unmount `ConditionalNav`. Assert `disconnect` is called exactly once.
- **Permission denied** — mock `getUserMedia` to reject. Assert state returns to idle and the toast surfaces with `voice.micPermission`.

### Mocks

The existing `lib/voice-agent.ts` mock setup in `__tests__/components/VoiceWidget.test.tsx` is moved to `__tests__/test-utils/voice-agent-mock.ts` so the new controller and component tests can share it.

---

## Migration & rollout

The change is shipped as one PR (no feature flag — the surface is small enough). The PR:
1. Lands the new components, hook, and `voice-agent.ts` signature change.
2. Removes `VoiceWidget.tsx` and its test.
3. Removes the `/write`-only practice-items fetch from `ConditionalNav`.
4. Updates `app/layout.tsx`'s `<main>` padding rule.
5. Updates `globals.css` to declare `--voice-strip-height: 0px` on `:root`.

Manual smoke check before merge:
- Start session on `/`, navigate to `/write`, then `/sessions/<id>`, end. Session survives both transitions, audio plays uninterrupted.
- Permission flow on a fresh browser profile.
- Reduced-motion: strip snaps in/out, no slide.
- Mobile Safari PWA: safe-area insets respected (status bar tint, bottom nav clearance).

---

## Open questions

None — all decisions made during brainstorming are captured above. Anything that comes up during implementation will be raised in the implementation plan.

---

## Future work

- **Voice-commanded actions** — "save this", "next correction", "mark as written down". Out of scope here. Would require a server-side parser on the agent's text output channel (not currently surfaced).
- **Background-tab persistence** — keeping the AudioContext alive when the tab is hidden. Browsers throttle hidden tabs, so this needs a wake-lock + service-worker dance that's not worth the complexity yet.
- **Page content awareness** — phase 3. If the route hint isn't enough, we can selectively pass annotation IDs / segment text on `/sessions/[id]`. Will need a new content-extraction layer per route.
- **Multi-session memory** — at present each session is stateless. A future iteration could persist a short rolling summary across sessions so the coach remembers what the user was working on yesterday.
