export default function FlashcardsLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-pulse">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 space-y-4">
        <div className="h-5 bg-surface-elevated rounded w-3/5 mx-auto" />
        <div className="h-5 bg-surface-elevated rounded w-2/5 mx-auto" />
        <div className="h-24 bg-surface-elevated rounded-xl mt-6" />
      </div>
    </div>
  )
}
