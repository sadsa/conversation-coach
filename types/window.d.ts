// types/window.d.ts
import type { VoicePageContext } from '@/lib/voice-context'

declare global {
  interface Window {
    __ccVoiceContext?: VoicePageContext
  }
}

export {}
