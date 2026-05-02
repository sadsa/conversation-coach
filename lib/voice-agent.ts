// lib/voice-agent.ts

export interface FocusedCorrection {
  original: string
  correction: string | null
  explanation: string
}

export type VoiceAgentState = 'connecting' | 'active' | 'reconnecting' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
}

export interface VoiceAgent {
  updateFocus: (correction: FocusedCorrection, allItems: FocusedCorrection[], targetLanguage: string) => void
  setMuted: (muted: boolean) => void
  disconnect: () => void
}

const WS_ENDPOINT = 'wss://agents.assemblyai.com/v1/ws'

/** Pure function — builds the system prompt injected on connect and on focus change. */
export function buildSystemPrompt(
  targetLanguage: string,
  items: FocusedCorrection[],
  focused: FocusedCorrection
): string {
  const isEsAR = targetLanguage === 'es-AR'

  const languageBlock = isEsAR
    ? `You are a Rioplatense Argentine Spanish coach.\nSpeak exclusively in Argentine Spanish with a Rioplatense accent.\nUse voseo verb forms and natural everyday Rioplatense vocabulary.`
    : `You are a New Zealand English coach.\nSpeak exclusively in New Zealand English with a Kiwi accent and idioms.`

  const itemList = items
    .slice(0, 10)
    .map((item, i) => `${i + 1}. "${item.original}" → "${item.correction ?? item.original}" — ${item.explanation}`)
    .join('\n')

  const region = isEsAR ? 'Argentine' : 'New Zealand'
  const register = isEsAR ? 'Rioplatense' : 'Kiwi'

  return `${languageBlock}

The user has these corrections to review:
${itemList}

Currently discussing: "${focused.original}" → "${focused.correction ?? focused.original}"
${focused.explanation}

Be conversational. Ask the user questions, give examples from everyday ${region} speech, and help them understand why the correction matters in natural ${register} usage.`
}

/**
 * Opens a real-time voice session with the AssemblyAI Voice Agent API.
 * Fetches a short-lived token from /api/voice-token, opens a WebSocket,
 * streams PCM16 mic audio, and plays back PCM16 agent audio.
 *
 * Returns a handle for mid-conversation updates, mute, and disconnect.
 */
export async function connect(
  targetLanguage: string,
  items: FocusedCorrection[],
  focused: FocusedCorrection,
  callbacks: VoiceAgentCallbacks
): Promise<VoiceAgent> {
  // 1. Mint a short-lived token from our server route.
  const tokenRes = await fetch('/api/voice-token')
  if (!tokenRes.ok) throw new Error('Failed to get voice token')
  const { token } = await tokenRes.json() as { token: string }

  // 2. Set up AudioContext at 24 kHz (avoids resampling) and mic stream.
  const audioCtx = new AudioContext({ sampleRate: 24000 })
  await audioCtx.audioWorklet.addModule('/pcm-processor.js')

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, sampleRate: 24000 },
  })
  const [audioTrack] = stream.getAudioTracks()

  const source = audioCtx.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(audioCtx, 'pcm-processor')
  source.connect(worklet)
  // Connect worklet to destination so AudioContext stays alive (no audible output
  // from the mic path — the worklet captures only, not plays back).
  worklet.connect(audioCtx.destination)

  // 3. Open WebSocket.
  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('token', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let playbackTime = audioCtx.currentTime

  // Stream mic audio once the session is ready.
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return
    const bytes = new Uint8Array(e.data)
    const b64 = btoa(String.fromCharCode(...bytes))
    ws.send(JSON.stringify({ type: 'input.audio', audio: b64 }))
  }

  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        system_prompt: buildSystemPrompt(targetLanguage, items, focused),
        output: { voice: 'ivy' },
      },
    }))
  })

  ws.addEventListener('message', (event: MessageEvent) => {
    const msg = JSON.parse(event.data as string) as Record<string, unknown>

    if (msg.type === 'session.ready') {
      ready = true
      callbacks.onStateChange('active')
    } else if (msg.type === 'reply.audio') {
      // Decode base64 PCM16 and schedule playback.
      const raw = atob(msg.data as string)
      const pcm16 = new Int16Array(raw.length / 2)
      for (let i = 0; i < pcm16.length; i++) {
        pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
      }
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768
      }
      const buffer = audioCtx.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)
      const src = audioCtx.createBufferSource()
      src.buffer = buffer
      src.connect(audioCtx.destination)
      const now = audioCtx.currentTime
      playbackTime = Math.max(playbackTime, now)
      src.start(playbackTime)
      playbackTime += buffer.duration
    } else if (msg.type === 'reply.done' && msg.status === 'interrupted') {
      playbackTime = audioCtx.currentTime
    } else if (msg.type === 'session.error' || msg.type === 'error') {
      callbacks.onError((msg.message ?? 'Voice session error') as string)
    }
  })

  ws.addEventListener('close', () => {
    ready = false
    callbacks.onStateChange('ended')
    audioCtx.close()
    stream.getTracks().forEach(t => t.stop())
  })

  ws.addEventListener('error', () => {
    callbacks.onError('Connection error')
  })

  // 4. Return the agent handle.
  return {
    updateFocus(correction, allItems, lang) {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          system_prompt: buildSystemPrompt(lang, allItems, correction),
        },
      }))
    },
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    disconnect() {
      ws.close()
    },
  }
}
