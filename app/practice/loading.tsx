export default function PracticeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-32 bg-surface rounded-md" />
      {/* Pill row */}
      <div className="flex gap-2 overflow-hidden">
        {[80, 60, 90, 70, 55].map((w, i) => (
          <div key={i} className="h-8 bg-surface rounded-full flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>
      {/* List items */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <div className="h-4 bg-surface-elevated rounded w-3/4" />
            <div className="h-3 bg-surface-elevated rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
