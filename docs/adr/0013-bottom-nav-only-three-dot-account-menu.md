# ADR 0013 — Bottom nav only; three-dot account menu in header

**Status:** Accepted  
**Date:** 2026-06-17

## Context

The app had two overlapping mobile navigation surfaces: a slide-in `NavDrawer` (opened by a hamburger button in the header) and a `BottomNav` fixed at the foot of the screen. Both showed the same three tabs (Speak, Review, Vocabulary). The drawer additionally hosted an account menu in its footer (avatar + Settings + Sign out).

This created redundancy: users could reach every navigation destination through either surface, and the hamburger competed for attention with the page content.

## Decision

Remove the `NavDrawer` and the hamburger button entirely. The `BottomNav` is the sole navigation surface on mobile.

Account actions (Settings, Sign out) move to a three-dot (`⋮`) button at the top-right of the header — the same position WhatsApp uses. The three-dot menu contains no identity information; identity (avatar, name, email) moves to the top of the Settings page.

The desktop header is unchanged: inline nav tabs on the left, avatar dropdown on the right.

## Alternatives considered

**Keep the drawer, add bottom nav:** Both surfaces stay, drawer becomes opt-in for power users. Rejected — the drawer's only unique content was the account menu, which fits cleanly in a three-dot button.

**Three-dot with identity header:** Show avatar + name at the top of the three-dot dropdown, matching the `AccountMenuDesktop` pattern. Rejected — the dropdown becomes tall, and identity is better surfaced on a dedicated Settings page where the user can act on it (language, text size).

## Consequences

- `NavDrawer` component and its tests are deleted.
- `AppHeader` no longer needs `isOpen`/`onOpen` props; `ConditionalNav` loses its open/close state.
- `AccountMenuMobile` (drawer footer) is replaced by `AccountMenuMobileHeader` (three-dot in header).
- `app/settings/page.tsx` converts from a client component to an RSC, passing user identity to a new `SettingsClient` island. This aligns with the existing pattern across all other pages.
