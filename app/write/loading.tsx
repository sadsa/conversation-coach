// app/write/loading.tsx
//
// Streamed by Next.js while the server-side practice-items query
// runs. Mirrors the page's actual shape (title + view toggle + a few
// rows) so the transition doesn't collapse the surface into a tiny
// grey label and then snap back.
import { Skeleton, SkeletonRow } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <Skeleton tone="elevated" className="h-7 w-24" radius="md" />
      <div className="flex justify-end">
        <Skeleton tone="elevated" className="h-5 w-28" radius="full" />
      </div>
      <div className="space-y-2">
        <SkeletonRow titleWidth="w-5/6" subtitleWidth={null} />
        <SkeletonRow titleWidth="w-3/4" subtitleWidth={null} />
        <SkeletonRow titleWidth="w-2/3" subtitleWidth={null} />
      </div>
    </div>
  )
}
