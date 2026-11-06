import { describe, expect, it } from 'vitest'

import { isDue, windowStart } from '@/jobs/Digests/buildDigest'

const MONDAY = new Date('2026-11-02T07:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

describe('digest paces', () => {
  it('never sends Immediate, Never or a pace nothing declares', () => {
    for (const pace of ['Immediate', 'Never', 'Fortnightly'])
      expect(isDue(pace, MONDAY)).toBe(false)
  })

  it('fires Weekly on the Monday anchor and not a day later', () => {
    expect(isDue('Weekly', MONDAY)).toBe(true)
    expect(isDue('Weekly', new Date(MONDAY.getTime() + DAY_MS))).toBe(false)
  })

  it('fires Monthly on the 1st and not the 2nd', () => {
    expect(isDue('Monthly', new Date('2026-12-01T07:00:00Z'))).toBe(true)
    expect(isDue('Monthly', new Date('2026-12-02T07:00:00Z'))).toBe(false)
  })

  /** ⚠ The clamp is the point: an old watermark must not make months of items "new". */
  it('clamps the window to one period when the watermark is older', () => {
    const old = new Date(MONDAY.getTime() - 40 * DAY_MS).toISOString()
    expect(windowStart(old, 'Daily', MONDAY).getTime()).toBe(MONDAY.getTime() - DAY_MS)
    expect(windowStart(old, 'Monthly', MONDAY).getTime()).toBe(MONDAY.getTime() - 30 * DAY_MS)
    const recent = new Date(MONDAY.getTime() - 3 * DAY_MS).toISOString()
    expect(windowStart(recent, 'Weekly', MONDAY).toISOString()).toBe(recent)
    expect(windowStart(null, 'Weekly', MONDAY).getTime()).toBe(MONDAY.getTime() - 7 * DAY_MS)
  })
})
