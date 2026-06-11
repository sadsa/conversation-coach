// components/MethodologyEyebrow.tsx
//
// The orientation strip that sits beneath the page H1 on /, /review, and
// /refine. Names the three pillars of the methodology and shows which one
// the user is currently inside.
//
// Surface shape: a numbered step rail, NOT the older arrow-text row.
//
//        ●───────○───────○
//        1       2       3
//     PRACTISE REVIEW  STUDY
//
//   - Each step is a circular numbered node + uppercase label below.
//   - A thin rail line passes behind the nodes, hidden under the circles
//     and visible in the two gaps between them.
//   - The active step's circle is filled with `accent-primary` and wears
//     a soft `accent-chip` halo (the same chip tint used by the door
//     icon tiles, so the visual language carries between rail and
//     content). The active label renders in `accent-primary`.
//   - Inactive steps render as outlined circles with `text-tertiary`
//     labels; they're real `<Link>`s to their routes so deep-link nav
//     between pillars stays one-tap.
//
// A11y rules to preserve (covered by PractiseClient + ReviewClient
// tests):
//   - The active label element carries `aria-current="page"` directly
//     on the element that holds the text node — tests use
//     `getByText(label).toHaveAttribute('aria-current', 'page')`, so
//     don't bury the text deeper than that.
//   - Each inactive label sits inside an `<a>` (Link) so
//     `getByText(label).closest('a')` resolves to the right href.
//   - The nav carries an `aria-label` (translated `home.pillarAria`) so
//     screen readers announce it as "Methodology navigation" rather
//     than another anonymous nav.
//
// Hit area: each Step uses py-1.5 px-2 + flex-1, giving roughly a
// 110×52px tap target on a typical 360px-wide phone — comfortably past
// the WCAG 44×44 floor without inflating the visible rail.
//
// History: an earlier version surfaced a numeric "study count" badge
// beside the Study pillar; it was dropped because the bottom-nav
// already carries that signal and a second active-attention cue
// fought the eyebrow's orientation job. We do not reintroduce counts
// here — the rail's job stays purely orientation.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'

// Exported so server pages and client islands can pass through a
// `lockedPillars` array without rebuilding the union type at every call
// site. Keeping the canonical definition here also means future pillar
// changes (rename / add) only update one place.
export type Pillar = 'speak' | 'review' | 'refine'

interface Props {
  active: Pillar
  /**
   * Pillars to render as locked (dashed, dimmed, non-interactive). Used
   * for empty accounts so the rail doesn't teach destinations the user
   * has no data flowing through yet — see the first-time-user critique
   * pass (2026-05). The active pillar can't be locked (you can't lock the
   * surface the user is currently on); any active entry in this set is
   * ignored.
   */
  lockedPillars?: ReadonlyArray<Pillar>
}

const PILLAR_HREF: Record<Pillar, string> = {
  speak: '/',
  review: '/review',
  refine: '/refine',
}

const PILLAR_LABEL_KEY: Record<Pillar, string> = {
  speak: 'home.pillarSpeak',
  review: 'home.pillarReview',
  refine: 'home.pillarRefine',
}

// Aria-label for the locked state. Practise is the methodology's entry
// point and never locks (lockable accounts always have at least
// `/` accessible), so it doesn't need a key here.
const PILLAR_LOCKED_KEY: Partial<Record<Pillar, string>> = {
  review: 'home.pillarLockedReview',
  refine: 'home.pillarLockedRefine',
}

// Ordered list — render order is the methodology order. Step number is
// `index + 1`, not stored separately, so we never get a "PRACTISE 2,
// REVIEW 1" desync between order and numbering.
const PILLARS: ReadonlyArray<Pillar> = ['speak', 'review', 'refine']

// Shared layout for the inner content of each step (circle + label).
// Lives outside renderStep because it's identical between the active
// span and the inactive Link branches.
const STEP_LAYOUT =
  'flex-1 flex flex-col items-center gap-1.5 py-1.5 px-2 rounded relative z-10'

const CIRCLE_BASE =
  'w-7 h-7 rounded-full flex items-center justify-center ' +
  'text-xs font-semibold tabular-nums leading-none ' +
  'transition-colors'

const LABEL_BASE =
  'text-xs font-semibold tracking-[0.12em] uppercase leading-none ' +
  'transition-colors'

export function MethodologyEyebrow({ active, lockedPillars }: Props) {
  const { t } = useTranslation()
  // Convert the locked array to a Set once for O(1) membership checks
  // during render. `active` is never lockable — locking the surface the
  // user is on would produce a non-interactive node with no destination
  // and the same chrome as the current page, which is just confusing.
  const lockedSet = new Set(
    (lockedPillars ?? []).filter(p => p !== active),
  )

  function renderStep(pillar: Pillar, index: number) {
    const isActive = pillar === active
    const isLocked = lockedSet.has(pillar)
    const label = t(PILLAR_LABEL_KEY[pillar])
    const num = index + 1
    const lockedKey = PILLAR_LOCKED_KEY[pillar]
    const lockedAria = isLocked && lockedKey ? t(lockedKey) : undefined

    const circle = (
      <span
        className={
          CIRCLE_BASE +
          ' ' +
          (isActive
            ? 'bg-accent-primary text-white ring-4 ring-accent-chip'
            : isLocked
              // Dashed border + dimmed colour signals "not reachable yet".
              // Stays distinct from the unlocked-inactive treatment (solid
              // border, group-hover state) so the rail teaches the user
              // which pillars they can already visit at a glance.
              ? 'bg-bg border border-dashed border-border text-text-tertiary opacity-60'
              : 'bg-bg border-[1.5px] border-border text-text-tertiary ' +
                'group-hover:border-text-secondary group-hover:text-text-secondary')
        }
        aria-hidden="true"
      >
        {num}
      </span>
    )

    const labelEl = (
      <span
        // Active step carries aria-current here so screen readers
        // announce "current page" alongside the pillar name. Tests
        // assert this attribute on the text element itself; if you
        // refactor to put the label inside an inner span, move the
        // attribute with it.
        aria-current={isActive ? 'page' : undefined}
        className={
          LABEL_BASE +
          ' ' +
          (isActive
            ? 'text-accent-primary'
            : isLocked
              ? 'text-text-tertiary opacity-70'
              : 'text-text-tertiary group-hover:text-text-secondary')
        }
      >
        {label}
      </span>
    )

    if (isActive) {
      // Non-interactive wrapper for the current step. Span (not Link)
      // so a tap on the current pillar doesn't navigate to itself.
      return (
        <span key={pillar} className={STEP_LAYOUT}>
          {circle}
          {labelEl}
        </span>
      )
    }

    if (isLocked) {
      // Non-interactive wrapper. aria-label carries the unlock condition
      // so screen readers / VoiceOver still understand what the dimmed
      // node represents. No `<Link>` — tapping a locked pillar would
      // land in the page's empty state, which is exactly the dead-end
      // we're locking against. The page-level empty states remain
      // reachable via the bottom nav for users who deliberately go
      // looking; the eyebrow just stops actively pointing at them.
      return (
        <span
          key={pillar}
          className={STEP_LAYOUT}
          aria-label={lockedAria ? `${label} — ${lockedAria}` : label}
          data-locked="true"
        >
          {circle}
          {labelEl}
        </span>
      )
    }

    return (
      <Link
        key={pillar}
        href={PILLAR_HREF[pillar]}
        className={
          'group ' + STEP_LAYOUT +
          ' focus-visible:outline-none focus-visible:ring-2' +
          ' focus-visible:ring-accent-primary focus-visible:ring-offset-2'
        }
      >
        {circle}
        {labelEl}
      </Link>
    )
  }

  return (
    <nav
      aria-label={t('home.pillarAria')}
      className="relative flex items-start justify-between pt-1.5"
    >
      {/* Connecting rail. Sits behind the nodes (z-0) so the opaque
          circles draw on top, leaving only the two between-node gaps
          visible. The 16.6667% inset on each side places the line's
          endpoints at the centers of the first and last circles —
          each step uses flex-1 (33.33% wide) with the circle
          centered, so the circle center sits one-sixth in from each
          edge. top-[28px] = nav pt-1.5 (6px) + step py-1.5 (6px) +
          circle radius (14px). If you change any of those three,
          recompute. */}
      <span
        aria-hidden="true"
        style={{ left: '16.6667%', right: '16.6667%' }}
        className="absolute top-[28px] h-px bg-border-subtle pointer-events-none"
      />

      {PILLARS.map((pillar, index) => renderStep(pillar, index))}
    </nav>
  )
}
