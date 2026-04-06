// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ConditionalNav } from '@/components/ConditionalNav'
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
  themeColor: '#0f0f0f',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const rawLang = user?.user_metadata?.target_language as string | undefined
  const initialTargetLanguage: TargetLanguage =
    rawLang && rawLang in TARGET_LANGUAGES ? (rawLang as TargetLanguage) : 'es-AR'
  const uiLanguage = inferUiLanguage(initialTargetLanguage)

  return (
    <html lang={uiLanguage} suppressHydrationWarning>
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
              if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body className="min-h-screen bg-bg text-text-primary overflow-x-hidden">
        <LanguageProvider initialTargetLanguage={initialTargetLanguage}>
          <ThemeProvider>
            <FontSizeProvider />
            <main className="max-w-4xl mx-auto px-6 pt-11 pb-8">{children}</main>
            <ConditionalNav />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
