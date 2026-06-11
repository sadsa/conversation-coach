// components/AndroidInstallIllustration.tsx
//
// Animated illustration teaching the Android Chrome install flow.
// Choreography (4s, ia-* keyframes from globals.css):
//   ~20%: finger tap appears on the ⋮ (three-dot) menu at top-right
//   ~35-55%: dropdown menu scales in from top-right, backdrop dims
//   ~62%+: "Add to Home screen" row pulses

interface Props {
  ariaLabel: string
}

export function AndroidInstallIllustration({ ariaLabel }: Props) {
  return (
    <div
      className="relative w-[264px] h-[184px] rounded-2xl bg-bg border border-border overflow-hidden shadow-sm select-none"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Chrome top bar with address bar + ⋮ menu */}
      <ChromeTopBar />
      {/* Page content placeholder */}
      <PageContent />
      {/* Backdrop dims behind the dropdown */}
      <span className="ia-backdrop absolute inset-0 bg-[oklch(12%_0.02_285)] pointer-events-none" />
      {/* Dropdown menu from top-right */}
      <DropdownMenu />
    </div>
  )
}

function ChromeTopBar() {
  return (
    <div className="flex items-center h-8 px-2 gap-1.5 bg-surface border-b border-border-subtle">
      {/* URL bar */}
      <div className="flex flex-1 items-center h-5 rounded-full bg-border-subtle px-2 gap-1.5">
        <div className="w-3 h-3 rounded-full bg-border" />
        <div className="flex-1 h-1.5 rounded-full bg-border" />
      </div>
      {/* Three-dot menu — the touch target */}
      <div className="relative flex flex-col gap-[2px] items-center justify-center w-5 h-5">
        {[0, 1, 2].map(i => (
          <span key={i} className="block w-[3px] h-[3px] rounded-full bg-text-tertiary" />
        ))}
        {/* Finger tap on ⋮ */}
        <span className="ia-touch absolute top-1/2 left-1/2 w-7 h-7 rounded-full bg-accent-primary pointer-events-none" />
      </div>
    </div>
  )
}

function PageContent() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="h-2 w-3/4 rounded-full bg-border-subtle" />
      <div className="h-2 w-full rounded-full bg-border-subtle" />
      <div className="h-2 w-2/3 rounded-full bg-border-subtle" />
      <div className="h-2 w-5/6 rounded-full bg-border-subtle" />
    </div>
  )
}

const MENU_ITEMS = ['New tab', 'Bookmarks', 'History', 'Downloads', 'Add to Home screen']

function DropdownMenu() {
  return (
    <div className="ia-dropdown absolute top-8 right-2 w-[142px] bg-surface border border-border-subtle rounded-lg shadow-lg overflow-hidden">
      {MENU_ITEMS.map((item, i) => (
        <div
          key={item}
          className={`relative flex items-center px-3 py-[6px]${i < MENU_ITEMS.length - 1 ? ' border-b border-border-subtle' : ''}`}
        >
          <span className="text-[9px] text-text-primary leading-none">{item}</span>
          {item === 'Add to Home screen' && (
            <span className="ia-pulse absolute inset-0 border-2 border-accent-primary pointer-events-none" />
          )}
        </div>
      ))}
    </div>
  )
}
