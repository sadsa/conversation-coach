// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import { ConditionalBottomNav } from '@/components/ConditionalBottomNav'
import { LanguageProvider } from '@/components/LanguageProvider'
import { getAuthenticatedUser } from '@/lib/auth'
import type { TargetLanguage } from '@/lib/types'
import { TARGET_LANGUAGES } from '@/lib/types'
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

  return (
    <html lang="en" suppressHydrationWarning>
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
            var s = localStorage.getItem('fontSize');
            if (s) document.documentElement.style.fontSize = s + 'px';
          })();
        ` }} />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">
        <LanguageProvider initialTargetLanguage={initialTargetLanguage}>
          <FontSizeProvider />
          <main className="max-w-4xl mx-auto px-6 py-8 pb-20">{children}</main>
          <ConditionalBottomNav />
        </LanguageProvider>
      </body>
    </html>
  )
}
