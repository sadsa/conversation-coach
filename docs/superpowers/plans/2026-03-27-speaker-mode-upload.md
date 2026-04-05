# Speaker Mode Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on speaker identification screen with an explicit recording-type choice (Solo / Conversation + speaker count) made before upload begins, eliminating false positives caused by AssemblyAI's hardcoded `speakers_expected: 2` bias.

**Architecture:** A pending-file card replaces the drop zone after file selection (any source), letting the user set mode before upload starts. The chosen `speakersExpected` value flows through `upload-complete` → `createJob` → AssemblyAI. No DB schema changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, AssemblyAI SDK.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/assemblyai.ts` | Accept optional `speakersExpected` param in `createJob` |
| Modify | `app/api/sessions/[id]/upload-complete/route.ts` | Read and forward `speakers_expected` from request body |
| Create | `components/PendingUploadCard.tsx` | Violet pending-file card UI |
| Modify | `app/page.tsx` | Pending-file state, localStorage persistence, card rendering |
| Modify | `__tests__/lib/assemblyai.test.ts` | No change needed (createJob untested at unit level) |
| Modify | `__tests__/api/upload-pipeline.test.ts` | Update createJob call assertions |
| Create | `__tests__/components/PendingUploadCard.test.tsx` | Component behaviour tests |
| Modify | `__tests__/components/HomePage.share.test.tsx` | Share target now shows card, not immediate upload |

---

## Task 1: Extend `createJob` to accept `speakersExpected`

**Files:**
- Modify: `lib/assemblyai.ts`
- Modify: `__tests__/api/upload-pipeline.test.ts` (assertion update)

- [ ] **Step 1: Update `createJob` signature and body**

In `lib/assemblyai.ts`, change the `createJob` function:

```typescript
export async function createJob(audioUrl: string, speakersExpected = 2): Promise<string> {
  const client = getClient()
  const bypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const bypassParam = bypassToken ? `?x-vercel-protection-bypass=${bypassToken}` : ''
  const webhookUrl = `${getWebhookBaseUrl()}/api/webhooks/assemblyai${bypassParam}`
  const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET!
  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    webhook_url: webhookUrl,
    webhook_auth_header_name: WEBHOOK_AUTH_HEADER_NAME,
    webhook_auth_header_value: webhookSecret,
    speech_models: ['universal-3-pro', 'universal-2'],
    speaker_labels: true,
    speakers_expected: speakersExpected,
    language_code: 'es',
  })
  return transcript.id
}
```

- [ ] **Step 2: Update upload-pipeline test assertion**

In `__tests__/api/upload-pipeline.test.ts`, the test at line 47 asserts `createJob` is called with just the URL. Update it to expect the default `speakers_expected` of `2`:

```typescript
expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio.mp3', 2)
```

Also update the retry test at line 202 the same way:

```typescript
expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio.mp3', 2)
```

- [ ] **Step 3: Run the affected tests**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/assemblyai.ts __tests__/api/upload-pipeline.test.ts
git commit -m "feat: add speakersExpected param to createJob, default 2"
```

---

## Task 2: Update `upload-complete` route to forward `speakers_expected`

**Files:**
- Modify: `app/api/sessions/[id]/upload-complete/route.ts`
- Modify: `__tests__/api/upload-pipeline.test.ts`

- [ ] **Step 1: Write a failing test for `speakers_expected` forwarding**

Add a new test inside the `describe('POST /api/sessions/:id/upload-complete', ...)` block in `__tests__/api/upload-pipeline.test.ts`:

```typescript
it('passes speakers_expected to createJob when provided', async () => {
  vi.mocked(createServerClient).mockReturnValue(
    makeMockDb({ audio_r2_key: 'audio/uuid.mp3' }) as unknown as ReturnType<typeof createServerClient>
  )

  const { POST } = await import('@/app/api/sessions/[id]/upload-complete/route')
  const req = new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ duration_seconds: 120, speakers_expected: 3 }),
    headers: { 'content-type': 'application/json' },
  })
  const res = await POST(req, { params: { id: 'session-1' } })
  expect(res.status).toBe(200)
  expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio/uuid.mp3', 3)
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts
```

Expected: new test FAILS — `createJob` called with 2 args but second arg is `2`, not `3`.

- [ ] **Step 3: Update the route to read and forward `speakers_expected`**

Replace the body parsing and `createJob` call in `app/api/sessions/[id]/upload-complete/route.ts`:

```typescript
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { duration_seconds, speakers_expected } = await req.json() as {
    duration_seconds?: number
    speakers_expected?: number
  }
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .single()

  if (!session?.audio_r2_key) {
    return NextResponse.json({ error: 'No audio key found' }, { status: 400 })
  }

  const audioUrl = publicUrl(session.audio_r2_key)

  let jobId: string
  try {
    jobId = await createJob(audioUrl, speakers_expected ?? 2)
  } catch (err) {
    log.error('AssemblyAI job creation failed', { sessionId: params.id, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', params.id)
    return NextResponse.json({ error: 'AssemblyAI job creation failed' }, { status: 500 })
  }

  log.info('AssemblyAI job created', { sessionId: params.id, jobId })

  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: jobId,
    ...(duration_seconds != null ? { duration_seconds } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/[id]/upload-complete/route.ts __tests__/api/upload-pipeline.test.ts
git commit -m "feat: forward speakers_expected from upload-complete to AssemblyAI"
```

---

## Task 3: Create `PendingUploadCard` component

**Files:**
- Create: `components/PendingUploadCard.tsx`
- Create: `__tests__/components/PendingUploadCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/PendingUploadCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PendingUploadCard } from '@/components/PendingUploadCard'

function makeFile(name: string, size: number): File {
  return new File(['x'.repeat(size)], name, { type: 'audio/ogg' })
}

const baseProps = {
  file: makeFile('PTT-20260327.opus', 1200000),
  speakerMode: 'solo' as const,
  speakersExpected: 2,
  onModeChange: vi.fn(),
  onSpeakersChange: vi.fn(),
  onConfirm: vi.fn(),
  onDismiss: vi.fn(),
}

describe('PendingUploadCard', () => {
  it('displays the file name', () => {
    render(<PendingUploadCard {...baseProps} />)
    expect(screen.getByText('PTT-20260327.opus')).toBeInTheDocument()
  })

  it('displays file size in MB', () => {
    render(<PendingUploadCard {...baseProps} />)
    expect(screen.getByText(/1\.1 MB/i)).toBeInTheDocument()
  })

  it('calls onModeChange when Conversation is clicked', () => {
    const onModeChange = vi.fn()
    render(<PendingUploadCard {...baseProps} onModeChange={onModeChange} />)
    fireEvent.click(screen.getByText('Conversation'))
    expect(onModeChange).toHaveBeenCalledWith('conversation')
  })

  it('calls onModeChange when Solo is clicked', () => {
    const onModeChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onModeChange={onModeChange} />)
    fireEvent.click(screen.getByText('Solo'))
    expect(onModeChange).toHaveBeenCalledWith('solo')
  })

  it('hides speaker count pills when Solo is selected', () => {
    render(<PendingUploadCard {...baseProps} speakerMode="solo" />)
    expect(screen.queryByText('Speakers:')).toBeNull()
  })

  it('shows speaker count pills when Conversation is selected', () => {
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" />)
    expect(screen.getByText('Speakers:')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5+')).toBeInTheDocument()
  })

  it('calls onSpeakersChange with 5 when 5+ is clicked', () => {
    const onSpeakersChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onSpeakersChange={onSpeakersChange} />)
    fireEvent.click(screen.getByText('5+'))
    expect(onSpeakersChange).toHaveBeenCalledWith(5)
  })

  it('calls onSpeakersChange with the correct number when a pill is clicked', () => {
    const onSpeakersChange = vi.fn()
    render(<PendingUploadCard {...baseProps} speakerMode="conversation" onSpeakersChange={onSpeakersChange} />)
    fireEvent.click(screen.getByText('3'))
    expect(onSpeakersChange).toHaveBeenCalledWith(3)
  })

  it('calls onDismiss when Dismiss is clicked', () => {
    const onDismiss = vi.fn()
    render(<PendingUploadCard {...baseProps} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onConfirm when Upload is clicked', () => {
    const onConfirm = vi.fn()
    render(<PendingUploadCard {...baseProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText(/Upload/))
    expect(onConfirm).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm test -- __tests__/components/PendingUploadCard.test.tsx
```

Expected: FAIL — `PendingUploadCard` not found.

- [ ] **Step 3: Create the component**

Create `components/PendingUploadCard.tsx`:

```typescript
'use client'

export type SpeakerMode = 'solo' | 'conversation'

interface Props {
  file: File
  speakerMode: SpeakerMode
  speakersExpected: number
  onModeChange: (mode: SpeakerMode) => void
  onSpeakersChange: (count: number) => void
  onConfirm: () => void
  onDismiss: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SPEAKER_COUNTS = [
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
]

export function PendingUploadCard({
  file,
  speakerMode,
  speakersExpected,
  onModeChange,
  onSpeakersChange,
  onConfirm,
  onDismiss,
}: Props) {
  return (
    <div className="border border-[#4c1d95] rounded-xl bg-[#1e1b4b] p-4 space-y-4">
      {/* File info */}
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 flex-shrink-0" aria-hidden="true">📎</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">{file.name}</p>
          <p className="text-xs text-violet-300 mt-0.5">{formatBytes(file.size)}</p>
        </div>
      </div>

      {/* Recording type toggle */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Recording type:</p>
        <div className="inline-flex rounded-lg overflow-hidden border border-[#4c1d95]">
          <button
            type="button"
            onClick={() => onModeChange('solo')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              speakerMode === 'solo'
                ? 'bg-violet-600 text-white'
                : 'bg-transparent text-violet-300 hover:text-white'
            }`}
          >
            Solo
          </button>
          <button
            type="button"
            onClick={() => onModeChange('conversation')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              speakerMode === 'conversation'
                ? 'bg-violet-600 text-white'
                : 'bg-transparent text-violet-300 hover:text-white'
            }`}
          >
            Conversation
          </button>
        </div>
      </div>

      {/* Speaker count (conversation only) */}
      {speakerMode === 'conversation' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">Speakers:</span>
          <div className="flex gap-1.5">
            {SPEAKER_COUNTS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSpeakersChange(value)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                  speakersExpected === value
                    ? 'bg-violet-600 text-white'
                    : 'bg-transparent border border-[#4c1d95] text-violet-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:text-gray-200 transition-colors"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
        >
          Upload →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PendingUploadCard.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/PendingUploadCard.tsx __tests__/components/PendingUploadCard.test.tsx
git commit -m "feat: add PendingUploadCard component with solo/conversation mode toggle"
```

---

## Task 4: Wire pending-file state into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`
- Modify: `__tests__/components/HomePage.share.test.tsx`

- [ ] **Step 1: Update the share-target test to match new behaviour**

The share target no longer immediately uploads — it shows the pending card instead. Update `__tests__/components/HomePage.share.test.tsx`:

Replace the existing `'calls handleFile with the stored file on mount if a share is pending'` test with:

```typescript
it('shows the pending upload card when a share is pending', async () => {
  const sharedFile = new File(['audio'], 'PTT-20260327.opus', { type: 'audio/ogg' })
  setupIDB(sharedFile)

  const { default: HomePage } = await import('@/app/page')
  const { getByText } = render(<HomePage />)

  await waitFor(() => {
    expect(getByText('PTT-20260327.opus')).toBeInTheDocument()
  }, { timeout: 2000 })
})
```

Keep the `'does nothing if no share is pending'` test unchanged — it still expects no card to appear.

- [ ] **Step 2: Run the updated share test to confirm it fails**

```bash
npm test -- __tests__/components/HomePage.share.test.tsx
```

Expected: FAIL — `PTT-20260327.opus` not found in DOM (upload still starts immediately).

- [ ] **Step 3: Rewrite `app/page.tsx`**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/DropZone'
import { PendingUploadCard, type SpeakerMode } from '@/components/PendingUploadCard'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem } from '@/lib/types'

const SPEAKER_MODE_KEY = 'speakerMode'

export default function HomePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('solo')
  const [speakersExpected, setSpeakersExpected] = useState(2)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(console.error)
  }, [])

  // Restore last-used speaker mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SPEAKER_MODE_KEY)
    if (saved === 'solo' || saved === 'conversation') setSpeakerMode(saved)
  }, [])

  function handleModeChange(mode: SpeakerMode) {
    setSpeakerMode(mode)
    localStorage.setItem(SPEAKER_MODE_KEY, mode)
    if (mode === 'solo') setSpeakersExpected(2)
  }

  const handleFile = useCallback((file: File) => {
    setPendingFile(file)
  }, [])

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    setPendingFile(null)
    const file = pendingFile
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    try {
      const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      setError('Upload failed — please try again')
      setUploading(false)
      return
    }

    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        duration_seconds,
        speakers_expected: speakerMode === 'solo' ? 1 : speakersExpected,
      }),
    })

    setUploading(false)
    router.push(`/sessions/${session_id}/status`)
  }, [pendingFile, speakerMode, speakersExpected, router])

  // Check for a file shared via the PWA share target
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) handleFile(file)
    })
  }, [handleFile])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Conversation Coach</h1>
        <p className="text-gray-400 text-sm">Upload a recorded Spanish conversation to get feedback on your speech.</p>
      </div>

      <div className="space-y-3">
        {pendingFile ? (
          <PendingUploadCard
            file={pendingFile}
            speakerMode={speakerMode}
            speakersExpected={speakersExpected}
            onModeChange={handleModeChange}
            onSpeakersChange={setSpeakersExpected}
            onConfirm={handleConfirmUpload}
            onDismiss={() => setPendingFile(null)}
          />
        ) : (
          <DropZone onFile={handleFile} />
        )}
        {uploading && <p className="text-sm text-violet-400">Uploading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
        <SessionList sessions={sessions} />
      </div>
    </div>
  )
}

function readPendingShare(): Promise<File | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('conversation-coach-db', 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore('pending-share')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('pending-share', 'readwrite')
      const store = tx.objectStore('pending-share')
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
      const getReq = store.get('file')
      getReq.onsuccess = () => {
        const file = (getReq as IDBRequest<File | undefined>).result ?? null
        if (file) store.delete('file')
        tx.oncomplete = () => resolve(file)
      }
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = () => resolve(0)
  })
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass. Pay attention to:
- `__tests__/components/HomePage.share.test.tsx` — pending card shows on share
- `__tests__/components/PendingUploadCard.test.tsx` — all component tests pass
- `__tests__/api/upload-pipeline.test.ts` — createJob called with correct speaker count
- All other existing tests unchanged

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx __tests__/components/HomePage.share.test.tsx
git commit -m "feat: stage files in pending card before upload, pass speaker mode to AssemblyAI"
```

---

## Self-Review

**Spec coverage:**
- ✅ File selection stages a pending card (Task 4)
- ✅ Solo/Conversation toggle, defaults to Solo (Task 3 + 4)
- ✅ Speaker count pills appear for Conversation, default 2, 5+ sends 5 (Task 3)
- ✅ Dismiss restores drop zone (Task 4 — `setPendingFile(null)`)
- ✅ PWA share target shows card instead of auto-uploading (Task 4)
- ✅ `localStorage` persists last-used mode (Task 4)
- ✅ `speakers_expected: 1` sent for Solo (Task 4 — `speakerMode === 'solo' ? 1 : speakersExpected`)
- ✅ `createJob` accepts `speakersExpected` param (Task 1)
- ✅ `upload-complete` route forwards `speakers_expected` (Task 2)
- ✅ Violet card style (`bg-[#1e1b4b]`, `border-[#4c1d95]`) (Task 3)
- ✅ Pills sized to content (`inline-flex` on toggle, fixed-width only on speaker count pills) (Task 3)

**Type consistency:** `SpeakerMode` defined and exported from `PendingUploadCard.tsx`, imported in `page.tsx`. All prop names match between definition and usage.

**Placeholder scan:** None found.
