// app/sessions/[id]/loading.tsx
//
// Streamed by Next.js while the server-side loader runs. Mirrors the
// transcript page's actual shape (title + meta line + progress strip +
// a few transcript blocks) so the click-to-paint transition lands
// gently instead of flashing blank.
export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading transcript</span>
      <header className="space-y-3">
        <div className="h-7 w-2/3 bg-surface-elevated rounded" />
        <div className="h-4 w-1/3 bg-surface-elevated rounded" />
        <div className="h-1 w-full bg-surface-elevated rounded-full" />
      </header>
      <div className="space-y-6 max-w-prose">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-12 bg-surface-elevated rounded" />
            <div className="h-5 w-full bg-surface-elevated rounded" />
            <div className="h-5 w-11/12 bg-surface-elevated rounded" />
            <div className="h-5 w-3/4 bg-surface-elevated rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
