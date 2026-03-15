// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your Spanish conversations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
          <a href="/practice" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Practice Items
          </a>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
