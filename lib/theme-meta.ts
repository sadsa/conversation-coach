// lib/theme-meta.ts
//
// Single source of truth for the system-chrome colors that live outside
// our normal CSS token system: the browser/PWA status bar.
//
// Two metas, two platforms:
//
//   • `<meta name="theme-color">`
//       — Android PWA standalone status bar: live, theme-color tints the
//         status bar background as the user toggles theme.
//       — Safari iOS browser tab: tints the address bar.
//       — Chrome desktop: tints the title bar (PWA window).
//
//   • `<meta name="apple-mobile-web-app-status-bar-style">`
//       — iOS PWA standalone status bar. iOS does NOT read `theme-color`
//         here; it only honours this style. Three values are valid
//         (`default` / `black` / `black-translucent`), and the value is
//         read by iOS at page load — a runtime change updates the meta
//         tag but the live system bar won't repaint until the user
//         re-launches the PWA. In practice that's fine — users toggle
//         theme then return to the PWA, and the next session matches.
//
// The hex values intentionally mirror `--color-bg` from globals.css so
// the system chrome reads as a continuation of the page background.
// When you change the bg token, update these too.

export type ThemeName = 'light' | 'dark'

export const THEME_COLOR: Record<ThemeName, string> = {
  light: '#f8f6f2', // mirrors --color-bg in light mode
  dark: '#13151c',  // mirrors --color-bg in dark mode (oklch 14% 0.02 265)
}

export const STATUS_BAR_STYLE: Record<ThemeName, 'default' | 'black' | 'black-translucent'> = {
  light: 'default', // opaque iOS status bar, dark text — reads as light chrome
  dark: 'black',    // opaque iOS status bar, light text — reads as dark chrome
}
