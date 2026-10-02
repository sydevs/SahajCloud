import type { Payload } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `development`, not `test`: the kick's other guard suppresses it under
// `NODE_ENV=test` so a background run cannot race a spec's assertions, and with
// that guard active neither case below could tell the flag was read at all.
const baseEnv = {
  NODE_ENV: 'development',
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/payload_test',
  WEMEDITATE_WEB_URL: 'https://wemeditate.example.com',
  SAHAJATLAS_URL: 'https://atlas.example.com',
} as const

/**
 * The two fields the kick touches. Narrowed to `Payload` at the call, as the
 * real callers hand it the instance from `req.payload`.
 */
const fakePayload = () => ({
  jobs: { run: vi.fn().mockResolvedValue(undefined) },
  logger: { warn: vi.fn() },
})

const load = async (flag?: string) => {
  process.env = { ...baseEnv } as NodeJS.ProcessEnv
  if (flag !== undefined) process.env.JOBS_AUTORUN_ENABLED = flag
  const mod = await import('@/collections/UserSubmissions/screeningQueue')
  return mod.runScreeningQueueAfterCommit
}

describe('runScreeningQueueAfterCommit', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    process.env = originalEnv
  })

  // A copy of production is served with the flag off. The cron gate alone does
  // not stop this run, which delivers a submission to a real mailing list
  // within seconds of its create (#876).
  it.each([
    ['false', false],
    ['0', false],
    [' FALSE ', false],
    ['true', true],
    [undefined, true],
  ])('JOBS_AUTORUN_ENABLED=%s runs the queue: %s', async (flag, expected) => {
    const runScreeningQueueAfterCommit = await load(flag)
    const payload = fakePayload()

    runScreeningQueueAfterCommit({
      payload: payload as unknown as Payload,
      label: 'spec',
      context: { submissionId: 1 },
    })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(payload.jobs.run.mock.calls).toEqual(expected ? [[{ queue: 'screening' }]] : [])
  })
})
