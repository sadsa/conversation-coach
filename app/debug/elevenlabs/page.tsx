'use client'
import { useState, useRef, useEffect } from 'react'
import { Conversation } from '@11labs/client'
import { buildPracticeSystemPrompt } from '@/lib/voice-agent'
import { buildPersonaSystemPrompt } from '@/lib/persona'
import type { Persona } from '@/lib/persona'

type DebugState = 'idle' | 'fetching' | 'connecting' | 'active' | 'ended'

type LogEntry = {
  speaker: 'you' | 'agent' | 'system'
  text: string
}

export default function ElevenLabsDebugPage() {
  const [state, setState] = useState<DebugState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null)
  const connectTimeRef = useRef<number | null>(null)
  const firstAudioFiredRef = useRef(false)

  function addLog(speaker: LogEntry['speaker'], text: string) {
    setLog(prev => [...prev, { speaker, text }])
  }

  async function start() {
    setError(null)
    setLog([])
    setPersona(null)
    firstAudioFiredRef.current = false
    setState('fetching')

    try {
      const personaRes = await fetch('/api/practice/persona')
      if (!personaRes.ok) throw new Error('Failed to fetch persona')
      const { persona: p } = await personaRes.json() as { persona: Persona }
      setPersona(p)
      addLog('system', `Persona: ${p.name} — "${p.opener}"`)

      const tokenRes = await fetch('/api/debug/elevenlabs-token')
      if (!tokenRes.ok) throw new Error('Failed to get ElevenLabs token')
      const { signedUrl } = await tokenRes.json() as { signedUrl: string }

      setState('connecting')
      connectTimeRef.current = Date.now()

      const systemPrompt = buildPersonaSystemPrompt(
        buildPracticeSystemPrompt('en-NZ'),
        p,
      )

      const conversation = await Conversation.startSession({
        signedUrl,
        overrides: {
          agent: {
            prompt: { prompt: systemPrompt },
            firstMessage: p.opener,
          },
        },
        onConnect: () => {
          setState('active')
        },
        onDisconnect: () => {
          setState('ended')
        },
        onError: (msg: string) => {
          setError(msg)
          setState('idle')
        },
        onMessage: ({ message, source }: { message: string; source: 'user' | 'ai' }) => {
          addLog(source === 'ai' ? 'agent' : 'you', message)
        },
        onModeChange: ({ mode }: { mode: 'speaking' | 'listening' }) => {
          if (mode === 'speaking' && !firstAudioFiredRef.current && connectTimeRef.current !== null) {
            firstAudioFiredRef.current = true
            const ms = Date.now() - connectTimeRef.current
            addLog('system', `--- first audio: ${ms}ms ---`)
          }
        },
      })

      conversationRef.current = conversation
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('idle')
    }
  }

  async function stop() {
    await conversationRef.current?.endSession()
    conversationRef.current = null
  }

  useEffect(() => {
    return () => {
      conversationRef.current?.endSession()
    }
  }, [])

  const statusText = error
    ? `error: ${error}`
    : state === 'idle' ? 'idle'
    : state === 'fetching' ? 'fetching persona…'
    : state === 'connecting' ? 'connecting…'
    : state === 'active' ? 'active'
    : 'ended'

  const canStart = state === 'idle' || state === 'ended'
  const canStop = state === 'active'

  return (
    <div style={{ fontFamily: 'monospace', padding: '24px', maxWidth: '640px' }}>
      <h1 style={{ fontSize: '16px', marginBottom: '16px' }}>ElevenLabs Debug</h1>

      <p style={{ marginBottom: '12px' }}>Status: {statusText}</p>

      {persona && (
        <div style={{ marginBottom: '12px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '13px' }}>
          <strong>{persona.name}</strong>: &ldquo;{persona.opener}&rdquo;
        </div>
      )}

      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={start}
          disabled={!canStart}
          style={{ padding: '8px 16px', cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.5 }}
        >
          Start
        </button>
        <button
          onClick={stop}
          disabled={!canStop}
          style={{ padding: '8px 16px', cursor: canStop ? 'pointer' : 'not-allowed', opacity: canStop ? 1 : 0.5 }}
        >
          Stop
        </button>
      </div>

      <div
        style={{
          height: '400px',
          overflowY: 'auto',
          border: '1px solid #ccc',
          padding: '8px',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
      >
        {log.map((entry, i) => (
          <div
            key={i}
            style={{
              color: entry.speaker === 'system' ? '#999' : entry.speaker === 'agent' ? '#333' : '#0066cc',
            }}
          >
            {entry.speaker === 'system' ? entry.text : `[${entry.speaker}] ${entry.text}`}
          </div>
        ))}
      </div>
    </div>
  )
}
