# Bottom Nav — Design Spec

**Date:** 2026-04-15

## Overview

Reintroduce a two-tab bottom navigation bar (Home and Practice) as a persistent shortcut for quickly switching between the app's two primary screens. All other navigation remains in the hamburger drawer.

## Architecture

- **New component:** `components/BottomNav.tsx` — renders the fixed bar
- **Modified:** `components/ConditionalNav.tsx` — adds `<BottomNav />` alongside `<AppHeader>` and `<NavDrawer>`
- **Modified:** `app/layout.tsx` — bumps `<main>` bottom padding from `pb-8` to `pb-20`
- **New test:** `__tests__/components/BottomNav.test.tsx`

## Component: BottomNav

### Visibility
Shown on all authenticated pages. Hidden on the same routes as the rest of the nav (`HIDDEN_ON = ['/login', '/access-denied', '/onboarding']`), enforced by `ConditionalNav`.

### Tabs
| Tab | href | Match strategy |
|-----|------|---------------|
| Home | `/` | Exact |
| Practice | `/practice` | Prefix |

### Styling
- `fixed bottom-0 left-0 right-0 z-30`
- `bg-surface border-t border-border-subtle`
- `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` for iPhone safe area
- Bar height: `h-16`
- Active tab: `text-indigo-400`
- Inactive tab: `text-text-tertiary hover:text-text-secondary`
- Icons: same SVGs as NavDrawer TABS, `w-6 h-6`
- Labels: `t('nav.home')` / `t('nav.practice')` via `useTranslation`

### Z-index layering
- `BottomNav`: `z-30`
- `AppHeader`: `z-40`
- `NavDrawer` backdrop: `z-40`
- `NavDrawer` panel: `z-50`

The drawer slides out over the bottom nav without conflict.

## Tests

`__tests__/components/BottomNav.test.tsx`:
1. Renders both Home and Practice tabs
2. Home tab is active (`aria-current="page"`) when pathname is `/`
3. Practice tab is active when pathname is `/practice`
4. Practice tab is active when pathname is `/practice/something` (prefix match)
5. Neither tab active on unrelated route (e.g. `/settings`)
