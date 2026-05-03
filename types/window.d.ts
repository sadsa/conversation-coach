// types/window.d.ts
//
// Session title bridge between TranscriptClient (route-scoped) and
// VoiceController (lifted above the route in ConditionalNav). The
// controller reads this lazily inside `start()` so it can include the
// session title in the agent's route hint without prop-drilling.
//
// Cleared on TranscriptClient unmount so navigating away from a session
// never leaves a stale title behind.
declare global {
  interface Window {
    __ccSessionTitle?: string
  }
}

export {}
