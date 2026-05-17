// components/nav-tabs.tsx
//
// Shared navigation tabs used by NavDrawer and BottomNav so that the two
// nav surfaces can never drift apart. CLAUDE.md called this out as a known
// gotcha — keep all routes here.
//
// Tab order mirrors the methodology: Practise → Review → Study → Settings.
// `/` is the Practise home (mode-picker for voice agent sessions and the
// "share a voice note" deep-dive); `/review` is the inbox of recorded
// conversations and saved corrections; `/write` keeps its underlying
// route but the user-facing label is "Study" so the nav, the methodology
// eyebrow on the home, and the brand vocabulary all match. The /practice
// route still exists for the active session shell but is reached from the
// home doors, not from a nav tab.
//
// Icons are Phosphor (regular + fill) — see `mockups/nav-icons.html` for
// the exploration that landed here. Active state swaps to the fill weight
// so the tab change is legible at a glance; colour-only state changes
// read as weak hierarchy in the thumb zone. Paths inlined verbatim from
// `@phosphor-icons/core@2.1.1`; no runtime dep added.

import type { ReactNode } from 'react'

export interface NavTab {
  href: string
  labelKey: string
  exact: boolean
  // Functions of `active` so we can render the regular weight when the
  // tab is inactive and the fill weight when it's active.
  icon: (active: boolean) => ReactNode
  iconLg: (active: boolean) => ReactNode
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
  // Review — chats. Two stacked speech bubbles names the artifact
  // (recordings ARE conversations) while Practise's microphone names
  // the act of speaking — complementary semantics. The label "Review"
  // supplies the verb; the icon supplies the noun.
  chats: {
    regular: 'M216,80H184V48a16,16,0,0,0-16-16H40A16,16,0,0,0,24,48V176a8,8,0,0,0,13,6.22L72,154V184a16,16,0,0,0,16,16h93.59L219,230.22a8,8,0,0,0,5,1.78,8,8,0,0,0,8-8V96A16,16,0,0,0,216,80ZM66.55,137.78,40,159.25V48H168v88H71.58A8,8,0,0,0,66.55,137.78ZM216,207.25l-26.55-21.47a8,8,0,0,0-5-1.78H88V152h80a16,16,0,0,0,16-16V96h32Z',
    fill: 'M232,96a16,16,0,0,0-16-16H184V48a16,16,0,0,0-16-16H40A16,16,0,0,0,24,48V176a8,8,0,0,0,13,6.22L72,154V184a16,16,0,0,0,16,16h93.59L219,230.22a8,8,0,0,0,5,1.78,8,8,0,0,0,8-8Zm-42.55,89.78a8,8,0,0,0-5-1.78H88V152h80a16,16,0,0,0,16-16V96h32V207.25Z',
  },
  // Study — book-open. Connotes long-form reinforcement; matches the
  // methodology eyebrow on the home.
  bookOpen: {
    regular: 'M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z',
    fill: 'M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z',
  },
  // Settings — faders-horizontal. Quieter than a gear; reads as
  // "preferences / dials" without the mechanical busyness of cog teeth.
  fadersHorizontal: {
    regular: 'M176,80a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H184A8,8,0,0,1,176,80ZM40,88H144v16a8,8,0,0,0,16,0V56a8,8,0,0,0-16,0V72H40a8,8,0,0,0,0,16Zm176,80H120a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16ZM88,144a8,8,0,0,0-8,8v16H40a8,8,0,0,0,0,16H80v16a8,8,0,0,0,16,0V152A8,8,0,0,0,88,144Z',
    fill: 'M184,80a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H192A8,8,0,0,1,184,80ZM40,88h96v16a8,8,0,0,0,8,8h16a8,8,0,0,0,8-8V56a8,8,0,0,0-8-8H144a8,8,0,0,0-8,8V72H40a8,8,0,0,0,0,16Zm176,80H128a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16ZM96,144H80a8,8,0,0,0-8,8v16H40a8,8,0,0,0,0,16H72v16a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V152A8,8,0,0,0,96,144Z',
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
  return (active: boolean) => <NavPhosphorIcon active={active} />
}

export const NAV_TABS: NavTab[] = [
  {
    href: '/',
    labelKey: 'nav.practise',
    exact: true,
    icon: phIcon('microphone', 'sm'),
    iconLg: phIcon('microphone', 'lg'),
  },
  {
    href: '/review',
    labelKey: 'nav.review',
    exact: false,
    icon: phIcon('chats', 'sm'),
    iconLg: phIcon('chats', 'lg'),
  },
  {
    href: '/write',
    labelKey: 'nav.study',
    exact: false,
    icon: phIcon('bookOpen', 'sm'),
    iconLg: phIcon('bookOpen', 'lg'),
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    exact: false,
    icon: phIcon('fadersHorizontal', 'sm'),
    iconLg: phIcon('fadersHorizontal', 'lg'),
  },
]

export function isTabActive(tab: NavTab, pathname: string): boolean {
  return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
}
