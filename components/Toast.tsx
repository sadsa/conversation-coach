// components/Toast.tsx
//
// Floating status pill anchored to the bottom of the viewport. Used by
// SessionList (delete error) and WriteList (delete + undo). Positions
// itself above the mobile bottom-nav by reading `--toast-bottom` from
// `globals.css`, so a single change to that variable nudges every toast in
// the app — don't hard-code `bottom-20` or similar.
//
// `toastKey` is forwarded to `key` so changing the key re-mounts the element
// and replays the entrance animation when consecutive toasts share a parent.

interface Action {
  label: string
  onClick: () => void
}

interface ToastProps {
  message: React.ReactNode
  /** Optional trailing action (e.g. Undo). */
  action?: Action
  /** Pass a stable per-toast key so consecutive toasts replay the entrance animation. */
  toastKey?: string | number
}

export function Toast({ message, action, toastKey }: ToastProps) {
  return (
    <div
      key={toastKey}
      role="alert"
      className="
        fixed bottom-[var(--toast-bottom)] left-1/2 -translate-x-1/2 z-50
        flex items-center gap-3 px-4 py-2.5
        bg-surface-elevated border border-border rounded-xl
        text-sm text-text-primary shadow-lg
        animate-toast-in
      "
    >
      <span>{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-accent-primary font-medium hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
