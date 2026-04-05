# Multi-Speaker Selection Design

**Date:** 2026-03-16
**Status:** Approved

## Problem

AssemblyAI's diarization occasionally splits a single speaker into two tracks (A and B). The current "Who are you?" screen forces the user to pick exactly one speaker label, making it impossible to claim both tracks as themselves.

## Goal

Allow the user to select one or more speaker tracks as themselves on the identify screen. When both tracks are selected, all segments are treated as the user's speech and passed to Claude for analysis.

## Interaction Model

The identify screen becomes a multi-select UI:

- Each `SpeakerCard` is a toggle — clicking it selects or deselects that speaker (highlighted border + checkmark)
- The individual "That's me" button is removed from each card; `disabled` still applies to the whole card during submission to prevent double-submit
- A "Confirm" button appears below the cards, disabled until at least one speaker is selected
- On confirm, the selected labels are posted to the API

## Data Layer

### DB Migration (`supabase/migrations/002_multi_speaker_labels.sql`)

Replace the `user_speaker_label text` column on the `sessions` table with `user_speaker_labels text[]`.

> ⚠️ This is a destructive, breaking schema change. A rollback migration should be prepared before deploying. Rollback SQL: `ALTER TABLE sessions ADD COLUMN user_speaker_label text; UPDATE sessions SET user_speaker_label = user_speaker_labels[1] WHERE user_speaker_labels IS NOT NULL; ALTER TABLE sessions DROP COLUMN user_speaker_labels;`

Migration steps:
1. Add `user_speaker_labels text[]` column
2. Backfill: `UPDATE sessions SET user_speaker_labels = ARRAY[user_speaker_label] WHERE user_speaker_label IS NOT NULL`
3. Drop `user_speaker_label`

### Types (`lib/types.ts`)

Update the `Session` interface:

```ts
// Before
user_speaker_label: 'A' | 'B' | null

// After
user_speaker_labels: ('A' | 'B')[] | null
```

Update the `SessionDetail` pick to reference the new field name:

```ts
// Before
export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_label' | 'created_at'
  >
  ...
}

// After
export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  ...
}
```

## API

### GET/PATCH session (`app/api/sessions/[id]/route.ts`)

Update the `.select()` string in the `GET` handler (line 12) to use the renamed column:

```ts
// Before
.select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_label, created_at')

// After
.select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at')
```

### `POST /api/sessions/:id/speaker` (`app/api/sessions/[id]/speaker/route.ts`)

**Request body change:**

```ts
// Before
{ speaker_label: 'A' | 'B' }

// After
{ speaker_labels: ('A' | 'B')[] }
```

**Validation:** `speaker_labels` must be a non-empty array; every element must be `'A'` or `'B'`. Return 400 otherwise.

**DB write:** update column name and value:

```ts
// Before
user_speaker_label: speaker_label

// After
user_speaker_labels: speaker_labels
```

**Error paths (unchanged):** 409 if session is not in `identifying` status.

## Pipeline (`lib/pipeline.ts`)

Two changes required:

1. **Update the `.select()` call** to fetch the renamed column:

```ts
// Before
.select('user_speaker_label, audio_r2_key')

// After
.select('user_speaker_labels, audio_r2_key')
```

2. **Update the `.filter()` call** to use array inclusion:

```ts
// Before
.filter(s => s.speaker === session.user_speaker_label)

// After
.filter(s => session.user_speaker_labels.includes(s.speaker))
```

## AssemblyAI Webhook (`app/api/webhooks/assemblyai/route.ts`)

In the single-speaker auto-skip branch (~line 86), update the DB write:

```ts
// Before
user_speaker_label: 'A',

// After
user_speaker_labels: ['A'],
```

## UI

### `SpeakerCard` (`components/SpeakerCard.tsx`)

Props change:

```ts
// Before
interface Props {
  label: 'A' | 'B'
  samples: string[]
  onSelect: (label: 'A' | 'B') => void
  disabled: boolean
}

// After
interface Props {
  label: 'A' | 'B'
  samples: string[]
  onToggle: (label: 'A' | 'B') => void
  selected: boolean
  disabled: boolean  // disables card interaction during submission
}
```

- Remove the "That's me" button
- Clicking anywhere on the card calls `onToggle(label)`
- When `selected` is true: show highlighted border + checkmark indicator
- When `disabled` is true: card is non-interactive

### `identify/page.tsx` (`app/sessions/[id]/identify/page.tsx`)

- State: `selectedLabels: Set<'A' | 'B'>` (initially empty)
- Heading: `"Select all speakers that are you"`
- Subtitle: `"Tap a speaker to select it. You can select both if they're all you."` (replaces "Pick the one that sounds like you.")
- "Confirm" button below the grid, disabled when `selectedLabels.size === 0` or `submitting === true`
- On confirm: `POST { speaker_labels: [...selectedLabels] }` — existing 409 and success redirect behaviour unchanged

### `TranscriptView` (`components/TranscriptView.tsx`)

Prop rename and logic update:

```ts
// Before
interface Props {
  ...
  userSpeakerLabel: 'A' | 'B' | null
}

// isUser logic (line 52)
const isUser = userSpeakerLabel === null || seg.speaker === userSpeakerLabel

// After
interface Props {
  ...
  userSpeakerLabels: ('A' | 'B')[] | null
}

// isUser logic
const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
```

### `app/sessions/[id]/page.tsx`

Update the prop passed to `TranscriptView` (line 85):

```ts
// Before
userSpeakerLabel={session.user_speaker_label}

// After
userSpeakerLabels={session.user_speaker_labels}
```

## Testing

- Unit: `SpeakerCard` renders selected state (highlighted border + checkmark) when `selected={true}`
- Unit: `SpeakerCard` renders unselected state and calls `onToggle` on click
- Unit: `SpeakerCard` is non-interactive when `disabled={true}`
- Unit: confirm button is disabled when no speakers selected, enabled when one or both are selected
- Unit: `POST /api/sessions/:id/speaker` returns 400 for empty array, non-A/B values, and missing field
- Unit: `POST /api/sessions/:id/speaker` accepts `['A']`, `['B']`, and `['A', 'B']`
- Integration: pipeline correctly filters segments for `['A']`, `['B']`, and `['A', 'B']`
- Integration: webhook auto-skip path writes `user_speaker_labels: ['A']` for single-speaker sessions
- Unit: `TranscriptView` labels segments as "You" / "Them" correctly for `['A', 'B']` (all segments show as "You")
