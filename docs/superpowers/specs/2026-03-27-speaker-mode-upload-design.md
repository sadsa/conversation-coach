# Speaker Mode Upload — Design Spec

## Problem

AssemblyAI is submitted with `speakers_expected: 2` for all uploads. This biases the model toward finding two speakers even in solo recordings (e.g. WhatsApp voice messages), causing the speaker identification screen to appear unnecessarily.

## Solution

Let the user declare the recording type before upload begins. This removes the bias and eliminates false-positive identification screens.

## UX Flow

### File selection (any source)

When a file is selected — via the file picker, drag-and-drop, or the PWA share target (WhatsApp) — the drop zone is **replaced** by a pending upload card. The upload does **not** start automatically.

The pending card shows:
- File name and size
- A **Recording type** toggle: `Solo` | `Conversation` (inline-flex, sized to content, defaults to `Solo`)
- When **Conversation** is selected: a **Speakers** row appears with pill buttons `2 | 3 | 4 | 5+` (defaults to `2`). The `5+` pill sends `speakers_expected: 5` to AssemblyAI (the API's practical maximum for accurate diarization).
- **Dismiss** button — clears the pending file and restores the drop zone
- **Upload →** button — begins the upload with the chosen settings

The card uses the violet highlight style (`bg: #1e1b4b`, `border: #4c1d95`) for both conventional and share-target uploads. There is no visual distinction between upload sources.

### After dismiss

Tapping Dismiss clears `pendingFile` state. The drop zone reappears in its normal state.

### PWA share target

`readPendingShare()` currently calls `handleFile` immediately. It will instead set `pendingFile` state, which renders the card — giving the user a chance to set the mode before the upload begins. The last-used `speakerMode` is persisted to `localStorage` and pre-selected when the card appears.

## Data Flow

```
User confirms → POST /api/sessions/:id/upload-complete
  body: { duration_seconds, speaker_mode: 'solo' | 'conversation', speakers_expected: 1 | 2 | 3 | 4 | 5 }
  → createJob(audioUrl, speakersExpected)
  → AssemblyAI: speakers_expected = 1 (solo) or N (conversation)
```

- `Solo` → `speakers_expected: 1` → AssemblyAI returns 1 speaker → webhook auto-skips identify screen
- `Conversation` → `speakers_expected: N` → webhook behaves as today

No DB schema changes. `speakers_expected` is passed straight through to AssemblyAI and not stored.

## Changes Required

### `app/page.tsx`
- Add `pendingFile: File | null` state (replaces immediate `handleFile` call)
- Add `speakerMode: 'solo' | 'conversation'` state, defaulting to `'solo'`, persisted in `localStorage`
- Add `speakersExpected: number` state (default `2`, only relevant when `speakerMode === 'conversation'`)
- `handleFile` sets `pendingFile` instead of starting the upload
- `readPendingShare()` sets `pendingFile` instead of calling `handleFile`
- New `handleConfirmUpload()` function reads mode/count and calls the upload chain
- Render `<PendingUploadCard>` in place of `<DropZone>` when `pendingFile` is set

### `components/PendingUploadCard.tsx` (new)
Props: `file`, `speakerMode`, `speakersExpected`, `onModeChange`, `onSpeakersChange`, `onConfirm`, `onDismiss`

Renders the violet card with file name, size, recording type toggle, conditional speaker count pills, and Dismiss / Upload buttons.

### `app/api/sessions/[id]/upload-complete/route.ts`
- Accept `speaker_mode` and `speakers_expected` from request body
- Pass `speakers_expected` to `createJob`

### `lib/assemblyai.ts` — `createJob`
- Add optional `speakersExpected?: number` parameter (defaults to `2`)
- Pass it as `speakers_expected` in the AssemblyAI transcript submission

## Out of Scope

- Storing `speaker_mode` or `speakers_expected` in the DB
- Changing the webhook or identify-screen logic
- Any changes to the existing 5+ speaker handling beyond passing the count to AssemblyAI
