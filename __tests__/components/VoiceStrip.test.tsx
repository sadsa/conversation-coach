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
  it('renders the dot, title, language pill, mute and end controls', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(
      <VoiceStrip
        muted={false}
        indicatorRef={ref}
        onMute={vi.fn()}
        onEnd={vi.fn()}
      />
    )
    expect(screen.getByText('Voice coach')).toBeInTheDocument()
    expect(screen.getByText('ES-AR')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end voice conversation/i })).toBeInTheDocument()
  })

  it('renders EN-NZ pill for en-NZ users', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <LanguageProvider initialTargetLanguage="en-NZ">
        <VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
      </LanguageProvider>
    )
    expect(screen.getByText('EN-NZ')).toBeInTheDocument()
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
