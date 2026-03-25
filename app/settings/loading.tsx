export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 bg-gray-800 rounded-md" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="h-4 bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
