# OPUS Support + PWA Web Share Target — Design Spec

**Date:** 2026-03-16
**Status:** Approved

---

## What This Is

Two related additions that let the user share WhatsApp voice notes (`.opus` files) directly to the Conversation Coach app from Android's native share sheet.

1. **OPUS file support** — add `.opus` to the accepted formats list so WhatsApp audio files pass client-side validation and upload correctly.
2. **PWA Web Share Target** — make the app installable on Android so it appears in the share sheet, receives the audio file directly, and auto-triggers the upload flow.

---

## Part 1: OPUS File Support

### Changes to `DropZone.tsx`

| What | Current | Updated |
|---|---|---|
| `ACCEPTED_TYPES` | `['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']` | Add `'audio/ogg'` — this is what Android Chrome reports for `.opus` files. `'audio/opus'` is not emitted by any mainstream browser and is not added. |
| `ACCEPTED_EXTENSIONS` | `['.mp3', '.m4a', '.wav']` | Add `'.opus'` |
| `<input accept>` | `".mp3,.m4a,.wav"` | Add `".opus"` |
| Hint text | `"MP3, M4A, WAV · up to 500 MB / 2 hours"` | `"MP3, M4A, WAV, OPUS · up to 500 MB / 2 hours"` |
| Error message | `"Unsupported format. Use MP3, M4A, or WAV."` | `"Unsupported format. Use MP3, M4A, WAV, or OPUS."` |

WhatsApp voice notes on Android export as `.opus` with MIME type `audio/ogg`. Both MIME types are included because browsers report this inconsistently.

AssemblyAI supports Opus natively — no server-side changes required.

---

## Part 2: PWA Web Share Target

### Manifest (`public/manifest.json`)

```json
{
  "name": "Conversation Coach",
  "short_name": "Coach",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#0f0f0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [{ "name": "audio", "accept": ["audio/*"] }]
    }
  }
}
```

Linked from `app/layout.tsx` via the Next.js `metadata` export (consistent with the existing pattern in this file):
```ts
export const metadata: Metadata = {
  // ...existing fields...
  manifest: '/manifest.json',
  themeColor: '#0f0f0f',
}
```

Two PNG icons are required for the PWA to be installable: `public/icon-192.png` and `public/icon-512.png`. For correct rendering in the Android share sheet and on the home screen (adaptive icons), at least one icon should include `"purpose": "maskable"` in the manifest. The placeholder icons use `"purpose": "any"` — the user should supply a properly padded maskable variant before production use.

### Service Worker (`public/sw.js`)

Handles the share target POST and stores the file for the app to pick up.

**`fetch` event — intercepts POST to `/share-target`:**
1. Parse the multipart form data to extract the `audio` file
2. Open IndexedDB (`conversation-coach-db`, store: `pending-share`)
3. `await` the IndexedDB `put` transaction to commit (write the file under key `"file"`, overwriting any previous pending share) — the redirect must not be issued until the write is confirmed
4. Wrap the entire async sequence in `event.waitUntil()` so the SW does not terminate mid-write
5. Open/focus the app window at `/`
6. Return `Response.redirect('/', 303)` so the browser navigates to the home screen

**`install` event:** `self.skipWaiting()` — activates immediately.

**`activate` event:** `self.clients.claim()` — takes control of all open pages immediately.

Registered in `app/layout.tsx` via a small `<script>` tag (inline script, not via Next.js metadata API — SW registration is runtime behaviour, not a document head concern):
```html
<script dangerouslySetInnerHTML={{ __html: `
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
` }} />
```

The default registration scope is `/`, which covers all routes. This is correct and intentional.

### Client-Side Share Pickup (`app/page.tsx`)

A second `useEffect` (separate from the existing sessions-fetch effect) runs on mount:

1. Open IndexedDB (`conversation-coach-db`, store: `pending-share`)
2. Get the value at key `"file"`
3. If a file is found:
   - Delete the entry from IndexedDB (consume it)
   - Call `handleFile(file)` directly — same code path as a manual drop/select; this sets `uploading: true` and navigates to the status page. The session title will be derived from `file.name` via the existing fallback inside `handleFile` (no separate title state update needed)
4. If no file is found: no-op

**Effect ordering note:** Both `useEffect` calls (sessions fetch and share pickup) run on the same mount cycle. If a share file is found, `handleFile` will navigate away before the sessions list loads — this is acceptable since the user is not going to the home screen to browse past sessions, they arrived via a share intent.

**`getAudioDuration` note:** The existing `getAudioDuration` helper resolves `0` on `onerror`. Some browsers (notably Safari on desktop) cannot decode Opus in an `<audio>` element, so `duration_seconds` may be `0` for `.opus` files in those environments. This is an existing limitation: `0` is already a valid value accepted by the upload-complete route, and the processing pipeline handles it gracefully. Android Chrome decodes Opus correctly, so the primary use case is unaffected.

This makes the share-to-app experience seamless: the user taps share in WhatsApp, selects the app, and lands on the processing status page within seconds.

### IndexedDB Schema

| Database | `conversation-coach-db` |
|---|---|
| Version | `1` |
| Object store | `pending-share` |
| Key path | (out-of-line, explicit key) |
| Usage | Single entry under key `"file"` — consumed on read |

---

## Installation Flow (Android)

For the share target to appear in the Android share sheet, the app must be installed as a PWA:

1. Open the app in Chrome on Android
2. Tap the browser menu → "Add to Home screen"
3. The app icon appears on the home screen and in the app drawer
4. From now on, sharing an audio file from WhatsApp will list "Conversation Coach" in the share sheet

---

## Out of Scope

- iOS share sheet support (iOS does not support Web Share Target for files)
- Offline support beyond the share target interception
- Push notifications or background sync
- Generating PWA icons (placeholder icons provided; user supplies final artwork)

---

## Files Changed / Created

| File | Action |
|---|---|
| `components/DropZone.tsx` | Edit — add OPUS to accepted types, extensions, input accept, hint text, error message |
| `public/manifest.json` | Create |
| `public/sw.js` | Create |
| `public/icon-192.png` | Create (placeholder) |
| `public/icon-512.png` | Create (placeholder) |
| `app/layout.tsx` | Edit — add `manifest` and `themeColor` to the `metadata` export; add SW registration `<script>` |
| `app/page.tsx` | Edit — add IndexedDB check on mount |
| `app/share-target/route.ts` | Create — handles the POST fallback when the service worker is not yet installed (first share before SW activates). Simply redirects to `/`. The SW intercepts this route on all subsequent shares. |
