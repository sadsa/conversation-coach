// components/WriteList.tsx
//
// The "Study" surface: a queue of saved corrections waiting to be
// written down on paper. Active items show at the top; studied items
// are pushed to the bottom, dimmed, and can be un-studied with a
// single trailing tap. The data noun is still `practice_items` in
// the DB and API — only the user-facing surface is named "Study".
'use client'
import Link from 'next/link'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { PracticeItem, TargetLanguage } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { WriteSheet } from '@/components/WriteSheet'
import { StrikeOriginal } from '@/components/StrikeOriginal'
import { CorrectionInContext } from '@/components/CorrectionInContext'
import { FlashcardRow } from '@/components/FlashcardRow'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'

const UNDO_TIMEOUT_MS = 5000

// Swipe gesture constants — copied verbatim from SessionList so both pillars
// (Review + Study) share one timing vocabulary. Any change here should be
// mirrored there, and vice versa.
const SWIPE_COMMIT_PX = 80
const SLIDE_DURATION_MS = 360
const FADE_DURATION_MS = 240
const COLLAPSE_OVERLAP_MS = 160
const COLLAPSE_DURATION_MS = 360
const CANCEL_DURATION_MS = 220
const EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

// One-shot swipe hint. Separate key from the sheet nav hint so they can be
// dismissed independently (different surfaces, different first-time moments).
const SWIPE_HINT_KEY = 'cc:write-swipe-hint:v1'

/**
 * Example correction shown inside the empty-state teaching card. The
 * example is in the user's TARGET language — they're being shown what
 * their own saved rows will look like, so the content has to match what
 * they're actually learning. Keying by targetLanguage (rather than the
 * UI language) keeps the model honest if we ever decouple UI vs target.
 *
 * Each pair is a learner-typical mistake for that target. Kept short
 * enough that the empty-state card stays one tidy line.
 *
 *   es-AR: drop the redundant subject pronoun (classic Rioplatense).
 *   en-NZ: tener-as-state calque from Spanish ("I have hunger" reads
 *          to a native ear the way "Yo fui" does to a Rioplatense ear).
 */
const EMPTY_STATE_EXAMPLE: Record<TargetLanguage, { original: string; correction: string }> = {
  'es-AR': { original: 'Yo fui', correction: 'Fui' },
  'en-NZ': { original: 'I have hunger', correction: "I'm hungry" },
}

/**
 * One-shot hint chip that appears above the Study queue on first visit.
 * Teaches swipe-left=delete / swipe-right=mark-written. Auto-dismisses
 * after 6 seconds or on "Got it" tap. Uses a dedicated localStorage key
 * (`cc:write-swipe-hint:v1`) so it's independent of the sheet nav hint.
 */
function WriteSwipeHint() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(SWIPE_HINT_KEY) === '1') return
    setVisible(true)
    const timer = window.setTimeout(() => dismiss(), 6000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    setVisible(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SWIPE_HINT_KEY, '1')
    }
  }

  if (!visible) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-chip border border-accent-chip-border/30 text-xs text-on-accent-chip motion-safe:animate-[fadein_220ms_ease-out_both]">
      <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
        <Icon name="chevron-left" className="w-3.5 h-3.5" />
        <Icon name="chevron-right" className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 leading-snug">{t('writeList.swipeHintText')}</span>
      <button
        type="button"
        onClick={dismiss}
        className="opacity-70 hover:opacity-100 text-xs font-medium px-1.5 py-0.5 rounded shrink-0 transition-opacity"
      >
        {t('writeList.swipeHintDismiss')}
      </button>
    </div>
  )
}

interface RowProps {
  item: PracticeItem
  isWritten: boolean
  onOpen: () => void
  /** Trailing tap target (Gmail pattern) — always visible, no animation. */
  onMarkWritten?: () => void
  /** Swipe-right commit — returns a long-lived Promise (undo window). */
  onMarkWrittenSwipe?: (item: PracticeItem) => Promise<boolean>
  /** Swipe-left commit — returns a long-lived Promise (undo window). */
  onDeleteSwipe: (item: PracticeItem) => Promise<boolean>
}

/**
 * Swipeable Study row.
 *
 * Gesture map:
 *   Left  → delete  (red reveal, same colour + timing as SessionList)
 *   Right → mark as written (teal reveal, widget-write-bg tokens)
 *
 * Both gestures use the same choreography as SessionList.SwipeableSessionItem:
 *   t=0     slide + fade begin
 *   t=160   collapse starts (overlap makes it one continuous motion)
 *   t=240   opacity reaches 0
 *   t=360   slide complete
 *   t=520   collapse complete
 *
 * The trailing "Done" button stays as the always-visible primary affordance;
 * swipe is additive (CLAUDE.md: "swipe gestures are additive accelerators
 * on top of an always-visible primary tap target").
 *
 * sr-only test seam buttons (`swipe-delete-${id}`, `swipe-mark-written-${id}`)
 * let unit tests trigger the swipe flows without simulating touch events in
 * JSDOM (same pattern as SessionList).
 */
function SwipeableWriteRow({
  item,
  isWritten,
  onOpen,
  onMarkWritten,
  onMarkWrittenSwipe,
  onDeleteSwipe,
}: RowProps) {
  const { t } = useTranslation()
  // translateX: negative = dragging left (delete), positive = dragging right (mark written)
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    setTranslateX(-window.innerWidth)
    const deletePromise = onDeleteSwipe(item)

    await new Promise(r => setTimeout(r, COLLAPSE_OVERLAP_MS))
    if (!mountedRef.current) return
    setRowHeight(0)

    const remainingMs = Math.max(
      SLIDE_DURATION_MS - COLLAPSE_OVERLAP_MS,
      COLLAPSE_DURATION_MS,
    )
    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, remainingMs)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true
    if (!succeeded) {
      // Undo or DELETE failure — restore the row.
      setRowHeight(1)
      setTranslateX(0)
      setIsAnimating(false)
    }
  }

  async function triggerMarkWritten() {
    if (isAnimating || !rowRef.current || !onMarkWrittenSwipe) return
    setIsAnimating(true)

    setTranslateX(window.innerWidth)
    const markPromise = onMarkWrittenSwipe(item)

    await new Promise(r => setTimeout(r, COLLAPSE_OVERLAP_MS))
    if (!mountedRef.current) return
    setRowHeight(0)

    const remainingMs = Math.max(
      SLIDE_DURATION_MS - COLLAPSE_OVERLAP_MS,
      COLLAPSE_DURATION_MS,
    )
    const [, markResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, remainingMs)),
      markPromise,
    ])
    if (!mountedRef.current) return

    const succeeded = markResult.status === 'fulfilled' && markResult.value === true
    if (!succeeded) {
      setRowHeight(1)
      setTranslateX(0)
      setIsAnimating(false)
    }
  }

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      if (isAnimating) return
      if (e.dir === 'Left') {
        setTranslateX(-e.absX)
      } else if (e.dir === 'Right' && onMarkWrittenSwipe) {
        setTranslateX(e.absX)
      } else {
        setTranslateX(0)
      }
    },
    onSwipedLeft: (e) => {
      if (e.absX > SWIPE_COMMIT_PX) {
        triggerDelete()
      } else {
        setTranslateX(0)
      }
    },
    onSwipedRight: (e) => {
      if (!onMarkWrittenSwipe) { setTranslateX(0); return }
      if (e.absX > SWIPE_COMMIT_PX) {
        // Snap back to 0 first so the commit animation (slide right) begins
        // from a neutral position — otherwise the card would teleport.
        setTranslateX(0)
        triggerMarkWritten()
      } else {
        setTranslateX(0)
      }
    },
    trackMouse: false,
  })

  return (
    <li
      ref={rowRef}
      // Outer clipper: overflow-hidden keeps the card inside the rounded
      // border during the collapse animation. The card's own border lives
      // on the inner div so the rounded shape is still visible.
      className="relative grid overflow-hidden"
      style={
        rowHeight !== null
          ? {
              gridTemplateRows: rowHeight === 0 ? '0fr' : '1fr',
              transition: `grid-template-rows ${COLLAPSE_DURATION_MS}ms ${EASING}`,
            }
          : { gridTemplateRows: '1fr' }
      }
    >
      <div className="relative overflow-hidden min-h-0 min-w-0 rounded-xl border border-border-subtle hover:border-border transition-colors">
        {/*
          Swipe reveals — only one mounted at a time (sign of translateX
          is source of truth). Both are absolute inset-0 so they paint
          behind the sliding card and become visible only where the card
          has slid away. Right-swipe reveal omitted in the studied section
          (no onMarkWrittenSwipe means there's nothing to reveal).
        */}
        {translateX < 0 && (
          <div className="absolute inset-0 bg-status-error flex items-center justify-end pr-5 pointer-events-none">
            <span className="text-white font-medium text-sm">{t('writeList.swipeDeleteLabel')}</span>
          </div>
        )}
        {translateX > 0 && onMarkWrittenSwipe && (
          <div className="absolute inset-0 bg-widget-write-bg flex items-center justify-start pl-5 pointer-events-none">
            <span className="text-widget-write-text font-medium text-sm">{t('writeList.swipeWrittenLabel')}</span>
          </div>
        )}

        {/*
          Sliding card — carries the resting bg + hover bg so the reveals
          underneath are occluded by the card surface and only become visible
          where the card has moved away. Opacity fades only on commit (hides
          the moment the card crosses the edge); no fade during interactive
          drag (would mask the cancel affordance) or snap-back.
        */}
        <div
          {...handlers}
          style={{
            transform: `translateX(${translateX}px)`,
            opacity: isAnimating ? 0 : 1,
            transition: isAnimating
              ? `transform ${SLIDE_DURATION_MS}ms ${EASING}, opacity ${FADE_DURATION_MS}ms ${EASING}`
              : translateX === 0
              ? `transform ${CANCEL_DURATION_MS}ms ${EASING}`
              : 'none',
            userSelect: 'none',
            touchAction: 'pan-y',
          }}
          className={`flex items-stretch transition-colors ${
            isWritten
              ? 'bg-surface/60 hover:bg-surface'
              : 'bg-surface hover:bg-surface-elevated'
          }`}
        >
          {/* Hidden test seams — trigger swipe flows without simulating touch events. */}
          <button
            data-testid={`swipe-delete-${item.id}`}
            className="sr-only"
            onClick={e => { e.stopPropagation(); triggerDelete() }}
            tabIndex={-1}
            aria-hidden="true"
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — inert is valid HTML not yet in React types
            inert=""
          />
          {onMarkWrittenSwipe && (
            <button
              data-testid={`swipe-mark-written-${item.id}`}
              className="sr-only"
              onClick={e => { e.stopPropagation(); triggerMarkWritten() }}
              tabIndex={-1}
              aria-hidden="true"
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore — inert is valid HTML not yet in React types
              inert=""
            />
          )}

          {/*
            Row content priority (Concept A from the Study card redesign):
              1. FlashcardRow — native prompt / target answer pair.
              2. CorrectionInContext — strike-through treatment (pre-flashcard items).
              3. StrikeOriginal — bare wrong→right fallback.
            Sheet body always uses CorrectionInContext regardless.
          */}
          <button
            type="button"
            onClick={onOpen}
            data-write-item-id={item.id}
            data-testid={`write-row-${item.id}`}
            className="flex-1 min-w-0 text-left px-4 py-3 rounded-l-xl"
          >
            {item.flashcard_front && item.flashcard_back ? (
              <FlashcardRow
                flashcardFront={item.flashcard_front}
                flashcardBack={item.flashcard_back}
                muted={isWritten}
                testId={`flashcard-row-${item.id}`}
              />
            ) : item.segment_text !== null && item.start_char !== null && item.end_char !== null ? (
              <CorrectionInContext
                segmentText={item.segment_text}
                startChar={item.start_char}
                endChar={item.end_char}
                original={item.original}
                correction={item.correction}
                muted={isWritten}
                testId={`correction-in-context-${item.id}`}
              />
            ) : (
              <StrikeOriginal
                original={item.original}
                correction={item.correction}
                muted={isWritten}
              />
            )}
          </button>

          {onMarkWritten && (
            // Trailing fast-path action. Visually separated from the row body
            // by a faint left rule so touch users can see it's a distinct tap
            // target. On md+ a micro-label teaches the affordance without
            // adding mobile clutter. Icon and label flip based on studied state.
            <button
              type="button"
              onClick={onMarkWritten}
              aria-label={
                isWritten
                  ? t('writeList.unmarkRowAria', { original: item.original })
                  : t('writeList.markRowAria', { original: item.original })
              }
              data-testid={`row-mark-written-${item.id}`}
              className="
                self-stretch flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-1.5
                px-3 md:px-4 rounded-r-xl
                border-l border-border-subtle
                text-text-secondary hover:text-widget-write-text
                hover:bg-widget-write-bg/50 hover:border-widget-write-border/40
                transition-colors
              "
            >
              <Icon name={isWritten ? 'rotate-ccw' : 'check'} className="w-5 h-5" />
              <span className="text-[0.6rem] font-medium leading-none md:hidden">
                {isWritten ? t('writeList.unmarkDoneShort') : t('writeList.markDoneShort')}
              </span>
              <span className="hidden md:inline text-xs font-medium">
                {isWritten ? t('writeList.unmarkDoneShort') : t('writeList.markDoneShort')}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

interface ToastState {
  message: string
  onUndo?: () => void | Promise<void>
  key: number
}

interface Props {
  items: PracticeItem[]
  /** Called once an item is *fully* gone (after the undo window expires). */
  onDeleted?: (ids: string[]) => void
  /** Called when the user taps "Practise this phrase" in WriteSheet. */
  onPractise?: (item: PracticeItem) => void
}

function compareNewestFirst(a: PracticeItem, b: PracticeItem): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function EmptyWrite() {
  const { t, targetLanguage } = useTranslation()
  const example = EMPTY_STATE_EXAMPLE[targetLanguage]
  return (
    <div className="py-6 space-y-5 max-w-prose">
      {/* Faded example row — same visual grammar as the real rows so the
          empty state teaches by showing, not just telling. The example
          itself is in the user's target language (see EMPTY_STATE_EXAMPLE
          above) — a Spanish example would teach nothing to an English
          learner and vice versa. */}
      <div
        className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5 opacity-70"
        aria-hidden="true"
      >
        <StrikeOriginal original={example.original} correction={example.correction} />
        <p className="text-sm italic text-text-tertiary leading-relaxed mt-1.5">
          {t('writeList.emptyWriteCaption')}
        </p>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">
        {/* Points at `/` (the Practise picker) — first-time users on this
            surface have nothing in /review to "open" either, so sending
            them to the inbox would just stage a second empty state. The
            Practise home is the methodology's entry point: pick a mode,
            have a conversation, save a correction from the transcript,
            and it lands back here. CTA copy mirrors the destination's
            verb ("Practise…") so the link doesn't promise a list to
            browse. */}
        <Link href="/" className="text-accent-primary font-medium hover:underline">
          {t('writeList.emptyWriteCta')}
        </Link>
      </p>
    </div>
  )
}

export function WriteList({ items, onDeleted, onPractise }: Props) {
  const { t } = useTranslation()
  const [allItems, setAllItems] = useState<PracticeItem[]>(items)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync items prop into local state. Local state lets us optimistically flip
  // written_down or hide deleted rows without round-tripping through the parent.
  useEffect(() => {
    setAllItems(items)
  }, [items])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const activeItems = useMemo(
    () => allItems.filter(i => !i.written_down),
    [allItems]
  )
  const studiedItems = useMemo(
    () => allItems.filter(i => i.written_down),
    [allItems]
  )

  // Sheet navigation is scoped to the section the open item is in —
  // active items navigate within the active queue; studied items navigate
  // within the studied section. Crossing sections on prev/next would be
  // confusing since the two groups have different visual weight.
  const openItem = openId !== null ? allItems.find(i => i.id === openId) ?? null : null
  const navItems = (openItem?.written_down ?? false) ? studiedItems : activeItems
  const openIndex = openId !== null ? navItems.findIndex(i => i.id === openId) : -1
  const hasPrev = openIndex > 0
  const hasNext = openIndex >= 0 && openIndex < navItems.length - 1

  function showToast(message: string, onUndo?: () => void | Promise<void>) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)
  }

  async function patchWritten(id: string, written: boolean): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: written }),
    })
    return res.ok
  }

  /**
   * For sheet-driven actions we want Gmail's "archive-and-next" behavior:
   * after the user marks the open item, the sheet doesn't slam shut — it
   * replaces its body with the next item in the same section. If they're
   * already at the last item, the sheet closes naturally.
   *
   * `navItems` MUST be captured BEFORE the optimistic state mutation,
   * because the post-mutation list will have already moved `item` and the
   * "next" computation would then point at the wrong row.
   */
  function nextOpenIdAfter(itemId: string): string | null {
    if (openId === null) return null
    const idx = navItems.findIndex(i => i.id === itemId)
    if (idx < 0 || idx + 1 >= navItems.length) return null
    return navItems[idx + 1].id
  }

  /**
   * Mark-written / move-back is intentionally silent on success — the item
   * moves sections and (for sheet-driven calls) the sheet auto-advances to
   * the next item. Only error paths surface a toast.
   */
  async function handleToggleWritten(item: PracticeItem): Promise<boolean> {
    const previous = item.written_down
    const next = !previous
    const wasOpen = openId === item.id
    const advanceToId = nextOpenIdAfter(item.id)

    setAllItems(prev =>
      prev.map(i => (i.id === item.id ? { ...i, written_down: next } : i))
    )
    setOpenId(wasOpen ? advanceToId : null)

    const ok = await patchWritten(item.id, next)
    if (!ok) {
      setAllItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, written_down: previous } : i))
      )
      showToast(t('writeList.markWrittenError'))
      return false
    }

    return true
  }

  /**
   * Optimistic delete with an undo window:
   *   1. hide the row immediately + show toast with Undo
   *   2. only fire DELETE after UNDO_TIMEOUT_MS if not cancelled
   *   3. if Undo is clicked, restore the row in place; no network call ever happens
   *   4. if DELETE fails, restore the row + show an error toast
   *
   * Returning quickly (vs. awaiting the network) keeps the sheet's busy state
   * snappy; the parent's `onDeleted` is only called once the row is truly gone.
   */
  async function handleDelete(item: PracticeItem): Promise<boolean> {
    const snapshot = item
    const wasOpen = openId === item.id
    const advanceToId = nextOpenIdAfter(item.id)

    setAllItems(prev => prev.filter(i => i.id !== item.id))
    setOpenId(wasOpen ? advanceToId : null)

    let cancelled = false
    let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

    function restoreRow() {
      setAllItems(prev =>
        prev.find(i => i.id === snapshot.id)
          ? prev
          : [...prev, snapshot].sort(compareNewestFirst)
      )
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      key: Date.now(),
      message: t('writeList.movedToTrash'),
      onUndo: () => {
        cancelled = true
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer)
        restoreRow()
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
      },
    })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

    pendingDeleteTimer = setTimeout(async () => {
      if (cancelled) return
      const res = await fetch(`/api/practice-items/${snapshot.id}`, { method: 'DELETE' })
      if (!res.ok) {
        restoreRow()
        showToast(t('writeList.deleteError'))
        return
      }
      onDeleted?.([snapshot.id])
    }, UNDO_TIMEOUT_MS)

    return true
  }

  /**
   * Swipe-left delete. Returns a long-lived Promise so the row can
   * animate in place and roll back on Undo or failure (same contract as
   * SessionList.deleteSession). Unlike handleDelete (sheet-driven, which
   * immediately filters allItems), this path lets the row's own animation
   * complete before React unmounts it.
   */
  function handleDeleteSwipe(item: PracticeItem): Promise<boolean> {
    // Close the sheet if this item is currently open in it.
    if (openId === item.id) setOpenId(null)

    return new Promise<boolean>((resolve) => {
      let cancelled = false
      let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      setToast({
        key: Date.now(),
        message: t('writeList.movedToTrash'),
        onUndo: () => {
          cancelled = true
          if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer)
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          setToast(null)
          resolve(false)
        },
      })
      toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

      pendingDeleteTimer = setTimeout(async () => {
        if (cancelled) return
        const res = await fetch(`/api/practice-items/${item.id}`, { method: 'DELETE' })
        if (!res.ok) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          setToast({ key: Date.now(), message: t('writeList.deleteError') })
          toastTimerRef.current = setTimeout(() => setToast(null), 3000)
          resolve(false)
          return
        }
        onDeleted?.([item.id])
        resolve(true)
      }, UNDO_TIMEOUT_MS)
    })
  }

  /**
   * Swipe-right mark-written. Same long-lived Promise contract as
   * handleDeleteSwipe. The row animates out; allItems is only updated
   * (written_down=true) after the undo window expires without interruption.
   * On Undo or PATCH failure, the Promise resolves false and the row
   * restores itself.
   *
   * Swipe-right is more accident-prone than a deliberate Done tap, so we
   * surface an undo toast — unlike the tap path (handleToggleWritten), which
   * is intentionally silent.
   */
  function handleMarkWrittenSwipe(item: PracticeItem): Promise<boolean> {
    if (openId === item.id) setOpenId(null)

    return new Promise<boolean>((resolve) => {
      let cancelled = false
      let pendingTimer: ReturnType<typeof setTimeout> | null = null

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      setToast({
        key: Date.now(),
        message: t('writeList.swipeMarkedWritten'),
        onUndo: () => {
          cancelled = true
          if (pendingTimer) clearTimeout(pendingTimer)
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          setToast(null)
          resolve(false)
        },
      })
      toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

      pendingTimer = setTimeout(async () => {
        if (cancelled) return
        const ok = await patchWritten(item.id, true)
        if (!ok) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          setToast({ key: Date.now(), message: t('writeList.markWrittenError') })
          toastTimerRef.current = setTimeout(() => setToast(null), 3000)
          resolve(false)
          return
        }
        // Update allItems so the item moves to the studied section. The row
        // is already at height 0 (animated out), so React unmounting it is
        // invisible.
        setAllItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, written_down: true } : i)
        )
        resolve(true)
      }, UNDO_TIMEOUT_MS)
    })
  }

  return (
    <div className="space-y-5">
      {/*
        Active queue — no top header so the list begins at the same vertical
        position as /review's inbox (chrome cohesion across pillars).
      */}
      {activeItems.length === 0 && allItems.length > 0 ? (
        <div className="py-6 space-y-3 max-w-prose">
          <p className="text-text-secondary text-sm leading-relaxed">
            {t('writeList.allStudiedHeading')}
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            <Link href="/" className="text-accent-primary font-medium hover:underline">
              {t('writeList.allStudiedCta')}
            </Link>
          </p>
        </div>
      ) : activeItems.length === 0 ? (
        <EmptyWrite />
      ) : (
        <>
          {/*
            Swipe hint — above the active list on first visit. One-shot:
            auto-dismisses after 6s or on "Got it" tap. WriteSwipeHint
            gates its own visibility via localStorage.
          */}
          <WriteSwipeHint />
          <ul className="space-y-2">
            {activeItems.map(item => (
              <SwipeableWriteRow
                key={item.id}
                item={item}
                isWritten={false}
                onOpen={() => setOpenId(item.id)}
                onMarkWritten={() => handleToggleWritten(item)}
                onMarkWrittenSwipe={handleMarkWrittenSwipe}
                onDeleteSwipe={handleDeleteSwipe}
              />
            ))}
          </ul>
        </>
      )}

      {/*
        Studied section — rendered below the active queue when any items
        are studied. A minimal divider labels the section without adding
        a separate navigation layer.
      */}
      {studiedItems.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 pt-1" data-testid="studied-divider">
            <h2 className="text-xs font-medium text-text-tertiary tracking-wide">
              {t('writeList.archiveHeading')}
            </h2>
            <span className="text-xs text-text-tertiary tabular-nums" aria-label={`${studiedItems.length} items`}>
              · {studiedItems.length}
            </span>
          </div>
          <ul className="space-y-2 -mt-3" aria-label={t('writeList.archiveHeading')}>
            {studiedItems.map(item => (
              <SwipeableWriteRow
                key={item.id}
                item={item}
                isWritten={true}
                onOpen={() => setOpenId(item.id)}
                onMarkWritten={() => handleToggleWritten(item)}
                onDeleteSwipe={handleDeleteSwipe}
              />
            ))}
          </ul>
        </>
      )}

      <WriteSheet
        item={openItem}
        hasPrev={hasPrev}
        hasNext={hasNext}
        isWritten={openItem?.written_down ?? false}
        onClose={() => setOpenId(null)}
        onPrev={() => {
          if (hasPrev) setOpenId(navItems[openIndex - 1].id)
        }}
        onNext={() => {
          if (hasNext) setOpenId(navItems[openIndex + 1].id)
        }}
        onToggleWritten={handleToggleWritten}
        onDelete={handleDelete}
        onPractise={onPractise}
      />

      {toast && (
        <Toast
          toastKey={toast.key}
          message={toast.message}
          action={toast.onUndo ? { label: t('writeList.undo'), onClick: toast.onUndo } : undefined}
        />
      )}
    </div>
  )
}
