// components/IosInstallIllustration.tsx
//
// Animated SVG teaching the iOS Safari share-to-install flow.
// Choreography (4s, ia-* keyframes from globals.css):
//   ~20%: finger tap appears on the Safari share button
//   ~35-55%: share sheet slides up with backdrop dim
//   ~62%+: "Add to Home Screen" row pulses

interface Props {
  ariaLabel: string
}

export function IosInstallIllustration({ ariaLabel }: Props) {
  return (
    <div
      className="relative w-[264px] h-[184px] rounded-2xl bg-bg border border-border overflow-hidden shadow-sm select-none"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Browser chrome: address bar + bottom toolbar */}
      <BrowserChrome />
      {/* Page content placeholder */}
      <PageContent />
      {/* Backdrop dims behind the sheet */}
      <span className="ia-backdrop absolute inset-0 bg-[oklch(12%_0.02_285)] pointer-events-none" />
      {/* Share sheet slides up */}
      <ShareSheet />
    </div>
  )
}

function BrowserChrome() {
  return (
    <>
      {/* Top address bar */}
      <div className="flex items-center h-7 px-3 gap-2 bg-surface border-b border-border-subtle">
        <div className="flex-1 h-4 rounded-full bg-border-subtle" />
        <div className="w-3 h-3 rounded-sm bg-border" />
      </div>
      {/* Bottom Safari toolbar */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-around h-8 px-3 bg-surface border-t border-border-subtle">
        {/* Back */}
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-accent-primary" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Forward (greyed) */}
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-border" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Share button — the touch target */}
        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-accent-primary" fill="none">
            <path d="M10 2v10M6 6l4-4 4 4M4 13v4h12v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {/* Finger tap on share button */}
          <span className="ia-touch absolute top-1/2 left-1/2 w-7 h-7 rounded-full bg-accent-primary pointer-events-none" />
        </div>
        {/* Bookmarks */}
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-accent-primary" fill="none">
          <path d="M4 2h8v12l-4-2.5L4 14V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Tabs */}
        <svg viewBox="0 0 16 16" className="w-4 h-4 text-accent-primary" fill="none">
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </>
  )
}

function PageContent() {
  // pb-8 reserves space so text lines don't bleed under the absolute bottom toolbar
  return (
    <div className="flex flex-col gap-2 px-4 py-3 pb-8">
      <div className="h-2 w-3/4 rounded-full bg-border-subtle" />
      <div className="h-2 w-full rounded-full bg-border-subtle" />
      <div className="h-2 w-2/3 rounded-full bg-border-subtle" />
    </div>
  )
}

function ShareSheet() {
  // bottom-0: sheet starts fully off-screen at translateY(100%) so the toolbar
  // is visible before the animation. The sheet slides up over the toolbar,
  // matching real iOS share sheet behaviour.
  return (
    <div className="ia-sheet absolute inset-x-0 bottom-0 bg-surface border-t border-border rounded-t-xl shadow-lg">
      <div className="flex justify-center pt-1.5 pb-1">
        <span className="block w-7 h-1 rounded-full bg-border" />
      </div>
      {/* App row icons (scroll-like strip) */}
      <div className="flex gap-3 px-4 py-2 border-b border-border-subtle overflow-hidden">
        {['📋', '📧', '💬', '🔗'].map(icon => (
          <div key={icon} className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-surface-elevated flex items-center justify-center text-sm">
              {icon}
            </div>
          </div>
        ))}
      </div>
      {/* Add to Home Screen row — the pulse target */}
      <div className="relative flex items-center gap-3 px-4 py-2.5">
        <div className="w-7 h-7 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-text-secondary" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 7v6M7 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[11px] font-medium text-text-primary leading-none">Add to Home Screen</span>
        {/* Pulse ring on the destination row */}
        <span className="ia-pulse absolute inset-0 rounded border-2 border-accent-primary pointer-events-none" />
      </div>
    </div>
  )
}
