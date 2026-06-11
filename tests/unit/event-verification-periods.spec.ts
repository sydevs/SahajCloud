import { describe, expect, it } from 'vitest'

import {
  addDays,
  DEFAULT_VERIFICATION_PERIOD_DAYS,
  verificationPeriodDays,
} from '@/lib/eventVerification/periods'

describe('verificationPeriodDays', () => {
  it('maps each known cadence to its period', () => {
    expect(verificationPeriodDays('Monthly')).toBe(30)
    expect(verificationPeriodDays('3 Months')).toBe(90)
    expect(verificationPeriodDays('6 Months')).toBe(180)
  })

  it('defaults to 3 Months (90d) when unset or unknown', () => {
    expect(verificationPeriodDays(undefined)).toBe(DEFAULT_VERIFICATION_PERIOD_DAYS)
    expect(verificationPeriodDays(null)).toBe(90)
    expect(verificationPeriodDays('')).toBe(90)
    expect(verificationPeriodDays('Fortnightly')).toBe(90)
  })
})

describe('addDays', () => {
  it('adds whole days without mutating the input', () => {
    const from = new Date('2026-06-11T02:00:00.000Z')
    expect(addDays(from, 7).toISOString()).toBe('2026-06-18T02:00:00.000Z')
    expect(addDays(from, 90).toISOString()).toBe('2026-09-09T02:00:00.000Z')
    expect(from.toISOString()).toBe('2026-06-11T02:00:00.000Z')
  })
})
