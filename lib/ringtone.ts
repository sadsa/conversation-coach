// lib/ringtone.ts
//
// Synthesised landline-style ringtone for the Practise call mode's
// `incoming` screen. Web Audio API — no asset ships with the bundle and no
// licensing to worry about, same approach as `playStartTone` in
// lib/voice-agent.ts.
//
// Sound design: the classic North American PSTN ringback — two pure sine
// waves at 440Hz + 480Hz mixed together. That superimposed-tones character
// is what makes a phone ring sound like a phone ring (a single tone reads
// as an alarm; pure mixed sines read as "incoming call" the moment they
// hit the ear). Cadence is 1.5s on / 1.5s off rather than the PSTN-standard
// 2s on / 4s off — the long silence between rings makes a screen feel
// broken when the ringtone IS the only signal that anything is happening.
// Slightly faster cadence keeps the "ringing" affect continuous.
//
// Lifecycle: caller invokes `playRingtone()` synchronously inside a user
// gesture (the React mount that follows the home-door tap counts —
// browsers honour transient activation across the immediate render cycle).
// The returned `stop()` is idempotent and ramps the gain down before
// closing nodes so the cut doesn't click on the user's headphones. Stop
// also tears down the AudioContext — every incoming-call open gets its
// own context.

export interface Ringtone {
  /** Stop the ringtone and release the AudioContext. Idempotent — safe
   *  to call from a React effect cleanup that may fire twice in strict
   *  mode, and safe to call after the ringtone has already self-stopped. */
  stop: () => void
}

// US PSTN ringback frequencies — the universal "telephone ring" sound.
const RING_FREQ_LOW = 440
const RING_FREQ_HIGH = 480

// Cadence: how long each ring rings, and how long the silence lasts
// between rings. PSTN standard is 2s/4s; we shorten to 1.5s/1.5s so the
// screen never feels frozen between rings.
const RING_ON_S = 1.5
const RING_OFF_S = 1.5

// Peak gain during a ring. Two superimposed sines at this level read as
// "phone in another room" rather than "alarm at your face" — loud enough
// to register as a notification, quiet enough that the user can comfortably
// keep watching the screen and decide whether to answer.
const RING_PEAK_GAIN = 0.12

// Envelope smoothing — 50ms attack and release per ring removes the click
// that a hard `setValueAtTime` jump would otherwise produce on the
// envelope edges (especially audible on headphones).
const RING_ENVELOPE_RAMP_S = 0.05

// Look-ahead scheduling window. Web Audio's automation runs ahead of the
// JS event loop; rather than chase each ring with a setTimeout (which
// drifts and can miss under main-thread pressure) we schedule a few rings
// at a time and refresh the schedule on a coarse interval.
const SCHEDULE_LOOKAHEAD_S = 8
const SCHEDULE_REFRESH_MS = 4000

/**
 * Start a looping phone-ring tone. Returns a handle whose `stop()`
 * gracefully fades the ringtone out and tears down the audio graph.
 *
 * Throws if Web Audio is unavailable (e.g. SSR, or a browser that hasn't
 * yet granted audio permission). Callers should treat the ringtone as
 * decorative — a thrown error is non-fatal and shouldn't block the
 * incoming-call screen from rendering.
 */
export function playRingtone(): Ringtone {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    // No-op stop so callers don't have to null-check.
    return { stop: () => {} }
  }

  const ctx = new AudioContext()

  // Master gain — the ring envelope is automated here. Starts at 0 so the
  // first sample we emit isn't a step from silence to peak.
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // The two ringback oscillators, summed into master. Both run for the
  // entire lifetime of the ringtone — modulation is done by gating the
  // master gain envelope rather than starting / stopping the oscillators
  // (which would introduce noticeable clicks at every cycle).
  const oscLow = ctx.createOscillator()
  oscLow.type = 'sine'
  oscLow.frequency.value = RING_FREQ_LOW
  oscLow.connect(master)

  const oscHigh = ctx.createOscillator()
  oscHigh.type = 'sine'
  oscHigh.frequency.value = RING_FREQ_HIGH
  oscHigh.connect(master)

  oscLow.start()
  oscHigh.start()

  let stopped = false
  // Time (in AudioContext seconds) at which the next ring should begin.
  // Advanced inside `scheduleAhead` as we queue cycles; consulted by the
  // refresh interval to know whether more rings need scheduling yet.
  let nextRingAt = ctx.currentTime

  function scheduleAhead() {
    if (stopped) return
    const horizon = ctx.currentTime + SCHEDULE_LOOKAHEAD_S
    while (nextRingAt < horizon) {
      const ringStart = nextRingAt
      const ringEnd = ringStart + RING_ON_S
      // Envelope shape per ring: silent → ramp up → hold → ramp down → silent.
      // Ramping (not stepping) avoids the audible click that gain jumps
      // produce, especially on headphones at low listening volume.
      master.gain.setValueAtTime(0, ringStart)
      master.gain.linearRampToValueAtTime(RING_PEAK_GAIN, ringStart + RING_ENVELOPE_RAMP_S)
      master.gain.setValueAtTime(RING_PEAK_GAIN, ringEnd - RING_ENVELOPE_RAMP_S)
      master.gain.linearRampToValueAtTime(0, ringEnd)
      nextRingAt = ringEnd + RING_OFF_S
    }
  }

  scheduleAhead()
  const refreshIntervalId = window.setInterval(scheduleAhead, SCHEDULE_REFRESH_MS)

  // Track whether we've already torn down so `stop()` is idempotent —
  // React strict-mode effects fire cleanup twice, and `stop()` may also
  // be called explicitly by Answer / Decline handlers.
  function stop() {
    if (stopped) return
    stopped = true
    window.clearInterval(refreshIntervalId)

    const now = ctx.currentTime
    // Cancel any further automation, then ramp the current value cleanly
    // to silence. Without `setValueAtTime(currentValue, now)` the ramp
    // would start from the next *scheduled* value rather than the value
    // actually playing right now — audible as a click on stop.
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0, now + RING_ENVELOPE_RAMP_S * 2)

    // Tear down the audio graph + context after the fade completes.
    // Wrapped in try/catch because the oscillators / context may already
    // be in a closed state if the browser tab is going away.
    window.setTimeout(() => {
      try { oscLow.stop() } catch { /* already stopped */ }
      try { oscHigh.stop() } catch { /* already stopped */ }
      try { master.disconnect() } catch { /* already disconnected */ }
      ctx.close().catch(() => { /* already closed */ })
    }, 150)
  }

  return { stop }
}
