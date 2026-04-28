// components/LogoMark.tsx
//
// Robot logo mark without the square background — renders on any surface.
// The body fill adapts to the active theme via --color-surface so the
// robot feels at home in both light and dark modes. Brand greens are fixed.
//
// viewBox is cropped to the robot bounds (with stroke clearance), so the
// rendered square is tight around the character rather than carrying the
// original 1024×1024 padding.

interface Props {
  size?: number
  className?: string
}

export function LogoMark({ size = 64, className = '' }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="140 145 744 662"
      width={size}
      height={size}
      role="img"
      aria-label="Conversation Coach"
      className={className}
    >
      <defs>
        <linearGradient id="lm-face" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f5a3f" />
          <stop offset="100%" stopColor="#0a3f2f" />
        </linearGradient>
      </defs>

      {/* Antenna */}
      <circle cx="512" cy="214" r="43" fill="#d0eca7" stroke="#0f6545" strokeWidth="16" />
      <rect x="499" y="256" width="26" height="42" rx="8" fill="#0f6545" />

      {/* Body — fill adapts to theme */}
      <rect
        x="230" y="292" width="564" height="490" rx="150"
        fill="var(--color-surface)"
        stroke="#0f6545" strokeWidth="18"
      />

      {/* Arms */}
      <rect x="165" y="498" width="76" height="148" rx="26" fill="#c7e59c" stroke="#0f6545" strokeWidth="14" />
      <rect x="783" y="498" width="76" height="148" rx="26" fill="#c7e59c" stroke="#0f6545" strokeWidth="14" />

      {/* Face panel */}
      <rect
        x="284" y="432" width="456" height="260" rx="90"
        fill="url(#lm-face)"
        stroke="#0f6545" strokeWidth="14"
      />

      {/* Eye glows */}
      <ellipse cx="372" cy="560" rx="44" ry="54" fill="#c7e59c" />
      <ellipse cx="652" cy="560" rx="44" ry="54" fill="#c7e59c" />

      {/* Eye pupils */}
      <ellipse cx="350" cy="535" rx="18" ry="22" fill="#ffffff" />
      <ellipse cx="630" cy="535" rx="18" ry="22" fill="#ffffff" />

      {/* Smile */}
      <path d="M468 620c22 20 66 20 88 0" fill="none" stroke="#c7e59c" strokeLinecap="round" strokeWidth="16" />
    </svg>
  )
}
