import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { VoiceStrip } from '@/components/VoiceStrip'
import { LanguageProvider } from '@/components/LanguageProvider'
import { createRef } from 'react'

beforeEach(cleanup)

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      {ui}
    </LanguageProvider>
  )
}

describe('VoiceStrip', () => {
  it('renders the indicator dot, keyboard hint, mute and end controls', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(
      <VoiceStrip
        muted={false}
        indicatorRef={ref}
        onMute={vi.fn()}
        onEnd={vi.fn()}
      />
    )
    // Distill pass dropped the static "Voice coach" title and the always-on
    // language pill — the dot + tinted background already say "session active".
    expect(screen.queryByText('Voice coach')).not.toBeInTheDocument()
    expect(screen.queryByText('ES-AR')).not.toBeInTheDocument()
    expect(screen.queryByText('EN-NZ')).not.toBeInTheDocument()
    // Keyboard shortcut hint surfaces on desktop (the test DOM still
    // renders it; CSS hides on mobile via `hidden md:inline`).
    expect(screen.getByText(/esc to end/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end voice conversation/i })).toBeInTheDocument()
  })

  it('writes --voice-strip-height on mount and clears it on unmount', () => {
    const ref = createRef<HTMLDivElement>()
    const { unmount } = wrap(
      <VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('2.75rem')
    unmount()
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('')
  })

  it('shows mic-off icon and aria-pressed=true when muted', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(
      <VoiceStrip muted={true} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    const muteBtn = screen.getByRole('button', { name: /unmute microphone/i })
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('end button uses error-text foreground so it reads as destructive', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const endBtn = screen.getByRole('button', { name: /end voice conversation/i })
    expect(endBtn.className).toMatch(/text-on-error-surface/)
  })

  it('muted pressed state uses neutral tint, not error-red', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={true} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const muteBtn = screen.getByRole('button', { name: /unmute microphone/i })
    // Conflating muted (a deliberate choice) with error-red was misleading;
    // we now use a neutral text-tertiary tint matching the indicator dot.
    expect(muteBtn.className).not.toMatch(/error-surface/)
    expect(muteBtn.className).toMatch(/aria-pressed:bg-text-tertiary/)
  })

  it('exposes keyboard shortcuts to assistive tech via aria-keyshortcuts', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const region = screen.getByRole('region', { name: /voice coach session/i })
    expect(region).toHaveAttribute('aria-keyshortcuts', 'Escape Space')
  })

  it('animates in via .voice-strip-anim (matches `<main>` margin transition)', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const region = screen.getByRole('region', { name: /voice coach session/i })
    expect(region.className).toMatch(/voice-strip-anim/)
  })

  it('calls onMute / onEnd', () => {
    const ref = createRef<HTMLDivElement>()
    const onMute = vi.fn()
    const onEnd = vi.fn()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={onMute} onEnd={onEnd} />)
    fireEvent.click(screen.getByRole('button', { name: /mute/i }))
    fireEvent.click(screen.getByRole('button', { name: /end voice/i }))
    expect(onMute).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('renders an aria-live region announcing connection on mount', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const live = screen.getByText(/voice coach connected/i)
    expect(live).toHaveAttribute('aria-live', 'polite')
  })
})
