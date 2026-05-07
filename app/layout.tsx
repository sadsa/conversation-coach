// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ConditionalNav } from '@/components/ConditionalNav'
import { ScrollToTopOnNavigate } from '@/components/ScrollToTopOnNavigate'
import { NavProgress } from '@/components/NavProgress'
import { LanguageProvider } from '@/components/LanguageProvider'
import { getAuthenticatedUser } from '@/lib/auth'
import type { TargetLanguage } from '@/lib/types'
import { TARGET_LANGUAGES } from '@/lib/types'
import { inferUiLanguage } from '@/lib/i18n'
import { THEME_COLOR, STATUS_BAR_STYLE } from '@/lib/theme-meta'
import { fontBody, fontDisplay } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your conversations',
  manifest: '/manifest.json',
  // iOS "Add to Home Screen" ignores manifest icons; it needs a PNG
  // apple-touch-icon (SVG in the manifest alone yields a generic snapshot).
  icons: {
    apple: '/apple-touch-icon.png',
  },
  // Tells iOS Safari this site is PWA-capable. Required for
  // `apple-mobile-web-app-status-bar-style` to actually take effect on
  // standalone launches — without it iOS draws its full Safari chrome.
  appleWebApp: {
    capable: true,
    statusBarStyle: STATUS_BAR_STYLE.light,
    title: 'Coach',
  },
}

export const viewport: Viewport = {
  // iOS PWA in standalone mode overlays the status bar and home indicator
  // on top of our content. `viewport-fit: cover` is what unlocks
  // `env(safe-area-inset-*)` returning the real inset values — without it,
  // the FAB/BottomNav padding-bottom and header padding-top all evaluate
  // to 0 and the chrome ends up sitting under the system bars.
  viewportFit: 'cover',
  // NOTE: `themeColor` is set dynamically below (raw <meta> + pre-paint
  // script + ThemeProvider) instead of via this export, because we need it
  // to follow the user's in-app theme toggle, not the system colour scheme.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const rawLang = user?.targetLanguage ?? undefined
  const initialTargetLanguage: TargetLanguage =
    rawLang && rawLang in TARGET_LANGUAGES ? (rawLang as TargetLanguage) : 'es-AR'
  const uiLanguage = inferUiLanguage(initialTargetLanguage)

  // Inline pre-paint script — runs before React hydrates so the system
  // chrome (status bar, address bar) is already painted in the user's
  // chosen theme on first frame. Without this, the page boots with the
  // light defaults below and snaps to dark a moment later, which is jarring
  // on every PWA launch for dark-theme users. Keep the THEME_COLOR /
  // STATUS_BAR_STYLE values here in lock-step with `lib/theme-meta.ts` —
  // we inline the JSON so the script is self-contained and runs even with
  // JS bundles still in flight.
  const themeBootstrapScript = `
    (function() {
      try {
        var s = localStorage.getItem('fontSize');
        if (s) document.documentElement.style.fontSize = s + 'px';
        var t = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
        if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        var color = ${JSON.stringify(THEME_COLOR)}[t];
        var style = ${JSON.stringify(STATUS_BAR_STYLE)}[t];
        var tc = document.querySelector('meta[name="theme-color"]');
        if (tc) tc.setAttribute('content', color);
        var sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (sb) sb.setAttribute('content', style);
      } catch (e) {}
    })();
  `

  return (
    <html
      lang={uiLanguage}
      suppressHydrationWarning
      className={`overflow-x-hidden ${fontBody.variable} ${fontDisplay.variable}`}
    >
      <head>
        {/* Light-theme default for the Android / Safari address-bar tint.
            The matching iOS PWA `apple-mobile-web-app-status-bar-style`
            tag is emitted by Next.js from `metadata.appleWebApp` above —
            don't duplicate it here. The pre-paint script below overrides
            both with the user's stored theme before first paint, and
            ThemeProvider keeps them in sync on subsequent toggles. */}
        <meta name="theme-color" content={THEME_COLOR.light} />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('SW registration failed:', err);
            });
          }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-screen bg-bg text-text-primary">
        <LanguageProvider initialTargetLanguage={initialTargetLanguage}>
          <ThemeProvider>
            <FontSizeProvider />
            <ScrollToTopOnNavigate />
            <NavProgress />
            {/* tabIndex={-1} so the skip-to-content link in AppHeader actually
                moves focus here on activation. Without it, browsers scroll to
                the anchor but the next Tab fires from <body>, defeating the
                whole point for keyboard / screen-reader users. */}
            <main
              id="main-content"
              tabIndex={-1}
              // Push content below both the visual header chrome AND the iOS
              // status-bar safe area, since the fixed AppHeader now extends
              // its own background up under the status bar.
              style={{
                marginTop: 'calc(var(--header-height) + var(--voice-strip-height) + env(safe-area-inset-top))',
                scrollMarginTop: 'calc(var(--header-height) + var(--voice-strip-height) + env(safe-area-inset-top))',
                // paddingBottom grows when the mobile voice controls are
                // active so bottom content isn't hidden under the wave
                // surface. --voice-bottom-height is written by VoiceWaveMode.
                // max() keeps at least 5rem (≈ pb-20) even with no session.
                paddingBottom: 'max(5rem, calc(var(--voice-bottom-height, 0px) + 0.75rem))',
                transition: 'margin-top 180ms var(--ease-out-quart), padding-bottom 300ms var(--ease-out-quart)',
              }}
              className="max-w-2xl mx-auto px-6 md:px-10 pt-8 md:pt-12 focus:outline-none"
            >
              {children}
            </main>
            <ConditionalNav />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
