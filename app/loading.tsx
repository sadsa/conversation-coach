export default function HomeLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 w-52 bg-surface rounded-md" />
        <div className="h-4 w-80 bg-surface rounded-md mt-2" />
      </div>
      {/* Upload row placeholder */}
      <div className="h-14 bg-surface border border-border rounded-xl" />
      {/* Session list */}
      <div className="space-y-3">
        <div className="h-4 w-28 bg-surface rounded" />
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <div className="h-4 bg-surface-elevated rounded w-2/3" />
            <div className="h-3 bg-surface-elevated rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
