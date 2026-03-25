export default function InsightsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-52 bg-gray-800 rounded-md" />
        <div className="h-4 w-72 bg-gray-800 rounded-md mt-2" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-4 bg-gray-700 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-700 rounded" style={{ width: `${45 + i * 7}%` }} />
                <div className="h-3 bg-gray-700 rounded" style={{ width: `${60 + i * 5}%` }} />
              </div>
              <div className="w-7 h-6 bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
