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
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your conversations',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#f8f6f2',
  // iOS PWA in standalone mode overlays the status bar and home indicator
  // on top of our content. `viewport-fit: cover` is what unlocks
  // `env(safe-area-inset-*)` returning the real inset values — without it,
  // the FAB/BottomNav padding-bottom and header padding-top all evaluate
  // to 0 and the chrome ends up sitting under the system bars.
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const rawLang = user?.targetLanguage ?? undefined
  const initialTargetLanguage: TargetLanguage =
    rawLang && rawLang in TARGET_LANGUAGES ? (rawLang as TargetLanguage) : 'es-AR'
  const uiLanguage = inferUiLanguage(initialTargetLanguage)

  return (
    <html lang={uiLanguage} suppressHydrationWarning className="overflow-x-hidden">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('SW registration failed:', err);
            });
          }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var s = localStorage.getItem('fontSize');
              if (s) document.documentElement.style.fontSize = s + 'px';
              var t = localStorage.getItem('theme');
              if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
            } catch (e) {}
          })();
        ` }} />
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
                marginTop: 'calc(var(--header-height) + env(safe-area-inset-top))',
                scrollMarginTop: 'calc(var(--header-height) + env(safe-area-inset-top))',
              }}
              className="max-w-4xl mx-auto px-6 pt-8 pb-20 focus:outline-none"
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
