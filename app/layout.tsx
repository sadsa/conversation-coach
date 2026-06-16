// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import { ConditionalNav } from '@/components/ConditionalNav'
import { ScrollToTopOnNavigate } from '@/components/ScrollToTopOnNavigate'
import { NavProgress } from '@/components/NavProgress'
import { LanguageProvider } from '@/components/LanguageProvider'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadUnreadCount } from '@/lib/loaders'
import type { TargetLanguage } from '@/lib/types'
import { TARGET_LANGUAGES } from '@/lib/types'
import { inferUiLanguage } from '@/lib/i18n'
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
    statusBarStyle: 'default',
    title: 'Coach',
  },
}

// System-chrome tint for the Android PWA status bar / Safari address bar.
// The app is light-only, so this is a single static value — keep it in
// lock-step with `--color-bg` in globals.css (verified sRGB rendering of
// oklch(97.5% 0.008 75)). When the bg token changes, update this too.
const THEME_COLOR_LIGHT = '#faf6f1'

export const viewport: Viewport = {
  // iOS PWA in standalone mode overlays the status bar and home indicator
  // on top of our content. `viewport-fit: cover` is what unlocks
  // `env(safe-area-inset-*)` returning the real inset values — without it,
  // the FAB/BottomNav padding-bottom and header padding-top all evaluate
  // to 0 and the chrome ends up sitting under the system bars.
  viewportFit: 'cover',
  themeColor: THEME_COLOR_LIGHT,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const rawLang = user?.targetLanguage ?? undefined
  const initialTargetLanguage: TargetLanguage =
    rawLang && rawLang in TARGET_LANGUAGES ? (rawLang as TargetLanguage) : 'es-AR'
  const uiLanguage = inferUiLanguage(initialTargetLanguage)
  const unreviewedCount = user ? await loadUnreadCount(user.id).catch(() => 0) : 0

  // Inline pre-paint script — runs before React hydrates so the user's
  // stored font size is applied on the first frame (FontSizeProvider syncs
  // it on subsequent changes). Kept inline so it runs even with JS bundles
  // still in flight.
  const fontSizeBootstrapScript = `
    (function() {
      try {
        var s = localStorage.getItem('fontSize');
        if (s) document.documentElement.style.fontSize = s + 'px';
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
        {/* The Android / Safari address-bar tint is emitted by Next.js from
            `viewport.themeColor` above; the matching iOS PWA
            `apple-mobile-web-app-status-bar-style` tag comes from
            `metadata.appleWebApp`. The app is light-only, so neither needs
            runtime overriding. */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('SW registration failed:', err);
            });
          }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: fontSizeBootstrapScript }} />
      </head>
      <body className="min-h-[100dvh] bg-bg text-text-primary flex flex-col">
        <LanguageProvider initialTargetLanguage={initialTargetLanguage}>
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
                marginTop: 'calc(var(--header-height) + env(safe-area-inset-top))',
                scrollMarginTop: 'calc(var(--header-height) + env(safe-area-inset-top))',
                // Clearance for fixed BottomNav (mobile) + breathing room.
                // `--bottom-nav-h` already encodes h-16 + safe-area-inset-bottom
                // and is zeroed on md+. Replaces a hardcoded 5rem that wasn't
                // enough on iOS PWAs with a home indicator — content was
                // overlapping the nav by ~18px. Wrappers on /, /review used
                // to compensate with their own pb; with this fix the
                // wrappers can drop their overrides and every page tab
                // gets the same baseline.
                paddingBottom: 'calc(var(--bottom-nav-h) + 1.5rem)',
              }}
              className="w-full max-w-2xl mx-auto px-6 md:px-10 pt-8 md:pt-12 focus:outline-none flex-1 flex flex-col"
            >
              {children}
            </main>
            <ConditionalNav
              unreviewedCount={unreviewedCount}
              user={{
                name: user?.displayName ?? null,
                email: user?.email ?? null,
                avatarUrl: user?.avatarUrl ?? null,
              }}
            />
        </LanguageProvider>
      </body>
    </html>
  )
}
