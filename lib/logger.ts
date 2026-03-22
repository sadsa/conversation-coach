// lib/logger.ts
type Ctx = Record<string, unknown>

function serialize(ctx: Ctx): Ctx {
  const out: Ctx = {}
  for (const [k, v] of Object.entries(ctx)) {
    if (v instanceof Error) {
      out.error = v.message
      out.stack = v.stack
    } else {
      out[k] = v
    }
  }
  return out
}

function write(level: string, msg: string, ctx: Ctx = {}, toStderr = false): void {
  const line = JSON.stringify({ level, msg, ...serialize(ctx), ts: new Date().toISOString() })
  if (toStderr) {
    console.error(line)
  } else {
    console.log(line)
  }
}

export const log = {
  info:  (msg: string, ctx?: Ctx) => write('info', msg, ctx),
  warn:  (msg: string, ctx?: Ctx) => write('warn', msg, ctx),
  error: (msg: string, ctx?: Ctx) => write('error', msg, ctx, true),
  debug: (msg: string, ctx?: Ctx) => { if (process.env.NODE_ENV !== 'production') write('debug', msg, ctx) },
}
