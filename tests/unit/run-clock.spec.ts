import { describe, expect, it } from 'vitest'

import { runClock } from '@/lib/jobs/runClock'

describe('runClock', () => {
  it('answers a Date a test set on req.context.now', () => {
    const now = new Date('2026-01-05T07:00:00Z')
    expect(runClock({ context: { now } })).toBe(now)
  })

  it('falls back to the wall clock for anything that is not a Date', () => {
    const before = Date.now()
    for (const context of [{}, { now: '2026-01-05T07:00:00Z' }, { now: 0 }]) {
      expect(runClock({ context }).getTime()).toBeGreaterThanOrEqual(before)
    }
  })
})
