// components/WhatsAppShareIllustration.tsx
//
// The animated illustration for the second onboarding step: a tiny mock of a
// WhatsApp chat that plays the share-action choreography in 4 seconds — voice
// note appears → finger press-and-hold → share sheet rises from below → soft
// pulse on the Coach tile. Then it settles into the rest state (sheet up,
// Coach highlighted) so it teaches the destination, not the loop.
//
// All animation is CSS keyframes (defined in app/globals.css under the oa-*
// namespace, shared with the Upload illustration) using `animation-fill-mode:
// both`. That means reduced-motion users — for whom the global rule clamps
// duration to 0.01ms — snap straight to the resting frame, which is itself a
// useful, complete teaching state.

interface AppLabels {
  messages: string
  mail: string
  coach: string
  files: string
}

interface Props {
  /** Header for the share sheet (e.g. "Share voice note via…"). */
  shareTitle: string
  /** Translated labels for the four app tiles. */
  appLabels: AppLabels
  /** Name shown in the chat header. Defaults to "María" — recognisably
   *  Hispanic, fits the Spanish-learner audience without being on-the-nose. */
  contactName?: string
  /** Plain-text summary read by assistive tech in place of the animation.
   *  Required because the visual is the teaching moment — without this,
   *  screen-reader users would get the body copy below and miss the
   *  step-by-step demonstration. */
  ariaLabel: string
}

export function WhatsAppShareIllustration({
  shareTitle,
  appLabels,
  contactName = 'María',
  ariaLabel,
}: Props) {
  const initial = contactName.charAt(0).toUpperCase()

  return (
    <div
      className="relative w-[264px] h-[184px] rounded-2xl bg-bg border border-border overflow-hidden shadow-sm select-none"
      role="img"
      aria-label={ariaLabel}
    >
      <ChatHeader contactName={contactName} initial={initial} />
      <ChatBody />
      {/* Dim layer rises with the sheet — sits above chat, below the sheet. */}
      <span className="oa-backdrop absolute inset-0 bg-[oklch(12%_0.02_285)] pointer-events-none" />
      <ShareSheet shareTitle={shareTitle} appLabels={appLabels} />
    </div>
  )
}

// ─── Subcomponents (private to this file; not worth exporting) ──────────────

function ChatHeader({ contactName, initial }: { contactName: string; initial: string }) {
  return (
    <div className="flex items-center gap-2 h-8 px-3 bg-surface border-b border-border-subtle">
      <svg
        className="w-3 h-3 text-text-tertiary shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10 4 L6 8 L10 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="w-5 h-5 rounded-full bg-accent-chip flex items-center justify-center shrink-0">
        <span className="text-[9px] font-bold text-on-accent-chip leading-none">{initial}</span>
      </div>
      <span className="text-[11px] font-semibold text-text-primary leading-none">{contactName}</span>
    </div>
  )
}

function ChatBody() {
  return (
    <div className="relative h-[calc(100%-2rem)] px-3 pt-3">
      {/* Inline-block keeps the bubble tight to its content; the touch dot is
          positioned relative to it so it lands centred on the bubble. */}
      <div className="relative inline-flex items-center gap-2 bg-surface rounded-2xl rounded-tl-sm border border-border-subtle px-2.5 py-1.5 shadow-sm">
        <PlayButton />
        <Waveform />
        <span className="text-[9px] font-medium text-text-tertiary tabular-nums leading-none">
          0:42
        </span>
        {/* Press-and-hold finger pad. transform-origin is the element's own
            centre; the keyframes carry the centring translate alongside the
            scale so the dot stays anchored on the bubble's middle. */}
        <span
          className="oa-touch absolute top-1/2 left-1/2 w-8 h-8 rounded-full bg-accent-primary pointer-events-none"
        />
      </div>
    </div>
  )
}

function PlayButton() {
  return (
    <div className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center shrink-0">
      <svg className="w-2 h-2 ml-[1px]" viewBox="0 0 8 8" fill="white" aria-hidden="true">
        <path d="M1 0.5 L7 4 L1 7.5 Z" />
      </svg>
    </div>
  )
}

function Waveform() {
  // Hand-tuned bar heights so the waveform looks like a real recording, not a
  // monotonous picket fence. Pattern is gentle-loud-gentle, mimicking a phrase.
  const bars = [3, 6, 4, 9, 7, 5, 11, 8, 10, 6, 4, 7, 5]
  return (
    <svg
      width="68"
      height="14"
      viewBox="0 0 68 14"
      className="text-accent-primary opacity-60 shrink-0"
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 5}
          y={(14 - h) / 2}
          width="2.5"
          height={h}
          rx="1"
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

function ShareSheet({ shareTitle, appLabels }: { shareTitle: string; appLabels: AppLabels }) {
  // Order matches a real iOS share sheet: native messaging apps first, the
  // destination app (Coach) third — close enough to centre that the user's
  // eye lands on it, but not at position 1 which would feel implausible.
  const apps: Array<{ label: string; icon: string; coach?: boolean }> = [
    { label: appLabels.messages, icon: '💬' },
    { label: appLabels.mail, icon: '📧' },
    { label: appLabels.coach, icon: 'CC', coach: true },
    { label: appLabels.files, icon: '📁' },
  ]

  return (
    <div className="oa-sheet absolute inset-x-0 bottom-0 bg-surface border-t border-border rounded-t-xl shadow-lg pb-2.5">
      <div className="flex justify-center pt-1.5 pb-1">
        <span className="block w-7 h-1 rounded-full bg-border" />
      </div>
      <div className="text-[9.5px] text-text-tertiary text-center font-medium px-3 pb-1.5 border-b border-border-subtle">
        {shareTitle}
      </div>
      <div className="flex items-start justify-around px-2 pt-2.5">
        {apps.map(app => (
          <div
            key={app.label}
            className={`flex flex-col items-center gap-1 ${app.coach ? '' : 'opacity-50'}`}
          >
            <div
              className={`relative w-9 h-9 rounded-xl flex items-center justify-center ${
                app.coach ? 'bg-accent-primary' : 'bg-surface-elevated'
              }`}
            >
              {app.coach ? (
                <span className="text-white text-[9px] font-bold leading-none">CC</span>
              ) : (
                <span className="text-base leading-none">{app.icon}</span>
              )}
              {/* The pulse ring lives inside the Coach tile so its scale
                  emanates from the tile's centre. */}
              {app.coach && (
                <span className="oa-pulse absolute -inset-px rounded-xl border-2 border-accent-primary pointer-events-none" />
              )}
            </div>
            <span
              className={`text-[8.5px] text-center leading-none ${
                app.coach
                  ? 'text-accent-primary font-semibold'
                  : 'text-text-tertiary font-medium'
              }`}
            >
              {app.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
