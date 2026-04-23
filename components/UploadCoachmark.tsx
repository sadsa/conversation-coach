// components/UploadCoachmark.tsx
//
// First-run spotlight on the mobile Upload FAB. Renders a dim full-viewport
// backdrop (z-30), a small caption card floating just above the FAB, and a
// dismiss "X" anchored top-right. The FAB itself is NOT a child of this
// component — HomeClient bumps the FAB's z-index to 50 via the `highlight`
// prop on HomeUploadFab so it pierces the backdrop and reads as the lit
// subject of the spotlight. Keeping the FAB out of the dialog lets the
// existing tap → file-picker flow work unchanged; we just frame it.
//
// Mobile-only by design (`md:hidden` on the root). The desktop FAB sits
// inline in the page header where a coachmark would be heavyweight; on
// desktop the demoted "Revisit the tutorial" link plus the already-visible
// header FAB is enough.
//
// Dismiss paths:
//   • Tap the FAB itself (opens the file picker — coachmark consumed by
//     intent; HomeClient flips the dismissed flag in its onFile handler).
//   • Tap anywhere on the dim backdrop.
//   • Tap the X button.
//   • Press Escape.
// All paths funnel through onDismiss so persistence stays in one place.

'use client'
import { useEffect, useId } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

interface Props {
  onDismiss: () => void
}

export function UploadCoachmark({ onDismiss }: Props) {
  const { t } = useTranslation()
  const captionId = useId()

  // Escape dismisses, matching the convention of every other transient
  // overlay in the app (AnnotationSheet, modals). We attach to window
  // because there's no focused element inside the coachmark by default —
  // the actionable target is the FAB, which lives outside this subtree.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div
      role="dialog"
      aria-labelledby={captionId}
      aria-modal="false"
      data-testid="upload-coachmark"
      // `relative z-50` lifts this entire subtree into its own root-context
      // stacking layer ABOVE the AppHeader (z-40). Without an explicit
      // z-index here, the opacity-based fade-in animation creates a
      // stacking context at `z-auto`, which traps the children's internal
      // z-30/z-50 values — they can never beat the header even though
      // numerically they should. Moving the FAB to `z-50` in HomeUploadFab
      // is in the same root context and renders later in the DOM, so it
      // still paints above this wrapper (DOM order breaks the tie).
      className="md:hidden relative z-50 motion-safe:animate-coachmark-in"
    >
      {/* Backdrop — dims the whole page and acts as the outside-tap dismiss
          target. Sits at z-30 so the FAB (z-50 when highlighted) and the
          caption + X (z-50) read as bright above it. We don't dim the FAB
          itself; HomeClient lifts it above this layer. */}
      <button
        type="button"
        aria-label={t('home.coachmarkDismiss')}
        onClick={onDismiss}
        data-testid="upload-coachmark-backdrop"
        className="fixed inset-0 z-30 bg-black/55 cursor-pointer focus-visible:outline-none"
      />

      {/* Caption — floats just above the mobile FAB, anchored to the same
          right edge so the visual link between caption and target is
          unambiguous. Positioned with the same `right-4` offset and a bottom
          offset that clears the FAB (4.5rem nav + 3.5rem FAB + 0.75rem gap +
          safe area). Bright surface against the dim backdrop. */}
      <div
        className="fixed right-4 z-50 max-w-[16rem] rounded-xl bg-surface px-4 py-3 text-left shadow-xl ring-1 ring-black/5 dark:ring-white/10"
        style={{ bottom: 'calc(8.75rem + env(safe-area-inset-bottom))' }}
      >
        <p id={captionId} className="text-sm leading-snug text-text-primary">
          {t('home.coachmarkCaption')}
        </p>
        {/* Tail — small triangular notch pointing down at the FAB. Built
            from a rotated square clipped by overflow on the parent so it
            inherits the surface fill and ring. Pure CSS, no SVG. */}
        <span
          aria-hidden
          className="absolute -bottom-1.5 right-8 h-3 w-3 rotate-45 rounded-sm bg-surface ring-1 ring-black/5 dark:ring-white/10"
        />
      </div>

      {/* Dismiss X — sits BELOW the AppHeader bar (header height + safe-area
          + 0.75rem breathing room) so it doesn't visually collide with the
          burger menu or theme toggle inside the dimmed header. aria-label
          matches the backdrop so AT users get one consistent action name
          regardless of which target they hit. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('home.coachmarkDismiss')}
        data-testid="upload-coachmark-dismiss"
        className="fixed right-4 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary shadow-md ring-1 ring-black/5 transition-colors hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:ring-white/10"
        style={{ top: 'calc(var(--header-height) + env(safe-area-inset-top) + 0.75rem)' }}
      >
        <Icon name="close" className="w-4 h-4" aria-hidden />
      </button>
    </div>
  )
}
