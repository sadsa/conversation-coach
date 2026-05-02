# Google Live Voice Agent — Design Spec

**Date:** 2026-05-02  
**Branch:** `feat/google-live-voice` (off `feat/voice-widget`)  
**Goal:** Replace AssemblyAI voice agent with Gemini Multimodal Live API to evaluate Argentine Spanish / NZ English accent quality. If Google Live wins, squash-merge into `feat/voice-widget`.

---

## Summary

Rewrite `lib/voice-agent.ts` in-place to connect to the Gemini Multimodal Live WebSocket instead of AssemblyAI. The `VoiceAgent` interface and `VoiceWidget.tsx` are unchanged. The branch itself is the comparison — run `feat/voice-widget` vs `feat/google-live-voice` side-by-side.

---

## What Changes

| File | Change |
|------|--------|
| `lib/voice-agent.ts` | Full rewrite — Gemini Live WebSocket |
| `app/api/voice-token/route.ts` | Returns `GOOGLE_API_KEY` (auth-gated) instead of minting AssemblyAI token |
| `.env.local.example` | Add `GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_VOICE` |
| `components/VoiceWidget.tsx` | No change |
| Everything else | No change |

---

## Architecture

### Auth

No short-lived token endpoint exists for Gemini Live. `/api/voice-token` returns the `GOOGLE_API_KEY` directly, gated behind `getAuthenticatedUser()`. The client embeds it as a query param in the WS URL — the key never ships in client env vars.

> Production hardening (if Google Live wins): proxy the WebSocket server-side so the key never reaches the browser.

### WebSocket URL

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={token}
```

### Session Init (`setup` message)

```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": { "voiceName": "<NEXT_PUBLIC_GOOGLE_VOICE>" }
        }
      }
    },
    "systemInstruction": {
      "parts": [{ "text": "<buildSystemPrompt() output>" }]
    }
  }
}
```

`NEXT_PUBLIC_GOOGLE_VOICE` defaults to `Aoede` — swappable via env var without a deploy.

### Ready Signal

`setupComplete` message → call `onStateChange('active')`.

---

## Audio Pipeline

### Input (mic → Gemini)

- AudioContext: **16 kHz** (down from 24 kHz for AssemblyAI)
- `getUserMedia`: `{ echoCancellation: true, sampleRate: 16000 }`
- `pcm-processor.js` AudioWorklet: unchanged (sample-rate agnostic)
- Send format:

```json
{
  "realtime_input": {
    "media_chunks": [{
      "mime_type": "audio/pcm;rate=16000",
      "data": "<base64 PCM16>"
    }]
  }
}
```

### Output (Gemini → speaker)

- Output PCM16 at 24 kHz — unchanged from current implementation
- Decode `serverContent.modelTurn.parts[].inlineData.data` → `Float32Array` → schedule on `AudioContext`
- Interrupt: `serverContent.interrupted === true` → reset `playbackTime = audioCtx.currentTime`

---

## `updateFocus` — Mid-Session Context Switch

Gemini Live has no `session.update` equivalent. Inject a text user-turn:

```json
{
  "clientContent": {
    "turns": [{
      "role": "user",
      "parts": [{ "text": "Now let's focus on: \"<original>\" → \"<correction>\"" }]
    }],
    "turnComplete": true
  }
}
```

`buildSystemPrompt()` output is unchanged — same function, same arguments.

---

## `VoiceAgent` Interface (unchanged)

```ts
interface VoiceAgent {
  updateFocus(correction: FocusedCorrection, allItems: FocusedCorrection[], targetLanguage: TargetLanguage): void
  setMuted(muted: boolean): void
  disconnect(): void
}
```

`setMuted` toggles `audioTrack.enabled` — identical to current implementation.

---

## Environment Variables

```env
GOOGLE_API_KEY=                   # Gemini API key (server-only)
NEXT_PUBLIC_GOOGLE_VOICE=Aoede    # Gemini prebuilt voice name (optional, defaults to Aoede)
```

---

## Comparison Criteria

Google Live wins if:

- Argentine Spanish sounds natural; Rioplatense register (voseo) respected
- NZ English sounds natural; Kiwi idioms handled
- Latency feels comparable or better than AssemblyAI (`diego` voice)
- `updateFocus` text injection works mid-session without confusing the model
- Mute / disconnect / error paths behave correctly

---

## Out of Scope

- Runtime provider toggle (no env var switching; branch = comparison)
- WebSocket proxy (production hardening; deferred until after migration decision)
- Voice A/B testing UI
- Any changes to transcription pipeline, annotations, or practice items
