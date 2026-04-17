import { Skeleton } from '@/components/Skeleton'

export default function InsightsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Skeleton tone="elevated" radius="sm" className="w-5 h-4" />
              <div className="flex-1 space-y-2">
                <Skeleton tone="elevated" radius="sm" className="h-4" style={{ width: `${45 + i * 7}%` }} />
                <Skeleton tone="elevated" radius="sm" className="h-3" style={{ width: `${60 + i * 5}%` }} />
              </div>
              <Skeleton tone="elevated" radius="sm" className="w-7 h-6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
