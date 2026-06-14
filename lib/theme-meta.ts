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
  // EXACT sRGB rendering of --color-bg (verified via canvas pixel probe in
  // Chrome). These MUST match byte-for-byte — any drift paints the status
  // bar a different shade than the page below it, producing a visible seam
  // at the top of the viewport (worst in dark mode). Re-probe and update
  // here whenever the --color-bg oklch tokens change.
  light: '#faf6f1', // = oklch(97.5% 0.008 75)
  dark: '#060911',  // = oklch(14% 0.02 265)
}

export const STATUS_BAR_STYLE: Record<ThemeName, 'default' | 'black' | 'black-translucent'> = {
  light: 'default', // opaque iOS status bar, dark text — reads as light chrome
  dark: 'black',    // opaque iOS status bar, light text — reads as dark chrome
}
