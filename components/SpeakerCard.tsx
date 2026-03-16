// components/SpeakerCard.tsx
'use client'

interface Props {
  label: 'A' | 'B'
  samples: string[]
  onToggle: (label: 'A' | 'B') => void
  selected: boolean
  disabled: boolean
}

export function SpeakerCard({ label, samples, onToggle, selected, disabled }: Props) {
  return (
    <button
      onClick={() => onToggle(label)}
      disabled={disabled}
      className={`text-left border rounded-xl p-5 space-y-4 w-full transition-colors ${
        selected
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-gray-700 hover:border-gray-500'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-gray-500">Speaker {label}</p>
        {selected && (
          <span data-testid="checkmark" className="text-violet-400 text-sm">✓</span>
        )}
      </div>
      <ul className="space-y-2">
        {samples.map((s, i) => (
          <li key={i} className="text-sm text-gray-300 italic">&ldquo;{s}&rdquo;</li>
        ))}
      </ul>
    </button>
  )
}
