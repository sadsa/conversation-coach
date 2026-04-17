// components/Skeleton.tsx
//
// Loading-state placeholders used by Next.js `loading.tsx` boundaries and by
// inline pending states. The parent should own `animate-pulse` so a group of
// skeletons pulses in sync.
//
// `Skeleton` is the primitive block; `SkeletonRow` is the recurring "card with
// title + subtitle" composite that appears in the home / practice / settings
// loading screens.

type Tone = 'surface' | 'elevated'
type Radius = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const TONE_CLASS: Record<Tone, string> = {
  surface: 'bg-surface',
  elevated: 'bg-surface-elevated',
}

const RADIUS_CLASS: Record<Radius, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
}

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone
  radius?: Radius
}

export function Skeleton({ tone = 'surface', radius = 'md', className = '', ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`${TONE_CLASS[tone]} ${RADIUS_CLASS[radius]} ${className}`}
      {...rest}
    />
  )
}

interface SkeletonRowProps {
  /** Width of the title bar (Tailwind width class, e.g. "w-2/3"). */
  titleWidth?: string
  /** Width of the subtitle bar; pass null to omit. */
  subtitleWidth?: string | null
  className?: string
}

/**
 * Card-shaped skeleton with a title bar and optional subtitle bar — matches
 * the session list / practice list / settings list loading shape.
 */
export function SkeletonRow({
  titleWidth = 'w-2/3',
  subtitleWidth = 'w-1/3',
  className = '',
}: SkeletonRowProps) {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface border border-border rounded-xl p-4 space-y-2 ${className}`}
    >
      <Skeleton tone="elevated" className={`h-4 ${titleWidth}`} />
      {subtitleWidth && <Skeleton tone="elevated" className={`h-3 ${subtitleWidth}`} />}
    </div>
  )
}
