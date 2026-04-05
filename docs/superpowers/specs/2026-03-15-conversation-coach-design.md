# Conversation Coach — Design Spec

**Date:** 2026-03-15
**Status:** Approved

---

## What This Is

A personal web app for analysing recorded Spanish conversations with native speakers. Upload an audio file, get an annotated transcript showing where your speech has grammar errors, sounds unnatural, or demonstrates strengths — with actionable items saved to a practice reference list.

## Core Value

Surface exactly what to work on after every real conversation. Not synthetic exercises — analysis of your actual speech, tuned to Argentinian Spanish.

---

## Single-User, No Authentication

This app is built for one user (the creator). There is no authentication system. All API routes are unprotected by design in v1. This is a deliberate scope decision, not an oversight.

---

## Architecture

**Platform:** Next.js web app hosted on Vercel (frontend + API routes).

**External services:**
- **AssemblyAI** — audio transcription and speaker diarization (identifies Speaker A / Speaker B with timestamps per segment). The `speakers_expected: 2` parameter is passed to hint at two speakers.
- **Claude API** — analysis of the user's speech turns: grammar errors, naturalness suggestions, strengths. Tuned to Argentinian Spanish (Rioplatense register, voseo verb forms). Claude is prompted to return structured JSON: an array of annotation objects.
- **Cloudflare R2** — temporary audio storage during processing only; deleted after AssemblyAI finishes transcription. No audio is stored permanently.
- **Supabase (PostgreSQL)** — persistent storage for sessions, transcripts, annotations, practice items.

**Processing pipeline:**

```
① POST /api/sessions → returns { session_id, upload_url }
   Client PUTs audio directly to R2 using upload_url
   On success: client calls POST /api/sessions/:id/upload-complete (with { duration_seconds } from audio metadata)
   On failure: client calls POST /api/sessions/:id/upload-failed → status: error, error_stage: "uploading"

② POST /api/sessions/:id/upload-complete → server triggers AssemblyAI job; status → `transcribing`
   If AssemblyAI job creation fails → status: error, error_stage: "transcribing"; response 500 to client

③ POST /api/webhooks/assemblyai (HMAC verified)
   If 1 speaker detected: user_speaker_label → "A"; status → `analysing` (skip speaker ID screen)
   If 2 speakers detected: transcript stored; status → `identifying` (pipeline pauses)
   Unknown job ID: log and return 200 (silent discard)

④ User submits speaker label via POST /api/sessions/:id/speaker
   Only valid when status is `identifying` — any other status returns 409
   Saves label; triggers Claude analysis; status → `analysing`

⑤ Claude analyses user's speech turns; returns structured JSON annotations
   Annotations + practice items written to DB
   Audio deleted from R2
   Status → `ready`
```

Steps ①–③ complete automatically. The pipeline pauses at ③ (two-speaker case) until the user completes ④. `POST /api/sessions/:id/speaker` triggers the Claude job directly (Vercel function, no external queue needed for v1).

**Speaker identification:** The speaker ID screen is shown every time a session has two speakers. There is no automatic voice matching — the user picks their speaker in two clicks. `voice_profile` is out of scope for v1.

**Privacy:** Audio files are stored in R2 only for the duration of transcription, then deleted. No audio is retained permanently.

---

## Key Screens

### 1. Upload / Home
- Drag-and-drop audio file input (MP3, M4A, WAV — up to 2 hours / 500 MB)
- Client-side validation before upload: format check (`File.type` / extension), size check — errors shown inline, no request sent
- Session title input (optional, defaults to filename without extension)
- List of past sessions with title, status, and date
- Click a past session to open its annotated transcript
- Session titles are editable inline (click to rename; saves on blur or Enter keypress; calls `PATCH /api/sessions/:id`)

### 2. Processing Status
- Redirected here immediately after upload confirmation
- On load: immediately fetch `GET /api/sessions/:id/status`; if already `identifying` → redirect to Screen 3; if already `ready` → redirect to Screen 4; otherwise begin polling
- Polls `GET /api/sessions/:id/status` every 5 seconds
- Shows current pipeline stage: uploading → transcribing → identifying → analysing → ready
- Single-speaker path goes uploading → transcribing → analysing → ready (no `identifying` step); warning banner ("couldn't distinguish two speakers") shown on Screen 4 after redirect, not on this screen
- Frontend infers two-speaker flow from status becoming `identifying`; no separate speaker-count field exists
- Estimated time: `Math.ceil(duration_seconds / 60 * 1.5)` minutes, calculated from `duration_seconds` passed by the client in `upload-complete` (extracted from audio file metadata before upload). Always available from the moment the status page loads.
- Auto-redirects to Screen 3 when status becomes `identifying`, or to Screen 4 when status becomes `ready`
- On error: shows human-readable error message for the failed stage + retry button (calls `POST /api/sessions/:id/retry`)
  - For `error_stage: "uploading"`: retry returns `{ upload_url }`; client re-initiates the R2 PUT from Screen 2 using the stored file reference (the file object is held in component state from the original upload); on success calls `upload-complete` and polling resumes normally. If the user has navigated away and the file reference is lost, they are redirected to Screen 1 with an "upload failed — please try again" message.

### 3. Speaker Identification (shown every session with two speakers)
- Loads via `GET /api/sessions/:id` — `annotations` will be an empty array at this point (Claude hasn't run); only `segments` are needed
- Shows first 3 non-empty turns per speaker from the `segments` array
- User clicks "That's me" on their speaker
- Submits to `POST /api/sessions/:id/speaker`; response `{ status: "analysing" }` triggers redirect to Screen 2 (polling continues)

### 4. Annotated Transcript (main view)
- Header: session title (editable inline, saves on blur or Enter → `PATCH /api/sessions/:id`), duration, annotation counts by type
- If `session.detected_speaker_count === 1`: show warning banner ("couldn't distinguish two speakers — try a higher quality recording"); all segments render as user turns; no "dimmed" native speaker turns
- Full conversation displayed with speaker labels
  - Native speaker turns: dimmed, not annotated
  - User turns: full opacity, inline highlights rendered using `start_char`/`end_char` offsets within the segment's `text`
    - 🔴 Red underline = grammar error
    - 🟡 Yellow underline = naturalness suggestion
    - 🟢 Green underline = strength
- Click any highlight to expand an annotation card:
  - Type label and short title
  - Original → correction (or "keep this!" for strengths)
  - Plain-language explanation in context of Argentine Spanish
  - "Add to practice list" button — calls `POST /api/practice-items` with the annotation's content
- Filter bar to show/hide annotation types (client-side filter, no API call)
- "Re-analyse" button always visible — calls `POST /api/sessions/:id/analyse`. Valid when status is `ready` or `error` with `error_stage: "analysing"`. Not callable when status is `analysing` (returns 409). Not valid for `error_stage: "uploading"` or `"transcribing"` (no transcript — returns 400). On success, response is `{ status: "analysing" }` and the client immediately redirects to Screen 2 (status polling) so the user sees progress feedback. Replaces all existing annotations and annotation-derived practice items before writing new ones.

### 5. Practice Items
- Flat list of all actionable items across all sessions — no pagination in v1 (acceptable for single-user, bounded dataset)
- Filter tabs: All / Grammar / Naturalness / Strengths, and a Reviewed toggle
- Query: `GET /api/practice-items?type=grammar&reviewed=false` (all params optional)
- Each item shows: original → correction, explanation, source session title + date
- Checkbox toggles reviewed: `PATCH /api/practice-items/:id` with `{ reviewed: true/false }`
- Dismiss (delete) button: `DELETE /api/practice-items/:id`
- Items are created automatically from annotations when a session finishes analysing — `POST /api/practice-items` is not needed from the UI for this path (it happens server-side). The manual creation path (`POST /api/practice-items` with `annotation_id: null`) is not exposed in the v1 UI; it exists for future use. All v1 items are annotation-derived.

---

## Data Model

### `sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | Set by user at upload, or defaulted to filename |
| `status` | enum | `uploading`, `transcribing`, `identifying`, `analysing`, `ready`, `error` |
| `error_stage` | text | Nullable — constrained to `"uploading"`, `"transcribing"`, or `"analysing"` |
| `duration_seconds` | int | Nullable — set by client in `upload-complete` from audio file metadata |
| `audio_r2_key` | text | Nullable — cleared once AssemblyAI transcription completes |
| `assemblyai_job_id` | text | Nullable — used to match incoming webhooks |
| `detected_speaker_count` | int | Nullable — set by AssemblyAI webhook (1 or 2); frontend uses this to show the single-speaker warning banner |
| `user_speaker_label` | text | Nullable — `"A"` or `"B"`, set via speaker identification |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `transcript_segments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `session_id` | uuid | FK → sessions |
| `speaker` | text | `"A"` or `"B"` |
| `text` | text | Full text of this speaker turn |
| `start_ms` | int | |
| `end_ms` | int | |
| `position` | int | Ordering index within session (0-based) |

### `annotations`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `session_id` | uuid | FK → sessions |
| `segment_id` | uuid | FK → transcript_segments |
| `type` | enum | `grammar`, `naturalness`, `strength` |
| `original` | text | The exact phrase from the user's speech |
| `start_char` | int | Start character offset of `original` within `segment.text` |
| `end_char` | int | End character offset |
| `correction` | text | Nullable — null for strengths |
| `explanation` | text | Plain-language explanation tuned to Argentine Spanish |

### `practice_items`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `session_id` | uuid | FK → sessions |
| `annotation_id` | uuid | Nullable FK → annotations — null for manually created items |
| `type` | enum | `grammar`, `naturalness`, `strength` — copied from annotation or set manually |
| `original` | text | Copied from annotation or entered manually |
| `correction` | text | Nullable |
| `explanation` | text | |
| `reviewed` | bool | Default false |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Updated when `reviewed` is toggled |

*Content fields are denormalised onto `practice_items` so that manually created items and annotation-derived items share the same shape. For annotation-derived items, these are copied at creation time.*

---

## API Routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/sessions` | Create session. Request: `{ title }`. Response: `{ session_id, upload_url }` |
| `POST` | `/api/sessions/:id/upload-complete` | Client calls after successful R2 PUT. Request: `{ duration_seconds }`. Server triggers AssemblyAI; status → `transcribing`. On AssemblyAI failure: status → `error`, `error_stage: "transcribing"`, response 500. |
| `POST` | `/api/sessions/:id/upload-failed` | Client calls if the R2 PUT fails. Sets status → `error`, `error_stage: "uploading"`. Response: 200. |
| `GET` | `/api/sessions` | List sessions. Response: `[{ id, title, status, duration_seconds, created_at }]` |
| `PATCH` | `/api/sessions/:id` | Update title only. Request: `{ title }`. Blank/empty title rejected with 400. Intentionally limited to `title` in v1 — all other session state is managed by server-side pipeline logic. |
| `GET` | `/api/sessions/:id` | Full session. Response: `{ session: { id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_label, created_at }, segments: TranscriptSegment[], annotations: Annotation[] }`. Segments ordered by `position`; annotations flat array correlated by `segment_id` + `start_char`/`end_char`. |
| `GET` | `/api/sessions/:id/status` | Polling. Response: `{ status, error_stage: string \| null }` — `error_stage` is always present in the response body, set to `null` when no error has occurred |
| `POST` | `/api/sessions/:id/speaker` | Set user speaker. Request: `{ speaker_label: "A" \| "B" }`. Only valid when status is `identifying` — returns 409 otherwise. Triggers Claude analysis. Response: `{ status: "analysing" }` |
| `POST` | `/api/sessions/:id/retry` | Re-trigger the failed stage using `error_stage`. Valid only for `"uploading"` (attempts to delete the old R2 key if set, generates a new R2 key + `upload_url`, clears `audio_r2_key` to the new key, sets status → `uploading`; returns `{ upload_url }`) and `"transcribing"` (if `assemblyai_job_id` is set, attempt cancellation — skip gracefully if it fails; the existing `audio_r2_key` is still valid since transcription never completed; passes the existing `audio_r2_key` to the new AssemblyAI job; updates `assemblyai_job_id` to the new job ID; sets status → `transcribing`; if stale job later completes its webhook is silently discarded per the unknown-job-ID rule; returns `{ status: "transcribing" }`). Not valid for `"analysing"` — use `/analyse`. |
| `POST` | `/api/sessions/:id/analyse` | Trigger or re-trigger Claude analysis. Valid when status is `ready` or `error` with `error_stage: "analysing"`. Returns 409 if status is `analysing`. Returns 400 if `error_stage` is `"uploading"` or `"transcribing"` (no transcript). Deletion predicate: `DELETE FROM annotations WHERE session_id = :id`, then `DELETE FROM practice_items WHERE session_id = :id AND annotation_id IS NOT NULL`. Response: `{ status: "analysing" }` |
| `POST` | `/api/webhooks/assemblyai` | AssemblyAI callback. Verifies HMAC-SHA256 (`x-assemblyai-signature`). Invalid signature → 401. Unknown `assemblyai_job_id` → log and return 200 (silent discard). |
| `GET` | `/api/practice-items` | List items. Query params: `type` (grammar\|naturalness\|strength), `reviewed` (true\|false), both optional. Response: `[PracticeItem]` |
| `POST` | `/api/practice-items` | Create item. Request: `{ session_id, annotation_id?, type, original, correction?, explanation }`. Used by server internally and available for future manual creation. |
| `PATCH` | `/api/practice-items/:id` | Update. Request: `{ reviewed: boolean }` |
| `DELETE` | `/api/practice-items/:id` | Delete item |

---

## Error Handling

| Failure | Status set to | Behaviour |
|---|---|---|
| Upload: invalid format | — | Client-side error before upload; no request sent |
| Upload: file >500 MB | — | Client-side error before upload; no request sent |
| Upload: network failure | `error`, `error_stage: "uploading"` | Client calls `upload-failed`; retry button calls `POST /api/sessions/:id/retry` (returns new `upload_url`) |
| AssemblyAI job creation failure | `error`, `error_stage: "transcribing"` | Set by `upload-complete` handler; user sees error + retry button |
| AssemblyAI transcription error | `error`, `error_stage: "transcribing"` | Set by webhook; user sees error + retry button (calls `POST /api/sessions/:id/retry`) |
| Single speaker detected | `analysing` (immediately, no `identifying` pause) | AssemblyAI webhook sets `user_speaker_label: "A"` and moves directly to `analysing`. Frontend shows warning after session reaches `ready`: "couldn't distinguish two speakers — try a higher quality recording." |
| Claude analysis failure | `error`, `error_stage: "analysing"` | Transcript shown unannotated; "Re-analyse" button calls `POST /api/sessions/:id/analyse` |
| AssemblyAI webhook: invalid signature | — | 401 returned; no DB writes |
| AssemblyAI webhook: unknown job ID | — | 200 returned; logged; no DB writes |
| `POST /api/sessions/:id/speaker` on wrong status | — | 409 returned; client should reload status and re-evaluate |

---

## Out of Scope (v1)

- In-app audio recording (upload only)
- Playback of the recording within the app
- Multiple user accounts / authentication (all routes unprotected by design)
- Automatic voice matching across sessions (speaker ID screen shown every session)
- Export / integration with Lengua
- Mobile-optimised layout (desktop web first)
- Real-time transcription during conversation
