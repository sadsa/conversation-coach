// __tests__/integration/voice-cross-route.test.tsx
//
// The whole point of lifting voice into ConditionalNav was that the
// session survives in-app navigation. Lock that behaviour with an
// integration test: mount ConditionalNav, mock usePathname so we can flip
// it like a router would, start a session, change the pathname, and
// assert that disconnect was NOT called.
//
// `vi.mock` factories are hoisted above `const`/`let` declarations, so
// the navigation singleton + agent spies live inside `vi.hoisted` (same
// pattern as VoiceController.test.tsx). Tests still mutate the hoisted
// refs directly to simulate a route change.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ConditionalNav } from '@/components/ConditionalNav'

const navState = vi.hoisted(() => ({ pathname: '/write' as string }))
const agentSpies = vi.hoisted(() => ({
  disconnect: vi.fn(),
  setMuted: vi.fn(),
  ref: { stateChange: null as ((s: 'connecting' | 'active' | 'ended') => void) | null },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(async (_l, _i, callbacks) => {
    agentSpies.ref.stateChange = callbacks.onStateChange
    return { setMuted: agentSpies.setMuted, disconnect: agentSpies.disconnect }
  }),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider>
        <ConditionalNav />
      </ThemeProvider>
    </LanguageProvider>
  )
}

describe('voice session persistence across routes', () => {
  beforeEach(() => {
    navState.pathname = '/write'
    agentSpies.disconnect.mockClear()
    agentSpies.setMuted.mockClear()
    agentSpies.ref.stateChange = null
  })

  it('does not disconnect when the route changes mid-session', async () => {
    const { rerender } = wrap()

    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => expect(agentSpies.ref.stateChange).not.toBeNull())
    act(() => { agentSpies.ref.stateChange!('active') })

    expect(screen.getByRole('region', { name: /voice coach session/i })).toBeInTheDocument()
    expect(agentSpies.disconnect).not.toHaveBeenCalled()

    navState.pathname = '/sessions/abc-123'
    rerender(
      <LanguageProvider initialTargetLanguage="es-AR">
        <ThemeProvider><ConditionalNav /></ThemeProvider>
      </LanguageProvider>
    )

    expect(screen.getByRole('region', { name: /voice coach session/i })).toBeInTheDocument()
    expect(agentSpies.disconnect).not.toHaveBeenCalled()
  })

  it('disconnects when ConditionalNav unmounts (sign-out)', async () => {
    const { unmount } = wrap()

    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => expect(agentSpies.ref.stateChange).not.toBeNull())
    act(() => { agentSpies.ref.stateChange!('active') })

    unmount()
    expect(agentSpies.disconnect).toHaveBeenCalledOnce()
  })
})
