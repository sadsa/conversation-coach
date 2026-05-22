// components/Button.tsx
//
// Primary action button used across upload flows, auth, and pipeline retries.
// Two variants (primary/secondary), two sizes (sm/md). For non-button elements
// that need the same look (e.g. mailto anchors), import `buttonStyles` and
// apply the className to your own element.

import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary'
type Size = 'sm' | 'md'

interface StyleOptions {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
}

// `disabled:opacity-50` was the previous universal disabled treatment. It
// reads as "pale primary" rather than "disabled" — the loud violet at half
// opacity becomes a soft lavender that almost looks decorative, losing the
// affordance. Greyed-out semantic tokens (surface-elevated + text-tertiary)
// communicate "this button exists but is not available" without weakening
// the brand color. Pointer treatment stays in BASE so every variant gets
// the not-allowed cue.
const BASE = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:cursor-not-allowed'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent-primary hover:bg-accent-primary-hover text-white ' +
    'disabled:bg-surface-elevated disabled:text-text-tertiary disabled:hover:bg-surface-elevated',
  secondary:
    'border border-border bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary ' +
    'disabled:bg-surface disabled:text-text-tertiary disabled:hover:bg-surface disabled:hover:text-text-tertiary',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-3 text-base',
}

export function buttonStyles({ variant = 'primary', size = 'sm', fullWidth = false, className = '' }: StyleOptions = {}): string {
  return [
    BASE,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ')
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    />
  )
})
