// components/LessonPhaseRail.tsx
//
// Four-node phase indicator for lesson sessions. Purely display — no
// internal state. Phases: explain → model → drill → free_use.
// Nodes: pending (outlined) | active (violet + pulse ring) | done (emerald + check).

export type LessonPhase = 'explain' | 'model' | 'drill' | 'free_use'

const PHASES: { id: LessonPhase; label: string }[] = [
  { id: 'explain',  label: 'Explain' },
  { id: 'model',    label: 'Model' },
  { id: 'drill',    label: 'Drill' },
  { id: 'free_use', label: 'Free use' },
]

const ORDER: LessonPhase[] = ['explain', 'model', 'drill', 'free_use']

type PhaseStatus = 'done' | 'active' | 'pending'

function statusOf(phase: LessonPhase, current: LessonPhase): PhaseStatus {
  const idx = ORDER.indexOf(phase)
  const curIdx = ORDER.indexOf(current)
  if (idx < curIdx) return 'done'
  if (idx === curIdx) return 'active'
  return 'pending'
}

interface Props {
  currentPhase: LessonPhase
}

export function LessonPhaseRail({ currentPhase }: Props) {
  return (
    <div
      role="list"
      aria-label="Lesson phases"
      className="flex items-start px-4 pt-3"
    >
      {PHASES.map((phase, i) => {
        const status = statusOf(phase.id, currentPhase)
        const isLast = i === PHASES.length - 1

        return (
          <div
            key={phase.id}
            role="listitem"
            data-phase={phase.id}
            data-status={status}
            aria-current={status === 'active' ? 'step' : undefined}
            className="flex flex-col items-center flex-1"
          >
            <div className="relative flex items-center w-full">
              {/* Left connector line (hidden for first item) */}
              <div
                aria-hidden
                className={[
                  'flex-1 h-px',
                  i === 0 ? 'invisible' : '',
                  status === 'done' ? 'bg-status-done' : 'bg-border',
                ].join(' ')}
              />

              {/* Node */}
              <div
                aria-hidden
                className={[
                  'w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 relative z-10',
                  status === 'active'
                    ? 'bg-accent-primary border-accent-primary shadow-[0_0_0_3px_oklch(40%_0.1_285_/_0.4)]'
                    : status === 'done'
                    ? 'bg-status-done border-status-done'
                    : 'bg-bg border-border',
                ].join(' ')}
              >
                {status === 'done' && (
                  <svg
                    width="8" height="8" viewBox="0 0 8 8"
                    fill="none" stroke="white" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="1 4 3 6 7 2" />
                  </svg>
                )}
                {status === 'active' && (
                  <div aria-hidden className="w-[5px] h-[5px] rounded-full bg-on-accent" />
                )}
              </div>

              {/* Right connector line (hidden for last item) */}
              <div
                aria-hidden
                className={[
                  'flex-1 h-px',
                  isLast ? 'invisible' : '',
                  status === 'done' ? 'bg-status-done' : 'bg-border',
                ].join(' ')}
              />
            </div>

            <span
              className={[
                'mt-[5px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-center leading-tight',
                status === 'active' ? 'text-text-primary' : '',
                status === 'done' ? 'text-status-done' : '',
                status === 'pending' ? 'text-text-tertiary' : '',
              ].join(' ')}
            >
              {phase.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
