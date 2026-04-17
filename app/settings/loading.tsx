import { Skeleton, SkeletonRow } from '@/components/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-7 w-28" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <SkeletonRow key={i} titleWidth="w-1/2" subtitleWidth={null} />
        ))}
      </div>
    </div>
  )
}
