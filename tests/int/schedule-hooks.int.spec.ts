/**
 * Tests for schedule field virtual field hooks.
 *
 * Tests the `computeRRule` and `computeUpcomingDates` afterRead hooks
 * from src/hooks/scheduleHooks.ts. These hooks are pure functions
 * that compute virtual fields from schedule sub-field data.
 *
 * No Payload initialization is needed — both hooks only use `siblingData`.
 */
import type { FieldHook } from 'payload'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { computeRRule, computeUpcomingDates, getLocalTimeHHMM } from '@/hooks/scheduleHooks'

// Helper to call a FieldHook with siblingData (avoids `as never` casts)
const callHook = (hook: FieldHook, siblingData: Record<string, unknown>): unknown => {
  return hook({ siblingData } as Parameters<FieldHook>[0])
}

// Reusable base fields for building test cases.
// firstDate is a UTC ISO datetime string; firstDate_tz is the IANA timezone.
const baseFields = {
  firstDate: '2025-03-15T14:00:00.000Z',
  firstDate_tz: 'UTC',
}

// ──────────────────────────────────────────────────────────────────────
// computeRRule
// ──────────────────────────────────────────────────────────────────────
describe('Schedule Field Hooks', () => {
  describe('computeRRule', () => {
    // ── Null / missing data ──────────────────────────────────────────
    describe('returns null when firstDate is missing or invalid', () => {
      it('returns null when firstDate is missing', () => {
        const result = callHook(computeRRule, {
          recurrenceType: 'daily',
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })

      it('returns null when firstDate is invalid', () => {
        const result = callHook(computeRRule, {
          recurrenceType: 'daily',
          firstDate: 'not-a-date',
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })

      it('returns null when siblingData is empty', () => {
        const result = callHook(computeRRule, {})
        expect(result).toBeNull()
      })

      it('returns null when firstDate is empty string', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          firstDate: '',
        })
        expect(result).toBeNull()
      })
    })

    // ── One-off events (single-occurrence RRULE) ──────────────────────
    describe('returns single-occurrence RRULE for non-recurring events', () => {
      it('returns COUNT=1 RRULE when recurrenceType is missing', () => {
        const result = callHook(computeRRule, { ...baseFields }) as string
        expect(result).toContain('FREQ=DAILY')
        expect(result).toContain('COUNT=1')
      })

      it('returns COUNT=1 RRULE when recurrenceType is "none"', () => {
        const result = callHook(computeRRule, { ...baseFields, recurrenceType: 'none' }) as string
        expect(result).toContain('FREQ=DAILY')
        expect(result).toContain('COUNT=1')
      })

      it('returns COUNT=1 RRULE for unrecognized recurrenceType', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'yearly',
        }) as string
        expect(result).toContain('FREQ=DAILY')
        expect(result).toContain('COUNT=1')
      })
    })

    // ── Daily recurrence ─────────────────────────────────────────────
    describe('daily recurrence', () => {
      it('generates RRULE with FREQ=DAILY', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string

        // rrule uses DTSTART:...Z format for UTC (no TZID parameter)
        expect(result).toContain('DTSTART:20250315T140000Z')
        expect(result).toContain('FREQ=DAILY')
      })

      it('generates daily RRULE with specific timezone', () => {
        // 09:30 EDT (UTC-4) on March 15 = 13:30 UTC
        const result = callHook(computeRRule, {
          firstDate: '2025-03-15T13:30:00.000Z',
          firstDate_tz: 'America/New_York',
          recurrenceType: 'daily',
        }) as string

        expect(result).toContain('TZID=America/New_York:20250315T093000')
        expect(result).toContain('FREQ=DAILY')
      })
    })

    // ── Weekly recurrence ────────────────────────────────────────────
    describe('weekly recurrence', () => {
      it('generates RRULE with FREQ=WEEKLY without weekdays', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'weekly',
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).not.toContain('BYDAY')
      })

      it('generates weekly RRULE with single weekday', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'weekly',
          weekdays: ['2'], // Wednesday
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).toContain('BYDAY=WE')
      })

      it('generates weekly RRULE with multiple weekdays', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'weekly',
          weekdays: ['0', '2', '4'], // Mon, Wed, Fri
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).toContain('BYDAY=MO,WE,FR')
      })

      it('ignores weekdays for non-weekly recurrence', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          weekdays: ['0', '2'],
        }) as string

        expect(result).toContain('FREQ=DAILY')
        expect(result).not.toContain('BYDAY')
      })

      it('handles empty weekdays array for weekly', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'weekly',
          weekdays: [],
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).not.toContain('BYDAY')
      })
    })

    // ── Monthly recurrence ───────────────────────────────────────────
    describe('monthly recurrence', () => {
      it('defaults to by-date mode using start date day', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
        }) as string

        expect(result).toContain('FREQ=MONTHLY')
        expect(result).toContain('BYMONTHDAY=15') // day from firstDate
      })

      it('generates monthly by specific day of month', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'date',
          monthDay: 1,
        }) as string

        expect(result).toContain('BYMONTHDAY=1')
      })

      it('generates monthly by day 31', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'date',
          monthDay: 31,
        }) as string

        expect(result).toContain('BYMONTHDAY=31')
      })

      it('falls back to start date day when monthDay not specified', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          firstDate: '2025-03-20T14:00:00.000Z',
          recurrenceType: 'monthly',
          monthlyMode: 'date',
        }) as string

        expect(result).toContain('BYMONTHDAY=20')
      })

      it('generates monthly by 1st Monday', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'weekday',
          weekNumber: '1',
          weekdayOfMonth: '0', // Monday
        }) as string

        expect(result).toContain('FREQ=MONTHLY')
        expect(result).toContain('BYDAY=+1MO')
      })

      it('generates monthly by 2nd Wednesday', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'weekday',
          weekNumber: '2',
          weekdayOfMonth: '2', // Wednesday
        }) as string

        expect(result).toContain('BYDAY=+2WE')
      })

      it('generates monthly by 3rd Friday', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'weekday',
          weekNumber: '3',
          weekdayOfMonth: '4', // Friday
        }) as string

        expect(result).toContain('BYDAY=+3FR')
      })

      it('generates monthly by last Friday', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'weekday',
          weekNumber: '-1',
          weekdayOfMonth: '4', // Friday
        }) as string

        expect(result).toContain('BYDAY=-1FR')
      })

      it('defaults weekdayOfMonth to Monday when not specified', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'monthly',
          monthlyMode: 'weekday',
          weekNumber: '1',
        }) as string

        expect(result).toContain('BYDAY=+1MO')
      })
    })

    // ── Interval handling ────────────────────────────────────────────
    describe('interval handling', () => {
      it('omits INTERVAL when interval is 1', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          interval: 1,
        }) as string

        expect(result).not.toContain('INTERVAL')
      })

      it('omits INTERVAL when interval is not specified', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string

        expect(result).not.toContain('INTERVAL')
      })

      it('includes INTERVAL when interval is greater than 1', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          interval: 3,
        }) as string

        expect(result).toContain('INTERVAL=3')
      })
    })

    // ── Ending conditions ────────────────────────────────────────────
    describe('ending conditions', () => {
      it('omits COUNT and UNTIL when endingType not specified', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string

        expect(result).not.toContain('COUNT')
        expect(result).not.toContain('UNTIL')
      })

      it('includes COUNT when endingType is count', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'count',
          count: 5,
        }) as string

        expect(result).toContain('COUNT=5')
      })

      it('omits COUNT when count is 0', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'count',
          count: 0,
        }) as string

        expect(result).not.toContain('COUNT')
      })

      it('omits COUNT when count is not specified', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'count',
        }) as string

        expect(result).not.toContain('COUNT')
      })

      it('includes UNTIL when endingType is until', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'until',
          untilDate: '2025-12-31',
        }) as string

        expect(result).toContain('UNTIL=20251231T235900')
      })

      it('handles ISO datetime untilDate format', () => {
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'until',
          untilDate: '2025-12-31T00:00:00.000Z',
        }) as string

        expect(result).toContain('UNTIL=20251231T235900')
      })
    })

    // ── Timezone and date format ─────────────────────────────────────
    describe('timezone and date format', () => {
      it('uses provided timezone in DTSTART', () => {
        // March 15 London is GMT (UTC+0), so 14:00 UTC = 14:00 local
        const result = callHook(computeRRule, {
          ...baseFields,
          recurrenceType: 'daily',
          firstDate_tz: 'Europe/London',
        }) as string

        expect(result).toContain('TZID=Europe/London')
      })

      it('defaults to UTC when firstDate_tz not specified', () => {
        const result = callHook(computeRRule, {
          firstDate: '2025-03-15T14:00:00.000Z',
          recurrenceType: 'daily',
        }) as string

        // rrule uses DTSTART:...Z format for UTC (no TZID parameter)
        expect(result).toContain('DTSTART:20250315T140000Z')
      })

      it('uses time from firstDate datetime', () => {
        const result = callHook(computeRRule, {
          firstDate: '2025-03-15T16:45:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'daily',
        }) as string

        expect(result).toContain(':20250315T164500')
      })

      it('constructs correct DTSTART from firstDate', () => {
        const result = callHook(computeRRule, {
          firstDate: '2025-01-02T09:30:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'daily',
        }) as string

        expect(result).toContain(':20250102T093000')
      })
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // computeUpcomingDates
  // ──────────────────────────────────────────────────────────────────
  describe('computeUpcomingDates', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      // Pin time to 2025-03-01T00:00:00Z — before baseFields firstDate (2025-03-15)
      vi.setSystemTime(new Date('2025-03-01T00:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    // ── Null / missing data ──────────────────────────────────────────
    describe('returns null for missing data', () => {
      it('returns null when firstDate is missing (recurring)', () => {
        const result = callHook(computeUpcomingDates, {
          recurrenceType: 'daily',
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })

      it('returns null when firstDate is missing (no recurrence)', () => {
        const result = callHook(computeUpcomingDates, {
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })
    })

    // ── One-off events ────────────────────────────────────────────────
    describe('one-off events (no recurrence)', () => {
      it('returns single-element array for future one-off event', () => {
        const result = callHook(computeUpcomingDates, { ...baseFields }) as string[]

        expect(result).toBeInstanceOf(Array)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      })

      it('returns single-element array when recurrenceType is "none"', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'none',
        }) as string[]

        expect(result).toBeInstanceOf(Array)
        expect(result).toHaveLength(1)
      })

      it('returns empty array for past one-off event', () => {
        const result = callHook(computeUpcomingDates, {
          firstDate: '2020-01-01T10:00:00.000Z',
          firstDate_tz: 'UTC',
        }) as string[]

        expect(result).toEqual([])
      })

      it('handles midnight time in firstDate', () => {
        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-15T00:00:00.000Z',
          firstDate_tz: 'UTC',
        }) as string[]

        expect(result).toHaveLength(1)
        expect(result[0]).toContain('T00:00:00')
      })

      it('handles timezone for one-off events', () => {
        // 14:00 EDT (UTC-4) on March 15 = 18:00 UTC
        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-15T18:00:00.000Z',
          firstDate_tz: 'America/New_York',
        }) as string[]

        expect(result).toHaveLength(1)
        // The returned date should be in UTC (ISO string)
        expect(result[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      })
    })

    // ── Basic occurrence generation ──────────────────────────────────
    describe('basic occurrence generation', () => {
      it('returns array of ISO 8601 strings for daily recurrence', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string[]

        expect(result).toBeInstanceOf(Array)
        expect(result.length).toBeGreaterThan(0)
        for (const dateStr of result) {
          expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
        }
      })

      it('returns occurrences starting from now, not from dtstart', () => {
        // Set fake time to after the start date
        vi.setSystemTime(new Date('2025-03-20T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-01T10:00:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'daily',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)
        // All returned dates should be on or after 2025-03-20
        for (const dateStr of result) {
          expect(new Date(dateStr).getTime()).toBeGreaterThanOrEqual(
            new Date('2025-03-20T00:00:00Z').getTime(),
          )
        }
      })

      it('returns occurrences for weekly recurrence', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'weekly',
        }) as string[]

        expect(result).toBeInstanceOf(Array)
        expect(result.length).toBeGreaterThan(0)

        // All occurrences should be 7 days apart
        for (let i = 1; i < result.length; i++) {
          const diff = new Date(result[i]).getTime() - new Date(result[i - 1]).getTime()
          const daysDiff = diff / (1000 * 60 * 60 * 24)
          expect(daysDiff).toBe(7)
        }
      })

      it('returns empty array when all occurrences are in the past', () => {
        const result = callHook(computeUpcomingDates, {
          firstDate: '2020-01-01T10:00:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'daily',
          endingType: 'count',
          count: 3,
        }) as string[]

        expect(result).toEqual([])
      })
    })

    // ── Limiting behavior ────────────────────────────────────────────
    describe('limiting behavior', () => {
      it('returns at most 10 occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string[]

        expect(result.length).toBeLessThanOrEqual(10)
      })

      it('returns exactly 10 for unlimited daily rule with future start', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'daily',
        }) as string[]

        expect(result.length).toBe(10)
      })

      it('returns fewer than 10 when count limits occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'count',
          count: 3,
        }) as string[]

        expect(result.length).toBe(3)
      })

      it('returns fewer than 10 when until date limits occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'daily',
          endingType: 'until',
          untilDate: '2025-03-20',
        }) as string[]

        // Start 2025-03-15, until 2025-03-20 → 6 days
        expect(result.length).toBeGreaterThan(0)
        expect(result.length).toBeLessThanOrEqual(6)

        // All dates should be on or before the until date
        for (const dateStr of result) {
          expect(new Date(dateStr).getTime()).toBeLessThanOrEqual(
            new Date('2025-03-20T23:59:00Z').getTime(),
          )
        }
      })
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // getLocalTimeHHMM — UTC → local timezone conversion
  // ──────────────────────────────────────────────────────────────────
  describe('getLocalTimeHHMM', () => {
    it('returns same time for UTC timezone', () => {
      expect(getLocalTimeHHMM('2025-03-15T14:30:00.000Z', 'UTC')).toBe('14:30')
    })

    it('converts UTC to Eastern Daylight Time (EDT, UTC-4)', () => {
      // March 15 is after DST spring forward (March 9, 2025)
      // 13:30 UTC = 09:30 EDT
      expect(getLocalTimeHHMM('2025-03-15T13:30:00.000Z', 'America/New_York')).toBe('09:30')
    })

    it('converts UTC to Eastern Standard Time (EST, UTC-5)', () => {
      // January 15 is in standard time
      // 13:30 UTC = 08:30 EST
      expect(getLocalTimeHHMM('2025-01-15T13:30:00.000Z', 'America/New_York')).toBe('08:30')
    })

    it('handles DST transition — same UTC time yields different local times', () => {
      // Before DST (EST, UTC-5): 14:00 UTC = 09:00 local
      const winterTime = getLocalTimeHHMM('2025-02-15T14:00:00.000Z', 'America/New_York')
      // After DST (EDT, UTC-4): 14:00 UTC = 10:00 local
      const summerTime = getLocalTimeHHMM('2025-06-15T14:00:00.000Z', 'America/New_York')

      expect(winterTime).toBe('09:00')
      expect(summerTime).toBe('10:00')
    })

    it('converts UTC to positive offset timezone (Asia/Kolkata, UTC+5:30)', () => {
      // 14:00 UTC = 19:30 IST
      expect(getLocalTimeHHMM('2025-03-15T14:00:00.000Z', 'Asia/Kolkata')).toBe('19:30')
    })

    it('handles midnight correctly', () => {
      expect(getLocalTimeHHMM('2025-03-15T00:00:00.000Z', 'UTC')).toBe('00:00')
    })

    it('handles date rollover from timezone conversion', () => {
      // 02:00 UTC on March 15 in America/New_York (EST, UTC-5) = 21:00 on March 14
      expect(getLocalTimeHHMM('2025-01-15T02:00:00.000Z', 'America/New_York')).toBe('21:00')
    })

    it('returns null for invalid date string', () => {
      expect(getLocalTimeHHMM('not-a-date', 'UTC')).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // RRULE DTSTART — verifies full conversion chain with timezones
  // ──────────────────────────────────────────────────────────────────
  describe('computeRRule timezone conversion chain', () => {
    it('converts UTC datetime to correct local DTSTART for non-UTC timezone', () => {
      // 13:30 UTC on March 15 = 09:30 EDT (America/New_York)
      const result = callHook(computeRRule, {
        firstDate: '2025-03-15T13:30:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'daily',
      }) as string

      // DTSTART should show local time 09:30 in NYC timezone
      expect(result).toContain('TZID=America/New_York:20250315T093000')
    })

    it('adjusts DTSTART correctly across DST boundary', () => {
      // January 15 (EST, UTC-5): 14:00 UTC = 09:00 local
      const winterResult = callHook(computeRRule, {
        firstDate: '2025-01-15T14:00:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'daily',
      }) as string

      // June 15 (EDT, UTC-4): 14:00 UTC = 10:00 local
      const summerResult = callHook(computeRRule, {
        firstDate: '2025-06-15T14:00:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'daily',
      }) as string

      expect(winterResult).toContain('TZID=America/New_York:20250115T090000')
      expect(summerResult).toContain('TZID=America/New_York:20250615T100000')
    })

    it('handles half-hour offset timezone (Asia/Kolkata, UTC+5:30)', () => {
      // 14:00 UTC = 19:30 IST
      const result = callHook(computeRRule, {
        firstDate: '2025-03-15T14:00:00.000Z',
        firstDate_tz: 'Asia/Kolkata',
        recurrenceType: 'daily',
      }) as string

      expect(result).toContain('TZID=Asia/Kolkata:20250315T193000')
    })
  })
})
