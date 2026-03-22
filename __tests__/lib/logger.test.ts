// __tests__/lib/logger.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log } from '@/lib/logger'

describe('logger', () => {
  let stdoutLines: string[]
  let stderrLines: string[]

  beforeEach(() => {
    stdoutLines = []
    stderrLines = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => { stdoutLines.push(line) })
    vi.spyOn(console, 'error').mockImplementation((line: string) => { stderrLines.push(line) })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes valid JSON to stdout for info', () => {
    log.info('hello')
    expect(stdoutLines).toHaveLength(1)
    expect(() => JSON.parse(stdoutLines[0])).not.toThrow()
  })

  it('includes level, msg, and ts fields', () => {
    log.info('test message')
    const parsed = JSON.parse(stdoutLines[0])
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('test message')
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('spreads ctx fields into the top-level object', () => {
    log.info('with context', { sessionId: 'abc-123', count: 5 })
    const parsed = JSON.parse(stdoutLines[0])
    expect(parsed.sessionId).toBe('abc-123')
    expect(parsed.count).toBe(5)
  })

  it('serializes Error instances in ctx to error and stack fields', () => {
    log.error('something failed', { err: new Error('boom') })
    const parsed = JSON.parse(stderrLines[0])
    expect(parsed.error).toBe('boom')
    expect(parsed.stack).toContain('Error: boom')
  })

  it('writes error level to stderr, not stdout', () => {
    log.error('oops')
    expect(stderrLines).toHaveLength(1)
    expect(stdoutLines).toHaveLength(0)
  })

  it('writes warn to stdout', () => {
    log.warn('heads up')
    expect(stdoutLines).toHaveLength(1)
    expect(stderrLines).toHaveLength(0)
    const parsed = JSON.parse(stdoutLines[0])
    expect(parsed.level).toBe('warn')
  })

  it('suppresses debug when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.debug('hidden')
    vi.unstubAllEnvs()
    expect(stdoutLines).toHaveLength(0)
  })

  it('writes debug when NODE_ENV is not production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    log.debug('visible')
    vi.unstubAllEnvs()
    expect(stdoutLines).toHaveLength(1)
    const parsed = JSON.parse(stdoutLines[0])
    expect(parsed.level).toBe('debug')
  })
})
