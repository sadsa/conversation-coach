import { Skeleton, SkeletonRow } from '@/components/Skeleton'

export default function WriteLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-7 w-32" />
      {/* Pill row */}
      <div className="flex gap-2 overflow-hidden">
        {[80, 60, 90, 70, 55].map((w, i) => (
          <Skeleton key={i} radius="full" className="h-8 flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>
      {/* List items */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <SkeletonRow key={i} titleWidth="w-3/4" subtitleWidth="w-1/2" />
        ))}
      </div>
    </div>
  )
}
