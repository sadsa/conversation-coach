'use client'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function AccessDeniedPage() {
  const router = useRouter()

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="space-y-6 text-center max-w-xs w-full px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-sm text-gray-400">
            Your account has not been granted access. Contact the app owner to request access.
          </p>
        </div>
        <button
          onClick={signOut}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
