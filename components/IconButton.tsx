// components/IconButton.tsx
//
// Square icon-only button: toolbar actions, navigation arrows, overflow menu
// triggers, dismiss controls. Sizes target ≥36px touch zones (md) or 40px (lg);
// `sm` (32px) is reserved for very dense surfaces like Modal headers.

import { forwardRef } from 'react'
import { Icon } from '@/components/Icon'

type IconName = React.ComponentProps<typeof Icon>['name']
type Size = 'sm' | 'md' | 'lg'
type Shape = 'square' | 'circle'
type Variant = 'subtle' | 'bordered'
/**
 * Background colour the button hovers TO. Defaults to `surface-elevated` —
 * appropriate when the button sits on the page background. Pick `bg` when
 * the button itself sits on a surface-elevated card (e.g. AnnotationSheet)
 * so the hover state contrasts inwards rather than disappearing.
 */
type HoverBg = 'surface-elevated' | 'bg'

const SIZE_BOX: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
}

const SIZE_ICON: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
}

const SHAPE_CLASS: Record<Shape, string> = {
  square: 'rounded-md',
  circle: 'rounded-full',
}

const HOVER_BG_CLASS: Record<HoverBg, string> = {
  'surface-elevated': 'hover:bg-surface-elevated',
  bg: 'hover:bg-bg',
}

const VARIANT_BASE: Record<Variant, string> = {
  subtle: 'text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent',
  bordered: 'border border-border bg-surface text-text-secondary hover:text-text-primary disabled:opacity-30',
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  'aria-label': string
  size?: Size
  shape?: Shape
  variant?: Variant
  hoverBg?: HoverBg
  iconClassName?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    size = 'md',
    shape = 'square',
    variant = 'subtle',
    hoverBg = 'surface-elevated',
    iconClassName,
    className = '',
    type = 'button',
    ...rest
  },
  ref,
) {
  const composed = [
    SIZE_BOX[size],
    SHAPE_CLASS[shape],
    'flex items-center justify-center transition-colors',
    VARIANT_BASE[variant],
    variant === 'subtle' ? HOVER_BG_CLASS[hoverBg] : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button ref={ref} type={type} className={composed} {...rest}>
      <Icon name={icon} className={iconClassName ?? SIZE_ICON[size]} />
    </button>
  )
})
