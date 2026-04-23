// components/UploadIllustration.tsx
//
// The animated illustration for the first onboarding step: a tiny mock of the
// Coach app's home screen that plays the upload-action choreography in 4
// seconds — Upload-audio button sits idle → finger press-and-hold → file
// picker rises from below → soft pulse on a recommended audio file. Then it
// settles into the rest state (sheet up, file row highlighted) so it teaches
// the destination, not the loop.
//
// Reuses the oa-* keyframes from app/globals.css (shared with the WhatsApp
// share illustration), giving the two tutorial steps a consistent motion
// vocabulary: press → sheet rise → pulse on the target. The phone-frame
// dimensions match step 2 so the wizard doesn't shift between screens.

interface Props {
  /** Label inside the mocked Upload-audio pill button. */
  uploadLabel: string
  /** Header for the file-picker sheet (e.g. "Audio files"). */
  pickerTitle: string
  /** App name shown in the phone-frame header (e.g. "Coach"). */
  appLabel: string
}

export function UploadIllustration({ uploadLabel, pickerTitle, appLabel }: Props) {
  return (
    <div
      className="relative w-[264px] h-[184px] rounded-2xl bg-bg border border-border overflow-hidden shadow-sm select-none"
      aria-hidden="true"
    >
      <PhoneHeader appLabel={appLabel} />
      <AppHomeBody uploadLabel={uploadLabel} />
      {/* Dim layer rises with the sheet — sits above the home screen, below the sheet. */}
      <span className="oa-backdrop absolute inset-0 bg-black pointer-events-none" />
      <FilePickerSheet pickerTitle={pickerTitle} />
    </div>
  )
}

// ─── Subcomponents (private to this file; not worth exporting) ──────────────

function PhoneHeader({ appLabel }: { appLabel: string }) {
  // App-style bar: a tiny CC tile (the Coach app icon, visually rhyming with
  // the Coach tile inside step 2's share sheet) plus the app name. No back
  // chevron because we're on the app's home screen, not a sub-page — that's
  // the deliberate contrast with step 2's chat header.
  return (
    <div className="flex items-center gap-2 h-8 px-3 bg-surface border-b border-border-subtle">
      <div className="w-5 h-5 rounded bg-accent-primary flex items-center justify-center shrink-0">
        <span className="text-white text-[8px] font-bold leading-none">CC</span>
      </div>
      <span className="text-[11px] font-semibold text-text-primary leading-none">{appLabel}</span>
    </div>
  )
}

function AppHomeBody({ uploadLabel }: { uploadLabel: string }) {
  return (
    <div className="relative h-[calc(100%-2rem)] flex justify-center pt-2">
      {/* The pill is wrapped so the touch indicator can be absolutely positioned
          relative to the button's centre, not the whole body. The button's
          rendered height (≈36px from py-3 + text-[11px]) is sized to fully
          contain the 32px touch dot with ~2px margin, so the press visibly
          lands inside the target rather than spilling above and below it. */}
      <div className="relative">
        <div className="inline-flex items-center gap-1.5 bg-accent-primary text-white rounded-full py-3 px-4 shadow-sm">
          <PlusIcon />
          <span className="text-[11px] font-semibold leading-none">{uploadLabel}</span>
        </div>
        {/* Press-and-hold finger pad. transform-origin is the element's own
            centre; the keyframes carry the centring translate alongside the
            scale so the dot stays anchored on the button's middle. */}
        <span
          className="oa-touch absolute top-1/2 left-1/2 w-8 h-8 rounded-full bg-accent-primary pointer-events-none"
        />
      </div>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 1 L5 9 M1 5 L9 5" />
    </svg>
  )
}

function FilePickerSheet({ pickerTitle }: { pickerTitle: string }) {
  // Three rows so the sheet feels like a real file picker (one is sparse, four
  // crowds the small frame). Mixed extensions implicitly demonstrate the
  // supported formats — that's the work the old static format-chip row did,
  // moved into context so it's the user's "you can pick any of these" moment.
  // Highlighted row sits second so the eye lands on it without being told.
  const files: Array<{ name: string; duration: string; highlighted?: boolean }> = [
    { name: 'Voice Memo 1.m4a', duration: '1:23' },
    { name: 'Voice Memo 2.mp3', duration: '0:42', highlighted: true },
    { name: 'Voice Memo 3.wav', duration: '2:17' },
  ]

  return (
    <div className="oa-sheet absolute inset-x-0 bottom-0 bg-surface border-t border-border rounded-t-xl shadow-lg pb-2">
      <div className="flex justify-center pt-1.5 pb-1">
        <span className="block w-7 h-1 rounded-full bg-border" />
      </div>
      <div className="text-[9.5px] text-text-tertiary text-center font-medium px-3 pb-1.5 border-b border-border-subtle">
        {pickerTitle}
      </div>
      <div className="px-2 pt-1 space-y-0.5">
        {files.map(file => (
          <div
            key={file.name}
            className={`relative flex items-center gap-2 px-2 py-1 rounded-md ${
              file.highlighted ? 'bg-accent-chip' : ''
            }`}
          >
            <AudioIcon highlighted={file.highlighted} />
            <span
              className={`text-[10px] truncate leading-tight ${
                file.highlighted
                  ? 'text-on-accent-chip font-semibold'
                  : 'text-text-primary font-medium'
              }`}
            >
              {file.name}
            </span>
            <span
              className={`ml-auto text-[9px] tabular-nums shrink-0 leading-tight ${
                file.highlighted ? 'text-on-accent-chip' : 'text-text-tertiary'
              }`}
            >
              {file.duration}
            </span>
            {/* The pulse ring lives inside the highlighted row so its scale
                emanates from the row's centre — same animation primitive the
                share illustration uses on the Coach tile. */}
            {file.highlighted && (
              <span className="oa-pulse absolute -inset-px rounded-md border-2 border-accent-primary pointer-events-none" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AudioIcon({ highlighted }: { highlighted?: boolean }) {
  // A bare mini-waveform — same visual language as the voice-note bubble in
  // step 2's WhatsApp mock. The unhighlighted rows fade it slightly so the
  // selected row's bars stand out without being a different colour.
  const bars = [3, 6, 4, 8, 5, 7, 4]
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      className={`text-accent-primary shrink-0 ${highlighted ? 'opacity-100' : 'opacity-60'}`}
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 2}
          y={(10 - h) / 2}
          width="1.2"
          height={h}
          rx="0.6"
          fill="currentColor"
        />
      ))}
    </svg>
  )
}
