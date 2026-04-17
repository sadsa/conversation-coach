import { Skeleton, SkeletonRow } from '@/components/Skeleton'

export default function HomeLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 mt-2" />
      </div>
      {/* Upload row placeholder */}
      <Skeleton radius="xl" className="h-14 border border-border" />
      {/* Session list */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        {[0, 1, 2].map(i => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
