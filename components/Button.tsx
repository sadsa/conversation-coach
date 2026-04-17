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

const BASE = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent-primary hover:bg-accent-primary-hover text-white',
  secondary: 'border border-border bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
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
