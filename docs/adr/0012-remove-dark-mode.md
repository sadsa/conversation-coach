# ADR 0012 — Remove dark mode (light-only app)

**Date:** 2026-06-14  
**Status:** Accepted

## Context

The app shipped a light/dark theme toggle backed by a dual-palette token system:

- `components/ThemeProvider.tsx` — React context, `localStorage['theme']` persistence, runtime sync of system-chrome metas.
- `components/ThemeToggle.tsx` + a duplicate toggle in `components/AppHeader.tsx`.
- `lib/theme-meta.ts` — theme → `theme-color` / `apple-mobile-web-app-status-bar-style` mapping, switched at runtime.
- `app/layout.tsx` — inline no-flash script reading `localStorage` before paint.
- `app/globals.css` — a full `[data-theme="dark"]` token block (~80 lines) mirroring every `:root` light token.
- Scattered inline `dark:` Tailwind variants in `components/PracticeClient.tsx` and `components/LessonClient.tsx`.

Dark mode taxed feature work on three fronts simultaneously: (1) every new color had to be defined for both palettes or it shipped with broken dark-mode contrast; (2) inline `dark:` variants had to be hand-tuned per component; (3) the supporting infra (provider, no-flash script, status-bar sync, two toggle sites) was extra surface area on every shell/header refactor.

## Decision

Remove dark mode. The app is light-only.

- Delete `ThemeProvider`, `ThemeToggle`, the `AppHeader` toggle, `lib/theme-meta.ts`, the `app/layout.tsx` no-flash script, and the `[data-theme="dark"]` block in `globals.css`.
- Purge all inline `dark:` variants from `PracticeClient`/`LessonClient` (dead once `data-theme="dark"` never applies).
- **Keep the semantic CSS token system** (`bg-background`, `bg-surface`, `text-foreground`, …) collapsed to single light values in `:root`. The CLAUDE.md convention "use semantic tokens, never hardcode grays" stays in force.
- Hardcode the static light `theme-color` (`#faf6f1`) and `apple-mobile-web-app-status-bar-style: default` in `app/layout.tsx` metadata + `manifest.json`.

## Rationale

- All three costs above land on every feature; with near-zero reliance on dark mode, removing it buys real velocity.
- We kept semantic tokens rather than flattening to literal colors (the considered alternative). The dual *palette* was the tax — not the token indirection. A light-only token block still gives one-place palette edits at zero ongoing cost, and flattening would have been a large churny diff that reversed a documented convention.
- We deliberately did **not** add `prefers-color-scheme` handling — honouring the OS dark setting would re-introduce the exact dual-palette tax being removed.

## Consequences

- Users currently toggled to dark **snap to light** on next load. `color-scheme: light` in `:root` pins form controls/scrollbars. No migration or comms — accepted as a silent snap.
- Stale `localStorage['theme']='dark'` is left as inert dead data; no cleanup code added.
- `AppHeader.test.tsx` theme-toggle assertions and the `nav.switchToLight` / `nav.switchToDark` i18n keys are removed.
- Re-introducing dark mode later is a real effort (re-establish the `[data-theme="dark"]` token block + provider + no-flash script). That cost is the accepted trade-off for current simplicity.
