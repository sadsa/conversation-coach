# Voice Widget — Design Spec

**Date:** 2026-05-02  
**Status:** Approved

---

## Overview

A persistent floating voice widget that appears on every protected screen in the app. Tapping the mic bubble opens a control pill, which starts a real-time voice conversation with an AI coach (via AssemblyAI Voice Agent API) centred on the user's unwritten practice item corrections. The user can navigate between corrections mid-conversation without dropping the call.

The goal is to replace the current manual workflow (trigger Gemini, share screen, configure prompt) with a single tap anywhere in the app.

---

## Scope

- A global `<VoiceWidget>` component rendered in the app layout
- AssemblyAI Voice Agent API integration (speech-to-speech WebSocket)
- Context-aware system prompt based on `targetLanguage` and focused correction
- Mid-conversation correction switching (no call restart)
- Mute and end controls
- No new pages, no chat transcript UI, no SRS/save actions in this version

Out of scope for this MVP:
- Voice commands for navigation ("next", "save this")
- Transcript display
- Saving notes or new practice items from a voice session
- Server-side token exchange (added when graduating to production)

---

## Architecture

### Component placement

`<VoiceWidget>` is added inside `ConditionalNav` (the component already wraps the app header, nav drawer, and bottom nav). It inherits the same auth and visibility rules — hidden on `/login`, `/auth`, `/access-denied`, `/onboarding`.

### New files

| File | Purpose |
|------|---------|
| `components/VoiceWidget.tsx` | Client component. Owns collapsed/expanded UI state, correction cursor, WebSocket lifecycle. |
| `lib/voice-agent.ts` | Thin wrapper around AssemblyAI Voice Agent WebSocket. Exports `connect(config)`, `updateFocus(correction)`, `setMuted(bool)`, `disconnect()`. |

### Modified files

| File | Change |
|------|--------|
| `components/ConditionalNav.tsx` | Render `<VoiceWidget>` within the layout |
| `.env.local` / `.env.local.example` | Add `NEXT_PUBLIC_ASSEMBLYAI_API_KEY` |

### Auth / API key

`NEXT_PUBLIC_ASSEMBLYAI_API_KEY` exposes the key to the browser. This is acceptable for the MVP because every protected route sits behind the Supabase auth middleware with an `ALLOWED_EMAILS` allowlist. The migration path to a server-issued short-lived token is a single endpoint swap in `lib/voice-agent.ts`.

---

## Data

### Loading practice items

On mount, `VoiceWidget` calls the existing `GET /api/practice-items` endpoint. It uses only items where `written_down: false`, sorted by default (importance desc). The first 10 items are loaded into the session context; the cursor starts at index 0.

No new API route is needed.

### Correction cursor

`VoiceWidget` maintains a `focusedIndex` state (0-based). ← / → buttons decrement / increment it. When `focusedIndex` changes, `voice-agent.ts` sends a mid-conversation config update to AssemblyAI replacing the "currently discussing" line in the system prompt — the call stays live.

---

## Voice Session

### Lifecycle

```
Tap mic (idle) 
  → connect() called with system prompt
  → WebSocket opens to AssemblyAI
  → pill expands to show ← mic → mute ✕
  → two-way audio begins

Tap ← / →
  → focusedIndex updates
  → updateFocus(correction) sends mid-conversation config update
  → agent shifts context, call continues

Tap mute
  → browser MediaStream audio track disabled
  → mic icon turns red
  → tap again to unmute

Tap ✕
  → disconnect() closes WebSocket
  → pill collapses to idle mic bubble
```

### System prompt

Selected by `targetLanguage` from the user's session (available via the existing `x-cc-user-target-language` middleware header, already exposed to client via Supabase session metadata).

**`es-AR` prompt:**
```
You are a Rioplatense Argentine Spanish coach.
Speak exclusively in Argentine Spanish with a Rioplatense accent.
Use voseo verb forms and natural everyday Rioplatense vocabulary.

The user has these corrections to review:
1. [original] → [correction] — [explanation]
... (up to 10 items)

Currently discussing: [original] → [correction]
[explanation]

Be conversational. Ask the user questions, give examples from everyday 
Argentine speech, and help them understand why the correction matters 
in natural Rioplatense usage.
```

**`en-NZ` prompt:**
```
You are a New Zealand English coach.
Speak exclusively in New Zealand English with a Kiwi accent and idioms.

The user has these corrections to review:
1. [original] → [correction] — [explanation]
... (up to 10 items)

Currently discussing: [original] → [correction]
[explanation]

Be conversational. Ask the user questions, give examples from everyday 
New Zealand speech, and help them understand why the correction matters 
in natural Kiwi usage.
```

---

## UI

### Idle state

A single mic bubble (48×48px, indigo background) floats bottom-left above the bottom nav bar — `position: fixed`, `bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 12px)`, `left: 14px`. No label, no count. Hidden when there are 0 unwritten practice items.

### Active state (pill expanded)

A dark frosted-glass pill appears, centred above the bottom nav, containing five icon controls left-to-right:

| Icon | Action |
|------|--------|
| ← chevron | Previous correction |
| → chevron | Next correction |
| Mic (indigo, centred, larger) | Active indicator / tap to mute |
| Mic-off | Mute toggle (turns mic red when muted) |
| ✕ | End session |

A small context label floats above the pill: `[n/total] [original] → [correction]` — tells the user which item is in focus without expanding the pill further.

### Muted state

The centred mic icon turns red with a red pulse ring. The mic-off icon dims (already active). Audio track is suspended.

### Error / reconnecting state

If the WebSocket drops, the pill shows a "Reconnecting…" label in place of the waveform. AssemblyAI preserves session context for 30 seconds. If reconnection fails, the widget collapses and shows a toast: "Voice session ended".

### Hidden states

Widget does not render on: `/login`, `/auth/*`, `/access-denied`, `/onboarding`. Widget mic bubble hidden (not removed from DOM) when there are no unwritten practice items — so the layout doesn't shift.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Mic permission denied | Toast: "Microphone access needed. Check browser settings." Widget stays collapsed. |
| WebSocket drop | Reconnecting state for up to 30s, then collapse + toast |
| API key missing | Widget hidden entirely; `console.error` in dev |
| 0 unwritten items | Mic bubble hidden |
| `GET /api/practice-items` fails | Widget hidden; silent fail (non-critical) |

---

## Testing

- Unit test `lib/voice-agent.ts`: mock WebSocket, verify `connect` sends correct initial config, `updateFocus` sends config update message, `disconnect` closes socket.
- Component test `VoiceWidget`: mock `voice-agent`, verify idle → active state transition on mic tap, pill renders with correct correction label, ← / → call `updateFocus` with correct item.
- No E2E test for the WebSocket itself in this MVP.

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_ASSEMBLYAI_API_KEY=<same value as ASSEMBLYAI_API_KEY>
```

Add to `.env.local.example` with a placeholder value.
