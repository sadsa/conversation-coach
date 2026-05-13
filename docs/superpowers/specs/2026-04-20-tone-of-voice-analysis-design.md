# Spec: Tone-of-Voice Analysis (Feasibility & POC)

**Date:** 2026-04-20
**Status:** Draft — feasibility write-up; not approval to build.

## Problem

Today the app evaluates the user's Spanish from the **transcript only** (`lib/claude.ts`). This catches grammar errors and unnatural phrasing, but says nothing about *how* the user sounds — their intonation, rhythm, energy, hesitation, or how close their delivery is to a native Rioplatense speaker. Two learners with identical transcripts but very different deliveries get identical feedback.

The user has asked us to investigate combining a paralinguistic ("tone-of-voice") read of the audio with Claude's existing transcript analysis, to give an "emotional/native-like" evaluation per session.

This document is a **feasibility & effort write-up**. It commits to a recommended path (Approach A as a POC) and documents the v2/v3 directions (Approaches B and C) so we can decide whether and how far to invest before writing any code.

## Goals

- Decide whether tone-of-voice analysis can produce a useful signal in this app, with a small enough POC to find out cheaply.
- Identify the load-bearing constraints (audio retention, cost, latency, regional language fit) before committing to a feature build.
- Sketch the path from POC → real feature → fully self-hosted, so each step has a defined off-ramp.

## Non-Goals

- Real-time / live coaching during a recording. This stays a post-recording analysis, like Claude's annotations today.
- Pronunciation scoring at the phoneme level (e.g. "your /r/ is too soft"). That's a different problem space (forced alignment + phoneme posteriorgrams) and is excluded here.
- Replacing or modifying Claude's existing grammar/naturalness annotations. Tone analysis is **additive**.
- Building a long-term native-speaker corpus or doing any data labelling work as part of the POC. (Required for Approach B; explicitly out of scope for the POC.)

## Hard Constraint: Audio Retention

The current pipeline deletes audio from R2 immediately after AssemblyAI returns the transcript (see `CLAUDE.md` → "Audio is temporary"). Nothing audio-based can happen without softening this.

**Recommended change for the POC**: extend the pipeline so that, *before* R2 deletion, the user-only segments are extracted (using the AssemblyAI utterance timestamps + the now-known speaker label) and held in R2 for the duration of the analysis run only. They are deleted as soon as the tone analysis call returns. Net effect on user-visible privacy: identical to today (no permanent audio storage), at the cost of one extra processing stage and slightly more R2 traffic.

**v2/v3 alternative** (out of scope for POC): a user-opt-in setting that retains user-only segments long-term, enabling re-analysis and historical tone-trend views. Requires a privacy disclosure update and a new settings toggle. Flagged as a follow-up.

---

## 1. Approach Comparison

| | **A — Multimodal LLM (POC)** | **B — Specialist paralinguistic API + Claude (v2)** | **C — Self-hosted prosody + open-source SER (v3)** |
|---|---|---|---|
| **What runs** | Gemini 2.x audio (or GPT-4o audio) gets the user's audio segments + transcript; returns structured JSON of emotion + native-likeness reads with explanations. Claude continues to handle text annotations unchanged. | A paralinguistic API (Hume AI Expression Measurement is the strongest fit; Audeering / DeepAffects as alternatives) returns calibrated prosodic & emotional scores. A separate Claude call synthesises those numbers + the transcript into Rioplatense-flavoured feedback. | Local extraction of prosodic features (Praat/Parselmouth: pitch contour, energy, speaking rate, pause structure) on a worker. Self-hosted SER model (Wav2Vec2-based) for emotion. Statistical comparison against a hand-curated native Rioplatense reference distribution. Claude synthesises. |
| **"Native-likeness" comes from** | The model's vibe — no measurement against real natives. | Calibrated paralinguistic measurements + a small native-reference distribution we build (≈20–50 minutes of curated Rioplatense conversation). | Statistical distance (z-scores / DTW on contours) against a larger reference distribution we own. |
| **Strengths** | Smallest engineering surface. One extra API call per session. Qualitative explanations come for free. Cost-effective per call to start. | Real, calibrated measurements (not LLM vibes). Clean separation of measurement vs. interpretation. Iterating on the feedback prompt is independent of the measurement. | No per-minute API cost. Audio never leaves our infra (best privacy story). We own the native reference, so "native" is explicitly defined. |
| **Weaknesses** | Native-likeness judgement is unverified. Quality on **Rioplatense Spanish prosody specifically** is unknown — these models are strongest on English emotion. Audio tokens are expensive at scale. | Most paralinguistic APIs are trained on broad / English-heavy data; emotion labels are likely fine, but the Rioplatense norm has to be built by us. Vendor lock-in. Hume is not cheap at scale. | By far the most engineering work. Vercel functions are not the right home — needs a separate worker (Modal / Replicate / Fly). Open-source SER models are mostly trained on English / acted-emotion; accuracy on real Spanish conversation is uncertain. |
| **Effort estimate** | ~1–2 weeks (one engineer) | ~3–4 weeks + native-reference data work | ~6–10 weeks + ongoing tuning + dataset work |
| **Per-session cost (rough)** | $0.05–$0.20 depending on length and provider | $0.20–$1.00 (Hume per-minute pricing) | Compute + ops; ~$0.01–$0.05 if amortised, but with a big fixed cost up front |
| **When this is the right answer** | Validate the signal exists before investing further. | After A confirms signal and we want production-grade measurements. | Only if cost or privacy push us off third-party APIs at scale. |

**Recommendation**: build A as a POC. If signal is real and learners value it, graduate to B for v1. C is a long-term option, not a near-term plan.

---

## 2. POC Design (Approach A)

This section is the spec for the POC, not for a shipped feature. It deliberately stops short of polished UI work.

### 2.1 Pipeline change

A new pipeline stage `tone-analysing` is inserted between `analysing` and `ready`:

```
uploading → transcribing → identifying → analysing → tone-analysing → ready
```

`tone-analysing` runs **after** Claude's text analysis succeeds. If tone analysis fails, the session still moves to `ready`; the tone read is treated as an optional enrichment, not a blocker. (Same posture as a later `flashcard_back` field — its absence shouldn't break the page.)

Extracted user audio lives in R2 only during this stage. New helper in `lib/r2.ts` and a new `lib/audio-segments.ts` (or similar) handles the slice extraction. We can either:

- **(a)** Re-fetch the original audio from R2, slice with `ffmpeg` in the route handler (Vercel functions support `ffmpeg-static` but with cold-start cost), upload per-turn segments to R2 under `sessions/{id}/turns/{position}.mp3`, then delete after the analysis call. Simplest.
- **(b)** Avoid extraction entirely — pass the original audio + a JSON of `(start_ms, end_ms)` per user turn to the multimodal model and ask it to attend to those windows. Saves the slice step but only works if the chosen model handles per-segment instructions reliably. Worth testing in the POC spike.

POC will try (b) first; fall back to (a) if attention-windowing is flaky.

### 2.2 New module: `lib/tone.ts`

Mirrors the shape of `lib/claude.ts`:

```ts
export interface ToneAnalysis {
  segment_id: string
  emotion: { primary: string; secondary?: string; confidence: number }   // e.g. "engaged", "hesitant"
  delivery: { pace: 'slow' | 'natural' | 'fast'; energy: 'low' | 'natural' | 'high' }
  native_likeness_score: number            // 1-5
  native_likeness_note: string             // one sentence, Rioplatense-flavoured
}

export interface SessionToneSummary {
  overall_score: number                    // 1-5
  dominant_emotion: string
  highlights: string[]                     // 1-3 bullets, e.g. "Nice voseo cadence on turn 3"
  growth_areas: string[]                   // 1-3 bullets, e.g. "Several long hesitations mid-sentence"
}

export async function analyseTone(
  audioRef: AudioRef,
  userTurns: UserTurn[],
  targetLanguage: TargetLanguage
): Promise<{ perTurn: ToneAnalysis[]; summary: SessionToneSummary }>
```

Prompt design follows the same conventions as `SYSTEM_PROMPT_ES_AR`: explicit JSON shape, register-aware ("Rioplatense, voseo-aware, lunfardo-friendly"), per-turn structured output. Validate the response shape downstream the same way `pipeline.ts` validates Claude's JSON.

### 2.3 Storage

New tables:

- `tone_annotations` — one row per user turn. Foreign-keyed to `segments.id`. Columns mirror `ToneAnalysis`. RLS policy mirrors `annotations`.
- `session_tone_summary` — one row per session. Foreign-keyed to `sessions.id`. Columns mirror `SessionToneSummary`.

Both tables nullable / optional from the API's perspective — sessions analysed before the feature shipped have no tone data and the UI handles that gracefully.

Re-analysis (`POST /api/sessions/:id/analyse`) does NOT re-run tone analysis automatically — the audio is already gone. Re-running tone analysis would need either (a) the user to re-upload, or (b) the v2 long-term-retention opt-in. This is a real limitation; the spec acknowledges it rather than papers over it.

### 2.4 UI surface (POC)

Deliberately minimal — enough to evaluate the signal, not polished.

- **Per-turn**: a small tone pill next to each user turn in the transcript view, showing the dominant emotion + a coloured 1–5 native-likeness bar. Tapping it opens a `DockedSheet` (reuse the existing primitive from `components/DockedSheet.tsx`) showing the full tone breakdown for that turn. No new sheet abstraction.
- **Per-session**: a "How you sounded" card on the session detail page above the transcript, showing `overall_score`, `dominant_emotion`, and the highlight / growth-area bullets.
- No homepage surface, no Write integration, no settings toggle. All gated behind a `NEXT_PUBLIC_TONE_ENABLED` env flag for the POC.

### 2.5 Evaluation criteria for the POC

The POC succeeds — and we graduate to Approach B — if **all three** of the following hold on a hand-picked set of ~20 sessions across 3+ users:

1. **Stability**: re-running tone analysis on the same audio gives consistent reads (emotion within the same family, native-likeness within ±1 point) ≥80% of the time.
2. **Discriminative power**: deliberately-bad sample sessions (monotone, hesitant, English-accented Spanish) score meaningfully lower than confident-natural samples.
3. **Subjective usefulness**: the user (jbiddick) reads the per-turn and session-summary outputs on real sessions and rates the feedback as "useful and would-act-on" ≥60% of the time.

If any of those three fails, we stop. The POC's output is "Approach A is not enough; here's whether B is worth the additional investment, with evidence."

### 2.6 Effort breakdown

| Sub-task | Estimate |
|---|---|
| Pipeline stage + audio retention change (extract-then-delete) | 2–3 days |
| `lib/tone.ts` + prompt iteration + JSON validation | 2–3 days |
| Multimodal API integration (Gemini or GPT-4o audio) — including the (b) vs (a) spike | 1–2 days |
| `tone_annotations` + `session_tone_summary` migrations + API plumbing | 1 day |
| Minimal UI (transcript pills + sheet + session card) | 2–3 days |
| Evaluation harness + manual eval on ~20 sessions | 1–2 days |
| **Total** | **~1.5–2.5 weeks** for one engineer |

---

## 3. v2 Sketch (Approach B) — for context only

If the POC clears the bar, the natural next step is to replace the multimodal-LLM measurement with a specialist paralinguistic API (Hume AI is the lead candidate, with Audeering as a fallback). Claude's role moves from "judge native-likeness from audio" to "interpret these calibrated numbers in Rioplatense terms".

The work this adds, beyond what the POC ships:

- Curating a small native Rioplatense reference distribution (~20–50 minutes of sourced audio across multiple speakers — accent samples, podcast clips, etc.). This is the load-bearing data work.
- Integrating Hume's batch API (or similar) into the same `tone-analysing` pipeline stage.
- A second Claude call that takes (paralinguistic measurements + native-distribution percentiles + transcript) and returns the user-facing tone read.
- Cost monitoring + per-user rate limits, since paralinguistic API per-minute pricing makes session-cost a real concern.
- A polished UI pass — at this point the feature is shippable, so the spike-quality POC UI gets revisited.

Effort: ~3–4 additional weeks on top of the POC.

## 4. v3 Sketch (Approach C) — long-term option

Self-hosted prosody extraction (Praat/Parselmouth via a Python worker on Modal, Fly, or similar) plus a self-hosted SER model. Documented here so we don't forget it exists; not recommended unless cost or privacy at scale push us off third-party APIs.

---

## 5. Open Questions (to resolve before / during the POC)

1. **Provider choice for Approach A**: Gemini 2.x vs GPT-4o audio. Both accept audio; Gemini is cheaper and handles longer audio in one call, GPT-4o has stronger emotion reasoning in our hands. Resolve by spiking both on 3 sessions in week 1.
2. **Audio segment passing strategy**: full-audio + timestamps (b) vs pre-sliced per-turn audio (a). Resolve in the same spike.
3. **Re-analysis story**: is the loss of tone re-analysability a real problem for users, or acceptable given the privacy posture? Surface explicitly in the POC review.
4. **Cost cap**: should the POC enforce a per-session cost ceiling (skip tone analysis for sessions over N minutes)? Likely yes — pick N during the integration sub-task.
5. **Latency**: does adding ~10–30s to the pipeline materially worsen the user experience? Status page already supports waiting, but worth measuring.
6. **i18n of tone copy**: per-turn notes and session highlights need to flow through `lib/i18n.ts` like every other user-visible string. Confirm the prompt returns language-agnostic enums where possible (emotion as `engaged` not `enganchado`) so we render via `t()`.

## 6. Risks

- **Rioplatense fit is the biggest unknown.** Multimodal LLMs are trained heavily on English; Spanish prosody perception (especially the voseo-region cadence) may be weak. The POC eval (section 2.5) is specifically designed to catch this before investing further.
- **Privacy regression.** Even temporary audio retention extends the window of risk. Mitigated by (a) keeping retention to a single pipeline run, (b) extracting only the user's own segments, and (c) explicit deletion after analysis. Worth a one-line update to whatever privacy copy currently exists.
- **Cost creep.** Audio tokens and paralinguistic APIs both bill per minute. Without a cap, a long session could cost $1+ to analyse. Cost cap (open question 4) is mandatory before any non-POC rollout.
- **"Tone score" can feel judgemental.** Telling a learner their delivery sounds "flat" or "hesitant" lands differently than telling them a verb conjugation is wrong. Copy needs to be encouraging and concrete, not graded. Same posture as the existing status page redesign (commit `8a3ce13`).

## 7. Recommendation

Build the POC as scoped above (~1.5–2.5 weeks). Treat the POC's evaluation criteria as a real gate, not a formality. If the gate clears, write a follow-on spec for Approach B and proceed. If it doesn't, archive the work — the write-up itself is the deliverable.
