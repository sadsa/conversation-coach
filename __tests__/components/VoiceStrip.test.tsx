import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { VoiceStrip } from '@/components/VoiceStrip'
import { LanguageProvider } from '@/components/LanguageProvider'
import type { VoiceTickCallback } from '@/components/VoiceController'
import type React from 'react'

beforeEach(() => {
  cleanup()
  // Distill pass uses a localStorage counter to graduate the keyboard
  // shortcut hint after N sessions. Reset between tests so each test
  // starts at counter=0 (hint visible).
  window.localStorage.clear()
})

function makeAudioRef(): React.MutableRefObject<Set<VoiceTickCallback>> {
  return { current: new Set<VoiceTickCallback>() }
}

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      {ui}
    </LanguageProvider>
  )
}

describe('VoiceStrip', () => {
  it('renders the keyboard hint, mute and end controls', () => {
    wrap(
      <VoiceStrip
        muted={false}
        audioTickCallbacksRef={makeAudioRef()}
        onMute={vi.fn()}
        onEnd={vi.fn()}
      />
    )
    // Distill pass dropped the static "Voice coach" title and the always-on
    // language pill — and the colorize pass dropped the dot indicator in
    // favour of the audio-reactive bar at the bottom edge.
    expect(screen.queryByText('Voice coach')).not.toBeInTheDocument()
    expect(screen.queryByText('ES-AR')).not.toBeInTheDocument()
    expect(screen.queryByText('EN-NZ')).not.toBeInTheDocument()
    // Keyboard shortcut hint surfaces for the first N sessions.
    expect(screen.getByText(/esc to end/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end voice conversation/i })).toBeInTheDocument()
  })

  it('graduates the keyboard hint after the configured session count', () => {
    // Three renders to trip the counter — fourth render should hide the hint.
    for (let i = 0; i < 3; i++) {
      const r = wrap(
        <VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />
      )
      r.unmount()
    }
    wrap(
      <VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    expect(screen.queryByText(/esc to end/i)).not.toBeInTheDocument()
    // aria-keyshortcuts stays unconditionally so AT users always get the
    // announcement, even after the visible hint has graduated.
    const region = screen.getByRole('region', { name: /voice coach session/i })
    expect(region).toHaveAttribute('aria-keyshortcuts', 'Escape Space')
  })

  it('writes --voice-strip-height on mount and clears it on unmount', () => {
    const { unmount } = wrap(
      <VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('2.75rem')
    unmount()
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('')
  })

  it('shows mic-off icon and aria-pressed=true when muted', () => {
    wrap(
      <VoiceStrip muted={true} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    const muteBtn = screen.getByRole('button', { name: /unmute microphone/i })
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('end button uses a pre-press destructive hover cue (rose tint)', () => {
    wrap(<VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />)
    const endBtn = screen.getByRole('button', { name: /end voice conversation/i })
    // Polish pass: cream surface unblocks rose-tinted destructive hover so
    // intent is visible BEFORE the user commits, not just mid-press.
    expect(endBtn.className).toMatch(/hover:text-rose-600/)
    expect(endBtn.className).toMatch(/active:bg-rose-500\/15/)
  })

  it('muted pressed state uses neutral tint, not error-red', () => {
    wrap(<VoiceStrip muted={true} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />)
    const muteBtn = screen.getByRole('button', { name: /unmute microphone/i })
    // Conflating muted (a deliberate choice) with error-red was misleading;
    // we use a neutral text-tertiary tint matching the rest of the strip.
    expect(muteBtn.className).not.toMatch(/error-surface/)
    expect(muteBtn.className).toMatch(/aria-pressed:bg-text-tertiary/)
  })

  it('exposes keyboard shortcuts to assistive tech via aria-keyshortcuts', () => {
    wrap(<VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />)
    const region = screen.getByRole('region', { name: /voice coach session/i })
    expect(region).toHaveAttribute('aria-keyshortcuts', 'Escape Space')
  })

  it('animates in via .voice-strip-anim (matches `<main>` margin transition)', () => {
    wrap(<VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />)
    const region = screen.getByRole('region', { name: /voice coach session/i })
    expect(region.className).toMatch(/voice-strip-anim/)
  })

  it('calls onMute / onEnd', () => {
    const onMute = vi.fn()
    const onEnd = vi.fn()
    wrap(<VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={onMute} onEnd={onEnd} />)
    fireEvent.click(screen.getByRole('button', { name: /mute/i }))
    fireEvent.click(screen.getByRole('button', { name: /end voice/i }))
    expect(onMute).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('renders an aria-live region announcing connection on mount', () => {
    wrap(<VoiceStrip muted={false} audioTickCallbacksRef={makeAudioRef()} onMute={vi.fn()} onEnd={vi.fn()} />)
    const live = screen.getByText(/voice coach connected/i)
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('subscribes to the audio tick callback set on mount and unsubscribes on unmount', () => {
    const audioRef = makeAudioRef()
    const { unmount } = wrap(
      <VoiceStrip muted={false} audioTickCallbacksRef={audioRef} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    // <AudioReactiveDots> registers a tick callback. Mobile and desktop
    // instances coexist as independent Set subscribers.
    expect(audioRef.current.size).toBe(1)
    unmount()
    expect(audioRef.current.size).toBe(0)
  })
})
