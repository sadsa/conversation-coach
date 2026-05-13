# Practice Session — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

## Overview

A deliberate-performance mode distinct from the conversational voice coach. The user speaks Spanish with an AI conversation partner for up to 5 minutes. At the end, the conversation transcript is passed directly to Claude for annotation. The user then reviews corrections in the existing session detail UI.

This bypasses AssemblyAI and R2 entirely — Gemini Live provides transcription in-stream, and the pipeline jumps straight from transcript to Claude analysis.

## Architecture

Five new pieces. Everything else (annotation review, Write flow, session detail UI) reused unchanged.

### 1. `voice-agent.ts` — transcription support

Add `transcription?: boolean` to `ConnectOptions`. When true:
- Include `inputTranscription: { enabled: true }` and `outputTranscription: { enabled: true }` in the Gemini setup message.
- Add `onTranscript?: (role: 'user' | 'model', text: string) => void` to `VoiceAgentCallbacks`.
- Accumulate incremental text deltas per turn; fire `onTranscript` once on `turnComplete: true`.

Add `buildPracticeSystemPrompt(targetLanguage: TargetLanguage): string` alongside the existing `buildSystemPrompt()`. Practice prompt instructs Gemini to act as a native Rioplatense conversation partner — natural responses, short turns, no mid-conversation corrections.

### 2. `app/practice/page.tsx`

Thin RSC. Auth check only. Renders `<PracticeClient>`.

### 3. `components/PracticeClient.tsx`

Client island. Owns all practice session state. Completely separate from `VoiceController` — `VoiceController` is not touched.

State machine:
```
idle → connecting → active → [warning at 4:00] → ending → analysing → redirect
                                                         ↑
                                             (user clicks End early)
```

Responsibilities:
- Calls `connect()` from `voice-agent.ts` with `transcription: true`
- Collects `TranscriptTurn[]` via `onTranscript` callback
- Runs a `setInterval` timer; at 240 s shows warning; at 300 s calls `end()`
- On session end, `POST /api/practice-sessions` with collected turns
- Shows full-screen spinner during analysis ("Reviewing your conversation…")
- On success, `router.push('/sessions/[id]')`
- Sets `document.body.dataset.practiceActive = 'true'` while session is active; clears on unmount. `VoiceTrigger` reads this to hide itself — no new context needed.

### 4. `app/api/practice-sessions/route.ts`

`POST` only. Body: `{ turns: TranscriptTurn[], targetLanguage: TargetLanguage }`.

Steps (synchronous — client waits):
1. Auth check via `getAuthenticatedUser()`.
2. Validate: at least one user turn present; reject otherwise.
3. Insert session row: `session_type: 'voice_practice'`, `status: 'analysing'`, title auto-generated as `"Practice — 11 May"`.
4. Insert `transcript_segments`: user turns → `speaker: 'A'`, model turns → `speaker: 'B'`. `start_ms`/`end_ms` derived from consecutive `wallMs` deltas (first turn starts at 0). `paragraph_breaks: []`.
5. Call `analyseUserTurns()` from `lib/claude.ts` — receives all segments, annotates speaker A turns only.
6. Insert annotations.
7. Set session `status: 'ready'`.
8. Return `{ session_id }`.

On any failure after the session row is created: set `status: 'error'` (existing sessions list handles error rows gracefully). Return error to client.

### 5. `supabase/migrations/` — one new migration

```sql
ALTER TABLE sessions
  ADD COLUMN session_type text NOT NULL DEFAULT 'upload'
  CHECK (session_type IN ('upload', 'voice_practice'));
```

No other schema changes.

## Data Types

```ts
interface TranscriptTurn {
  role: 'user' | 'model'
  text: string
  wallMs: number  // Date.now() when turn completed — used for segment timestamps
}
```

## Navigation

- Add Practice tab to `NAV_TABS` in `nav-tabs.tsx` (between Home and Write). Uses mic or waveform icon.
- `BottomNav` and `NavDrawer` auto-pick up from `NAV_TABS`.
- No `HIDDEN_ON` change needed — `/practice` is auth-guarded by middleware.
- No `middleware.ts` matcher change needed.

## Practice Page UX

**`idle`**: Description of the mode, a single "Start" button, note that the session is up to 5 minutes long.

**`connecting`**: Button becomes spinner. Mic permission requested.

**`active`**: Visible count-up timer. "End session" button always visible. Mic activity indicator (reuse waveform visual). Gemini speaks Rioplatense Spanish, keeps turns short.

**`warning`** (4:00): Toast or inline banner — "1 minute left". Conversation continues uninterrupted.

**`ending`** (5:00 or user click): Mic stops, WebSocket closes, turn collection freezes.

**`analysing`**: Full-screen spinner. Blocks navigation — `beforeunload` warns on browser nav; `Modal` confirmation on in-app nav attempt.

**Redirect**: `router.push('/sessions/[id]')` on success.

## Session Detail Compatibility

The existing `/sessions/[id]` page works without modification:
- `TranscriptView` renders speaker A (user) and speaker B (model) turns. Model turns show without annotations — expected.
- `paragraph_breaks: []` on all segments — already backward-compatible.
- The identify screen (`/sessions/[id]/identify`) is never reached — status goes directly to `'ready'`, bypassing `'identifying'`.
- Session title auto-generated; user can rename via existing `InlineEdit`.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Connection failure | Back to `idle`. Toast: "Couldn't connect — check your connection." Retryable. |
| Mic permission denied | Back to `idle`. Toast: "Microphone access required." Not retryable (browser setting). |
| WebSocket drops mid-session | Treat as early end. Submit whatever turns were collected. If zero turns, back to `idle` with toast. |
| Claude analysis fails | Show error state with "Try again" button (resubmits same `turns[]` from memory). Session row set to `status: 'error'`. |
| Zero user turns | Skip submission. Back to `idle`. Toast: "No speech detected." |
| User navigates away during `analysing` | `beforeunload` + in-app `Modal` confirmation. |

## What Is Explicitly Out of Scope

- Speaker identification screen (not needed — user is always speaker A)
- AssemblyAI / R2 (bypassed entirely for this session type)
- Paragraph break detection (not available without AssemblyAI)
- SRS scheduling (FSRS columns exist on `practice_items` but are not wired up — same as upload sessions)
- Playback of the practice audio (audio is never stored)
- Session length options (always 5 min max for now)
