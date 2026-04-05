# Logging Design

**Date:** 2026-03-22
**Status:** Approved

## Problem

The app has scattered `console.error` calls with no consistent structure, no session correlation, and several silent error swallows. When something breaks in production (Vercel), it is difficult to determine which session was affected, what stage of the pipeline failed, and what the actual error was.

Specific gaps:
- `upload-complete` route catches an AssemblyAI error but discards it entirely (`_err`)
- Fire-and-forget `runClaudeAnalysis()` calls only log at the call site, not inside the pipeline
- No session ID in most log messages
- Inconsistent format — plain strings, no structure, hard to scan in Vercel

## Goal

Consistent, structured, session-correlated logs across all API routes and the pipeline, viewable in Vercel's built-in log viewer without any external dependencies.

## Out of Scope

- External logging services (Axiom, Logtail, Sentry, etc.)
- Request ID middleware / `AsyncLocalStorage` correlation
- Request/response logging on every route
- Client-side logging

## Approach

A thin `lib/logger.ts` module wrapping `console` with structured JSON output. No new dependencies. Session ID passed as context at each call site.

## Logger Module (`lib/logger.ts`)

Exports a singleton `log` object with four methods:

```ts
log.info(msg: string, ctx?: Record<string, unknown>)
log.warn(msg: string, ctx?: Record<string, unknown>)
log.error(msg: string, ctx?: Record<string, unknown>)
log.debug(msg: string, ctx?: Record<string, unknown>)
```

Each call writes a JSON line:

```json
{"level":"info","msg":"Claude analysis started","sessionId":"abc-123","ts":"2026-03-22T10:00:00.000Z"}
{"level":"error","msg":"Claude analysis failed","sessionId":"abc-123","error":"Rate limit exceeded","stack":"...","ts":"2026-03-22T10:00:05.000Z"}
```

Rules:
- `info`, `warn`, `debug` write to `stdout`; `error` writes to `stderr` (Vercel separates these)
- `debug` is a no-op when `NODE_ENV === 'production'`
- `Error` instances in `ctx` are serialized to `{ error: err.message, stack: err.stack }`
- All other `ctx` values are spread into the top-level JSON object

## Events to Log

All events include `sessionId` where applicable.

| File | Event | Level |
|---|---|---|
| `upload-complete` route | AssemblyAI job created successfully | `info` |
| `upload-complete` route | AssemblyAI job creation failed (fix `_err` swallow) | `error` |
| `webhooks/assemblyai` | Webhook received with job ID | `info` |
| `webhooks/assemblyai` | Unauthorized webhook rejected | `warn` |
| `webhooks/assemblyai` | `getTranscript` failed | `error` |
| `webhooks/assemblyai` | `parseWebhookBody` failed | `error` |
| `webhooks/assemblyai` | Segment insert error | `error` |
| `webhooks/assemblyai` | Speaker count determined, path chosen | `info` |
| `pipeline.ts` | Claude analysis started | `info` |
| `pipeline.ts` | Claude analysis complete (annotation count) | `info` |
| `pipeline.ts` | Claude analysis failed | `error` |
| `pipeline.ts` | Annotation insert failed | `error` |
| `speaker` route | Analysis triggered after speaker identification | `info` |
| `analyse` route | Re-analysis triggered | `info` |
| `retry` route | Retry attempted, which stage | `info` |

All existing bare `console.error` calls are replaced with `log.error(...)` with appropriate context.

## File Changes

- `lib/logger.ts` — new file (~25 lines)
- `lib/pipeline.ts` — replace `throw`/console calls with `log.*`
- `app/api/webhooks/assemblyai/route.ts` — replace all `console.error` calls
- `app/api/sessions/[id]/upload-complete/route.ts` — fix `_err` swallow, add `log.info` on success
- `app/api/sessions/[id]/speaker/route.ts` — add `log.info` when analysis is triggered
- `app/api/sessions/[id]/analyse/route.ts` — add `log.info` when re-analysis is triggered
- `app/api/sessions/[id]/retry/route.ts` — add `log.info`, fix bare `console.error`

## Testing

One new test file: `__tests__/lib/logger.test.ts`

Test cases:
1. Output is valid JSON
2. Output contains `level`, `msg`, `ts` fields
3. `ctx` fields are spread into the top-level object
4. `Error` instances are serialized to `{ error: message, stack }`
5. `debug` logs are suppressed when `NODE_ENV=production`

No tests for call sites — they are trivial wiring.

## No New Dependencies

Uses Node.js built-in `console` only. Zero package changes.
