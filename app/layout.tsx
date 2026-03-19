// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your Spanish conversations',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0f0f0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <FontSizeProvider />
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
          <div className="flex items-center gap-4">
            <a href="/practice" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
              Practice Items
            </a>
            <a href="/settings" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
              Settings
            </a>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
