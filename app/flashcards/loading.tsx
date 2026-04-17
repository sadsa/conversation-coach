import { Skeleton } from '@/components/Skeleton'

export default function FlashcardsLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-pulse">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 space-y-4">
        <Skeleton tone="elevated" radius="sm" className="h-5 w-3/5 mx-auto" />
        <Skeleton tone="elevated" radius="sm" className="h-5 w-2/5 mx-auto" />
        <Skeleton tone="elevated" radius="xl" className="h-24 mt-6" />
      </div>
    </div>
  )
}
