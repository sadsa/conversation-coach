export default function HomeLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 w-52 bg-gray-800 rounded-md" />
        <div className="h-4 w-80 bg-gray-800 rounded-md mt-2" />
      </div>
      {/* Upload row placeholder */}
      <div className="h-14 bg-gray-800 border border-gray-700 rounded-xl" />
      {/* Session list */}
      <div className="space-y-3">
        <div className="h-4 w-28 bg-gray-800 rounded" />
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="h-4 bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
