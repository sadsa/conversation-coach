'use client'
import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="space-y-6 text-center max-w-xs w-full px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Conversation Coach</h1>
          <p className="text-sm text-gray-400">Sign in to continue</p>
        </div>

        {sent ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-300">Check your email for a login link.</p>
            <button
              onClick={() => setSent(false)}
              className="text-xs text-gray-500 hover:text-gray-400 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-700 bg-gray-900 text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
