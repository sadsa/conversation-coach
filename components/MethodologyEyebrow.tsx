// components/MethodologyEyebrow.tsx
//
// Small "Practise → Review → Study" row that sits beneath the page H1
// on /, /review, and /write. Names the three-pillar methodology and
// shows the user where they are inside it.
//
// Behaviour rules:
//   - The active pillar renders as a non-interactive <span> in accent.
//     The other two render as <Link>s to their routes.
//   - Each pillar wears `py-1 -my-1 px-1.5 -mx-1.5` so the visible
//     glyph stays at 11px but the hit area reaches WCAG-AA 24×24pt.
//     The eyebrow reads as a tight decorative row visually while
//     staying thumb-friendly on a phone.
//
// History: an earlier version surfaced a numeric "study count" badge
// beside the Study pillar when corrections were waiting. The badge was
// dropped — it duplicated a signal the bottom-nav already carries, and
// it added a second active-attention cue to a row whose job is purely
// orientation (where am I inside the methodology?). The eyebrow now
// stays a calm three-word teaching strip; the queue length lives in
// one place (the nav).
//
// The route stays `/write` (URL stability per CLAUDE.md); only the
// visible label reads as "Study" — the methodology vocabulary the home
// redesign established.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'

type Pillar = 'practise' | 'review' | 'study'

interface Props {
  active: Pillar
}

const PILLAR_HREF: Record<Pillar, string> = {
  practise: '/',
  review: '/review',
  study: '/write',
}

const PILLAR_LABEL_KEY: Record<Pillar, string> = {
  practise: 'home.pillarPractise',
  review: 'home.pillarReview',
  study: 'home.pillarStudy',
}

// Shared padding rule: visible chip stays 11px but expands the hit
// rectangle out by 4px vertical / 6px horizontal via negative margins.
// Keeps the eyebrow looking like one tight line while each item is
// thumb-friendly.
const HIT_AREA = 'py-1 -my-1 px-1.5 -mx-1.5 rounded'

export function MethodologyEyebrow({ active }: Props) {
  const { t } = useTranslation()

  function renderPillar(pillar: Pillar) {
    const isActive = pillar === active
    const label = t(PILLAR_LABEL_KEY[pillar])

    if (isActive) {
      return (
        <span className={`text-accent-primary ${HIT_AREA}`} aria-current="page">
          {label}
        </span>
      )
    }

    return (
      <Link
        href={PILLAR_HREF[pillar]}
        className={`
          text-text-tertiary hover:text-text-primary transition-colors
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-accent-primary focus-visible:ring-offset-2
          ${HIT_AREA}
        `}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav
      aria-label={t('home.pillarAria')}
      className="
        flex items-center gap-2 flex-wrap pt-1.5
        text-[0.6875rem] font-semibold tracking-[0.14em] uppercase
      "
    >
      {renderPillar('practise')}
      <span aria-hidden="true" className="text-text-tertiary/50">→</span>
      {renderPillar('review')}
      <span aria-hidden="true" className="text-text-tertiary/50">→</span>
      {renderPillar('study')}
    </nav>
  )
}
