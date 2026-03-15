// components/SpeakerCard.tsx
'use client'

interface Props {
  label: 'A' | 'B'
  samples: string[]
  onSelect: (label: 'A' | 'B') => void
  disabled: boolean
}

export function SpeakerCard({ label, samples, onSelect, disabled }: Props) {
  return (
    <div className="border border-gray-700 rounded-xl p-5 space-y-4">
      <p className="text-xs uppercase tracking-widest text-gray-500">Speaker {label}</p>
      <ul className="space-y-2">
        {samples.map((s, i) => (
          <li key={i} className="text-sm text-gray-300 italic">&ldquo;{s}&rdquo;</li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(label)}
        disabled={disabled}
        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
      >
        That&apos;s me
      </button>
    </div>
  )
}
