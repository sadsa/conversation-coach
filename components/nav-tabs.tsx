// components/nav-tabs.tsx
//
// Shared navigation tabs used by NavDrawer and BottomNav so that the two
// nav surfaces can never drift apart. CLAUDE.md called this out as a known
// gotcha — keep all routes here.
//
// Tab order mirrors the methodology: Speak → Review → Refine.
// `/` is the Speak home (mode-picker for voice agent sessions and the
// "share a voice note" deep-dive); `/review` is the inbox of recorded
// conversations; `/refine` is the queue of saved corrections. Active voice
// sessions used to live on a separate /practice route — that's gone now;
// PracticeClient mounts in place on `/` when the user taps a mode door
// and unmounts on discard, so there's no second route to surface here.
//
// Settings is deliberately NOT a nav tab. It lives inside the account menu
// (NavDrawer footer on mobile, AppHeader avatar dropdown on desktop) along
// with Sign out — both are account-scoped chrome, not methodology pillars,
// so they shouldn't compete with Speak / Review / Refine in the thumb zone.
// See `components/AccountMenu.tsx`.
//
// Icons are Phosphor (regular + fill) — see `mockups/nav-icons.html` for
// the exploration that landed here. Active state swaps to the fill weight
// so the tab change is legible at a glance; colour-only state changes
// read as weak hierarchy in the thumb zone. Paths inlined verbatim from
// `@phosphor-icons/core@2.1.1`; no runtime dep added.

import type { ComponentType } from 'react'

export interface NavTab {
  href: string
  labelKey: string
  exact: boolean
  // Swaps Phosphor regular/fill by `active` — see phIcon below.
  icon: ComponentType<{ active: boolean }>
  iconLg: ComponentType<{ active: boolean }>
}

// Phosphor Icons regular + fill paths (viewBox 256x256, fill="currentColor").
// Keep the regular/fill pair together so swapping a glyph updates both states.
const PHOSPHOR_PATHS = {
  // Practise — microphone. Names the action (speak) rather than the
  // destination metaphor (chat bubble) of the previous Lucide glyph.
  microphone: {
    regular: 'M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.6V240a8,8,0,0,1-16,0V207.6A80.11,80.11,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.11,80.11,0,0,1,136,207.6Z',
    fill: 'M80,128V64a48,48,0,0,1,96,0v64a48,48,0,0,1-96,0Zm128,0a8,8,0,0,0-16,0,64,64,0,0,1-128,0,8,8,0,0,0-16,0,80.11,80.11,0,0,0,72,79.6V240a8,8,0,0,0,16,0V207.6A80.11,80.11,0,0,0,208,128Z',
  },
  // Review — list-magnifying-glass. Text lines with a search lens evokes
  // scanning a transcript for things worth correcting — closer to the
  // actual Review action than speech bubbles (which read as live chat).
  listMagnifyingGlass: {
    regular: 'M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,72h72a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm88,48H40a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16Zm109.66,13.66a8,8,0,0,1-11.32,0L206,177.36A40,40,0,1,1,217.36,166l20.3,20.3A8,8,0,0,1,237.66,197.66ZM184,168a24,24,0,1,0-24-24A24,24,0,0,0,184,168Z',
    fill: 'M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,72h72a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm88,48H40a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16Zm109.66,2.34L217.36,166A40,40,0,1,0,206,177.36l20.3,20.3a8,8,0,0,0,11.32-11.32Z',
  },
  // Study — book-open. Connotes long-form reinforcement; matches the
  // methodology eyebrow on the home.
  bookOpen: {
    regular: 'M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z',
    fill: 'M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z',
  },
} as const

function phIcon(glyph: keyof typeof PHOSPHOR_PATHS, size: 'sm' | 'lg') {
  const cls = size === 'sm' ? 'w-5 h-5 flex-shrink-0' : 'w-6 h-6'
  function NavPhosphorIcon({ active }: { active: boolean }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        fill="currentColor"
        className={cls}
        aria-hidden="true"
      >
        <path d={PHOSPHOR_PATHS[glyph][active ? 'fill' : 'regular']} />
      </svg>
    )
  }
  NavPhosphorIcon.displayName = `NavPhosphorIcon_${glyph}_${size}`
  return NavPhosphorIcon
}

export const NAV_TABS: NavTab[] = [
  {
    href: '/',
    labelKey: 'nav.speak',
    exact: true,
    icon: phIcon('microphone', 'sm'),
    iconLg: phIcon('microphone', 'lg'),
  },
  {
    href: '/review',
    labelKey: 'nav.review',
    exact: false,
    icon: phIcon('listMagnifyingGlass', 'sm'),
    iconLg: phIcon('listMagnifyingGlass', 'lg'),
  },
  {
    href: '/vocabulary',
    labelKey: 'nav.refine',
    exact: false,
    icon: phIcon('bookOpen', 'sm'),
    iconLg: phIcon('bookOpen', 'lg'),
  },
]

export function isTabActive(tab: NavTab, pathname: string): boolean {
  return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
}
