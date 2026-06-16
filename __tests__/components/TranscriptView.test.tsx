// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0, paragraph_breaks: [] },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1, paragraph_breaks: [] },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.',
    sub_category: 'other', flashcard_front: null, flashcard_back: null, flashcard_note: null,
    importance_score: null, importance_note: null,
    is_unhelpful: false, unhelpful_at: null },
]

const defaultProps = {
  sessionId: 's1',
  addedAnnotations: new Map<string, string>(),
  unhelpfulAnnotations: new Set<string>(),
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
  onAnnotationUnhelpfulChanged: vi.fn(),
}

describe('TranscriptView', () => {
  it('renders a multi-speaker conversation as side-aligned chat bubbles', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    // User turn (speaker A) bubble is right-aligned; partner turn (speaker B)
    // is left-aligned — matching the live Talk-mode view.
    const userRow = container.querySelector('[data-speaker-role="user"]')
    const partnerRow = container.querySelector('[data-speaker-role="partner"]')
    expect(userRow).toHaveClass('items-end')
    expect(userRow?.textContent).toContain('Yo fui al mercado.')
    expect(partnerRow).toHaveClass('items-start')
    expect(partnerRow?.textContent).toContain('¿Qué compraste?')
    // No hover-reveal dimming on partner turns in the bubble layout.
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('keeps the document layout for a single-speaker recording', () => {
    const soloSegments: TranscriptSegment[] = [
      { id: 'seg-solo', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0, paragraph_breaks: [] },
    ]
    const { container } = render(
      <TranscriptView segments={soloSegments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />
    )
    // Document layout uses no side-alignment rows.
    expect(container.querySelector('.items-end')).toBeNull()
    expect(container.querySelector('.items-start')).toBeNull()
  })

  it('shows modal with annotation content when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    // Explanation is rendered inside AnnotationCard inside the Modal
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    // At least one close button should be present
    expect(screen.getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0)
  })

  it('closes modal when X button is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /close/i })[0]!)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('does not render speaker labels — bubble alignment carries identity', () => {
    render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />
    )
    // The "You"/"Them" eyebrow labels were removed (commit 695cd81): bubble
    // side-alignment + per-role fill already communicate speaker identity.
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    expect(screen.queryByText('Them')).not.toBeInTheDocument()
  })

  it('hides the Study prompt while an annotation sheet is open (overlap regression)', async () => {
    // Regression: the "Study N saved" pill (fixed, z-50) used to paint over
    // the open sheet's Ignore / Save buttons (z-45). It must disappear while
    // a sheet is open, like the sibling "Next correction" / "Mark reviewed"
    // cues already do.
    render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        addedAnnotations={new Map([['ann-1', 'pi-1']])}
        onLaunchStudy={vi.fn()}
      />
    )
    // Pill is visible while no sheet is open.
    expect(screen.getByRole('button', { name: /Go to Study/i })).toBeInTheDocument()
    // Open the annotation sheet.
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    // Pill must be gone so it can't sit over the sheet's actions.
    expect(screen.queryByRole('button', { name: /Go to Study/i })).not.toBeInTheDocument()
  })

  it('raises the Next-correction cue above the Study pill so the two never overlap (regression)', async () => {
    // Regression: the Study pill (fixed, z-50, anchored at --toast-bottom) and
    // the Next-correction cue (fixed, z-40) resolved to the *same* bottom
    // offset on mobile (--toast-bottom === 5rem + safe-area there), so the
    // Study pill painted directly over the cue. When both are visible the cue
    // must anchor higher to clear the Study pill.
    class IO {
      cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) { this.cb = cb }
      observe() {
        // Report the observed last annotation as below the fold.
        this.cb(
          [{ isIntersecting: false, boundingClientRect: { top: 9999 } } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    const orig = window.IntersectionObserver
    // @ts-expect-error — minimal test stub
    window.IntersectionObserver = IO
    try {
      render(
        <TranscriptView
          segments={segments}
          annotations={annotations}
          userSpeakerLabels={['A']}
          {...defaultProps}
          addedAnnotations={new Map([['ann-1', 'pi-1']])}
          onLaunchStudy={vi.fn()}
        />
      )
      const studyBtn = await screen.findByRole('button', { name: /Go to Study/i })
      const nextBtn = await screen.findByRole('button', { name: /Next correction/i }, { timeout: 1500 })
      const studyDock = studyBtn.closest('.fixed') as HTMLElement
      const nextDock = nextBtn.closest('.fixed') as HTMLElement
      // Distinct fixed docks…
      expect(nextDock).not.toBe(studyDock)
      // …and the cue is anchored above the Study pill's toast slot, not on it.
      expect(nextDock.style.bottom).toContain('var(--toast-bottom)')
    } finally {
      window.IntersectionObserver = orig
    }
  })

  it('applies saved class to a highlight when annotation is in addedAnnotations', () => {
    render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        addedAnnotations={new Map([['ann-1', 'pi-1']])}
      />
    )
    expect(screen.getByText('Yo fui')).toHaveClass('annotation-saved')
  })

})

describe('TranscriptView paragraph rendering', () => {
  it('renders a single <p> when paragraph_breaks is empty (legacy)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    // Speaker label is also a <p>, so we filter to ones that contain segment text.
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p =>
      p.textContent?.includes('Yo fui al mercado.'),
    )
    expect(paragraphs).toHaveLength(1)
  })

  it('renders one <p> per paragraph when paragraph_breaks is populated', () => {
    const longText = 'Primera parte aquí. Segunda parte aquí. Tercera parte aquí.'
    // 'Segunda parte aquí.' starts at index 20.
    // 'Tercera parte aquí.' starts at index 40.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-long', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 5000, position: 0, paragraph_breaks: [20, 40] },
    ]
    const { container } = render(
      <TranscriptView segments={longSegments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p => {
      const text = p.textContent ?? ''
      return text.includes('parte aquí.') && !text.includes('You')
    })
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].textContent).toContain('Primera parte aquí.')
    expect(paragraphs[1].textContent).toContain('Segunda parte aquí.')
    expect(paragraphs[2].textContent).toContain('Tercera parte aquí.')
  })

  it('renders an annotation that lives in the second paragraph with rebased offsets', async () => {
    const longText = 'Primera parte aquí. Yo fui al mercado.'
    // 'Yo fui al mercado.' starts at index 20.
    // The "Yo fui" annotation has segment-relative offsets 20..26.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-2p', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 4000, position: 0, paragraph_breaks: [20] },
    ]
    const para2Annotations: Annotation[] = [
      { id: 'ann-p2', session_id: 's1', segment_id: 'seg-2p', type: 'grammar',
        original: 'Yo fui', start_char: 20, end_char: 26, correction: 'Fui',
        explanation: 'Drop pronoun.', sub_category: 'other',
        flashcard_front: null, flashcard_back: null, flashcard_note: null,
        importance_score: null, importance_note: null,
        is_unhelpful: false, unhelpful_at: null },
    ]
    render(
      <TranscriptView
        segments={longSegments}
        annotations={para2Annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
      />,
    )
    // The annotated phrase still renders as a <mark>, and clicking it still
    // opens the AnnotationSheet (proves the rebasing didn't break navigation).
    const mark = screen.getByText('Yo fui')
    expect(mark.tagName).toBe('MARK')
    await userEvent.click(mark)
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })
})
