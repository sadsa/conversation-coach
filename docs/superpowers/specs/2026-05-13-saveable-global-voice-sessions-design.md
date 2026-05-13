# Saveable Global Voice Sessions — Design Spec

**Date:** 2026-05-13
**Status:** Approved for implementation

## Summary

When a user ends a global voice session (started from any page outside `/practice`), if they spoke at least one turn they are prompted to save the conversation. On save, the session is processed identically to a practice session — POSTed to `/api/practice-sessions`, analysed by Claude for corrections, and the user is navigated to the resulting `/sessions/[id]` page.

---

## Context

The app currently has two separate voice surfaces:

1. **`/practice`** — a dedicated 5-minute practice page (`PracticeClient`) with a full-screen UI, live transcript, timer, and a save/discard review flow.
2. **Global voice coach** — started from the `VoiceTrigger` chip in `AppHeader`, available on any page. Used for discussing corrections. Currently ephemeral — no transcript is collected and nothing is saved when the session ends.

This feature makes the global voice coach saveable, closing the gap between the two surfaces.

---

## Decisions

| Question | Decision |
|---|---|
| Save prompt location — mobile | `DockedSheet` slides up from the bottom (no scrim). Same pattern as `AnnotationSheet` / `WriteSheet`. |
| Save prompt location — desktop | `VoiceStrip` morphs in place from 44px to 88px review state. |
| Live transcript visible during session? | No. Turns accumulate in a ref; nothing renders mid-session. |
| After save, navigate to session? | Yes. `router.push('/sessions/[id]')` — same behaviour as practice. |
| Resume option? | Yes. Consistent with practice's review screen. |
| Exchange count shown in prompt? | No. Duration only (`3 min 42 sec`). |
| Backend changes? | None. Reuses `POST /api/practice-sessions` unchanged. |

---

## Architecture

### Approach: `useVoiceSave` orchestration hook

A new `useVoiceSave` hook wraps `useVoiceController`. `ConditionalNav` calls `useVoiceSave` instead of `useVoiceController` directly. The hook owns turn collection, session timing, and review state. `useVoiceController` stays focused on the WebSocket/audio transport layer.

```
voice-agent.ts  →  useVoiceController (transport)
                        ↓
                   useVoiceSave (orchestration: turns, timing, review)
                        ↓
                   ConditionalNav (renders VoiceStrip + VoiceReviewSheet)
```

---

## Files Affected

| File | Change |
|---|---|
| `components/VoiceController.tsx` | Accept optional `transcriptConfig?: { onTurn: (role, text) => void }`. Pass `{ transcription: true, onTranscript }` to `connect()` as 5th arg when provided. |
| `components/VoiceSave.tsx` | **New.** `useVoiceSave` hook + `VoiceReviewSheet` component (see below). |
| `components/VoiceStrip.tsx` | Add `reviewMode` prop. When set, strip height grows to 88px and renders save/discard/resume controls instead of mute/end. |
| `components/ConditionalNav.tsx` | Replace `useVoiceController()` call with `useVoiceSave()`. Wire review sheet and strip review mode. |
| `lib/i18n.ts` | Add `voiceSave.*` translation keys. |

`VoiceWaveMode` and `BottomBar` are **unchanged** — when the session ends the mobile bar exits as today; the review `DockedSheet` opens independently.

---

## `useVoiceSave` Hook

Returned interface extends `VoiceController`:

```typescript
export interface VoiceSaveController extends VoiceController {
  reviewState: 'idle' | 'review' | 'analysing' | 'error'
  durationSecs: number
  save: () => Promise<void>
  discard: () => void
  undoDiscard: () => void
  resume: () => void
  discardToast: { key: number } | null
}
```

### State machine

```
idle → connecting → active/muted
                        ↓ user clicks End (or agent disconnects)
                    review                 ← no user turns → idle (skip)
                    ↙         ↘        ↘
               analysing    idle       connecting  (resume)
                    ↓       (discard,     ↓
              /sessions/[id]  5s undo)  active/muted → review again
```

### Turn collection

- `turnsRef: React.MutableRefObject<TranscriptTurn[]>` — accumulates turns during the live session. Plain ref, no React state — zero re-renders mid-session.
- `startedAtMs: React.MutableRefObject<number | null>` — set when `controller.state` transitions to `'active'` (not on first `onTurn` — the model may speak before the user does); cleared on session end.
- On session end: snapshot `turnsRef.current` to `frozenTurnsRef.current`. Compute `durationSecs`. If no user turns, skip review and return to idle.

### End detection

Watch `controller.state` in a `useEffect`. When transitioning from `'active' | 'muted'` → `'idle'`, check for user turns and open review.

### Resume

1. Restore `turnsRef.current = [...frozenTurnsRef.current]`
2. Set `reviewState` to `'idle'`
3. Call `controller.start()` — new WebSocket session; subsequent `onTurn` callbacks append to the restored `turnsRef`
4. When the resumed session ends, the same end-detection fires and opens review again with all accumulated turns

---

## `VoiceReviewSheet` Component

Wraps `DockedSheet`. Mobile-only (`md:hidden`). No swipe-to-dismiss (prevents accidental loss of turns).

```
┌────────────────────────────────┐
│  ▔▔▔  (handle)                 │
│                                │
│  Save this conversation?       │  ← text-base, semibold
│  3 min 42 sec                  │  ← text-xs, text-tertiary, tabular-nums
│                                │
│  [Save & analyse] [Discard]    │  ← Button primary / secondary
│                                │
│     ↩ Resume conversation      │  ← text-xs text-link
└────────────────────────────────┘
```

No sub-copy line. Heading + duration + actions is sufficient — the button label communicates what saving does.

Props: `{ open, durationSecs, onSave, onDiscard, onResume, saving }`

During `saving`: primary button shows spinner + "Analysing…", both buttons disabled.

---

## `VoiceStrip` Review Mode (Desktop)

New props added to `VoiceStrip`:

```typescript
reviewMode?: {
  durationSecs: number
  onSave: () => void
  onDiscard: () => void
  onResume: () => void
  saving: boolean
}
```

When `reviewMode` is set:
- Strip height transitions from `2.75rem` → `5.5rem` (CSS transition on `height`, 320ms `ease-out-expo`)
- `--voice-strip-height` CSS variable is updated to `5.5rem` via `document.documentElement.style.setProperty` inside a `useEffect` watching `reviewMode` — same pattern used by the existing mount/unmount logic. Cleared back to `2.75rem` when review closes.
- Controls row cross-fades out; review row cross-fades in (opacity transition delayed 180ms so it starts after height settles)

Review row layout (single horizontal row):

```
[dots — frozen/static] Save this conversation?  3 min 42 sec   [↩ Resume] [Discard] [Save & analyse]
```

On `saving`: "Save & analyse" → spinner + "Analysing…", buttons disabled.

---

## API

No changes. Reuses `POST /api/practice-sessions`:

```json
{ "turns": [...TranscriptTurn], "targetLanguage": "es-AR" }
→ { "session_id": "uuid" }
```

Claude's analysis handles mixed-language conversations — it annotates target-language speech and ignores English meta-discussion.

---

## i18n Keys

Added to `lib/i18n.ts` under `voiceSave.*`:

| Key | English | Spanish |
|---|---|---|
| `voiceSave.heading` | Save this conversation? | ¿Guardar esta conversación? |
| `voiceSave.save` | Save & analyse | Guardar y analizar |
| `voiceSave.discard` | Discard | Descartar |
| `voiceSave.resume` | ↩ Resume conversation | ↩ Reanudar conversación |
| `voiceSave.discardToast` | Conversation discarded | Conversación descartada |
| `voiceSave.discardUndo` | Undo | Deshacer |
| `voiceSave.errorSave` | Couldn't save — try again | No se pudo guardar, intenta de nuevo |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No user turns at session end | Skip review entirely; close cleanly |
| Session ends during `connecting` | No turns; skip review |
| `POST /api/practice-sessions` fails | Toast "Couldn't save — try again" with retry action; sheet/strip stays open, buttons re-enabled |
| User navigates away during `analysing` | `beforeunload` warning — same guard as `PracticeClient` |

---

## Edge Cases / Constraints

- **`/practice` suppression unchanged.** `PracticeClient` sets `document.body.dataset.practiceActive = 'true'` while active; `useVoiceController.start()` already returns early when this is set. Global voice cannot start while practice is running.
- **No timer.** Unlike practice, global voice sessions have no countdown. Duration is measured from first `onTurn` callback to session end (wall clock).
- **Transcription flag.** `connect()` is called with `{ transcription: true }` when `transcriptConfig` is provided. The Gemini Live API charges for transcription — this is now always on for global sessions (matches practice behaviour).
- **`VoiceWaveMode` unchanged.** The mobile bottom bar exits as today when the session ends. The review `DockedSheet` is a separate component that opens after the bar has exited.
