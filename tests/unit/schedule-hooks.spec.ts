/**
 * Tests for schedule field virtual field hooks.
 *
 * Tests the `computeIcalRule` and `computeUpcomingDates` afterRead hooks
 * from src/lib/schedule/scheduleHooks.ts. These hooks are pure functions
 * that compute virtual fields from schedule sub-field data.
 *
 * No Payload initialization is needed — both hooks only use `siblingData`.
 */
import type { FieldHook, NamedGroupField } from 'payload'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { scheduleFields } from '@/fields/scheduleFields'
import {
  cleanupExpiredExclusions,
  computeIcalRule,
  computeLastDate,
  computeUpcomingDates,
  getLocalTimeHHMM,
  lastOccurrenceEnd,
} from '@/lib/schedule/scheduleHooks'

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
// computeIcalRule
// ──────────────────────────────────────────────────────────────────────
describe('Schedule Field Hooks', () => {
  describe('computeIcalRule', () => {
    // ── Null / missing data ──────────────────────────────────────────
    describe('returns null when firstDate is missing or invalid', () => {
      it('returns null when firstDate is missing', () => {
        const result = callHook(computeIcalRule, {
          recurrenceType: 'DAILY',
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })

      it('returns null when firstDate is invalid', () => {
        const result = callHook(computeIcalRule, {
          recurrenceType: 'DAILY',
          firstDate: 'not-a-date',
          firstDate_tz: 'UTC',
        })
        expect(result).toBeNull()
      })

      it('returns null when siblingData is empty', () => {
        const result = callHook(computeIcalRule, {})
        expect(result).toBeNull()
      })

      it('returns null when firstDate is empty string', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          firstDate: '',
        })
        expect(result).toBeNull()
      })
    })

    // ── One-off events (single-occurrence RRULE) ──────────────────────
    describe('returns single-occurrence RRULE for non-recurring events', () => {
      it('returns COUNT=1 RRULE when recurrenceType is missing', () => {
        const result = callHook(computeIcalRule, { ...baseFields }) as string
        expect(result).toContain('FREQ=DAILY')
        expect(result).toContain('COUNT=1')
      })

      it('returns COUNT=1 RRULE when recurrenceType is "none"', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'none',
        }) as string
        expect(result).toContain('FREQ=DAILY')
        expect(result).toContain('COUNT=1')
      })

      it('returns COUNT=1 RRULE for unrecognized recurrenceType', () => {
        const result = callHook(computeIcalRule, {
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
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
        }) as string

        // rrule-temporal uses DTSTART;TZID=UTC format (always includes TZID)
        expect(result).toContain('DTSTART;TZID=UTC:20250315T140000')
        expect(result).toContain('FREQ=DAILY')
      })

      it('generates daily RRULE with specific timezone', () => {
        // 09:30 EDT (UTC-4) on March 15 = 13:30 UTC
        const result = callHook(computeIcalRule, {
          firstDate: '2025-03-15T13:30:00.000Z',
          firstDate_tz: 'America/New_York',
          recurrenceType: 'DAILY',
        }) as string

        expect(result).toContain('DTSTART;TZID=America/New_York:20250315T093000')
        expect(result).toContain('FREQ=DAILY')
      })
    })

    // ── Weekly recurrence ────────────────────────────────────────────
    describe('weekly recurrence', () => {
      it('generates RRULE with FREQ=WEEKLY without weekdays', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'WEEKLY',
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).not.toContain('BYDAY')
      })

      it('generates weekly RRULE with single weekday', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'WEEKLY',
          weekdays: ['WE'], // Wednesday
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).toContain('BYDAY=WE')
      })

      it('generates weekly RRULE with multiple weekdays', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'WEEKLY',
          weekdays: ['MO', 'WE', 'FR'], // Mon, Wed, Fri
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).toContain('BYDAY=MO,WE,FR')
      })

      it('ignores weekdays for non-weekly recurrence', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          weekdays: ['MO', 'WE'],
        }) as string

        expect(result).toContain('FREQ=DAILY')
        expect(result).not.toContain('BYDAY')
      })

      it('handles empty weekdays array for weekly', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'WEEKLY',
          weekdays: [],
        }) as string

        expect(result).toContain('FREQ=WEEKLY')
        expect(result).not.toContain('BYDAY')
      })
    })

    // ── Monthly recurrence ───────────────────────────────────────────
    describe('monthly recurrence', () => {
      it('defaults to by-date mode using start date day', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
        }) as string

        expect(result).toContain('FREQ=MONTHLY')
        expect(result).toContain('BYMONTHDAY=15') // day from firstDate
      })

      it('generates monthly by specific day of month', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'date',
          monthDay: 1,
        }) as string

        expect(result).toContain('BYMONTHDAY=1')
      })

      it('generates monthly by day 31', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'date',
          monthDay: 31,
        }) as string

        expect(result).toContain('BYMONTHDAY=31')
      })

      it('falls back to start date day when monthDay not specified', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          firstDate: '2025-03-20T14:00:00.000Z',
          recurrenceType: 'MONTHLY',
          monthlyMode: 'date',
        }) as string

        expect(result).toContain('BYMONTHDAY=20')
      })

      it('generates monthly by 1st Monday', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'weekday',
          weekNumber: '1',
          weekdayOfMonth: 'MO', // Monday
        }) as string

        expect(result).toContain('FREQ=MONTHLY')
        expect(result).toContain('BYDAY=1MO')
      })

      it('generates monthly by 2nd Wednesday', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'weekday',
          weekNumber: '2',
          weekdayOfMonth: 'WE', // Wednesday
        }) as string

        expect(result).toContain('BYDAY=2WE')
      })

      it('generates monthly by 3rd Friday', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'weekday',
          weekNumber: '3',
          weekdayOfMonth: 'FR', // Friday
        }) as string

        expect(result).toContain('BYDAY=3FR')
      })

      it('generates monthly by last Friday', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'weekday',
          weekNumber: '-1',
          weekdayOfMonth: 'FR', // Friday
        }) as string

        expect(result).toContain('BYDAY=-1FR')
      })

      it('defaults weekdayOfMonth to Monday when not specified', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'MONTHLY',
          monthlyMode: 'weekday',
          weekNumber: '1',
        }) as string

        expect(result).toContain('BYDAY=1MO')
      })
    })

    // ── Interval handling ────────────────────────────────────────────
    describe('interval handling', () => {
      it('omits INTERVAL when interval is 1', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          interval: 1,
        }) as string

        expect(result).not.toContain('INTERVAL')
      })

      it('omits INTERVAL when interval is not specified', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
        }) as string

        expect(result).not.toContain('INTERVAL')
      })

      it('includes INTERVAL when interval is greater than 1', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          interval: 3,
        }) as string

        expect(result).toContain('INTERVAL=3')
      })
    })

    // ── Ending conditions ────────────────────────────────────────────
    describe('ending conditions', () => {
      it('omits COUNT and UNTIL when endingType not specified', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
        }) as string

        expect(result).not.toContain('COUNT')
        expect(result).not.toContain('UNTIL')
      })

      it('includes COUNT when endingType is count', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'count',
          count: 5,
        }) as string

        expect(result).toContain('COUNT=5')
      })

      it('omits COUNT when count is 0', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'count',
          count: 0,
        }) as string

        expect(result).not.toContain('COUNT')
      })

      it('omits COUNT when count is not specified', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'count',
        }) as string

        expect(result).not.toContain('COUNT')
      })

      it('includes UNTIL when endingType is until', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'until',
          untilDate: '2025-12-31',
        }) as string

        // rrule-temporal converts UNTIL to UTC with Z suffix
        expect(result).toContain('UNTIL=20251231T235900Z')
      })

      it('handles ISO datetime untilDate format', () => {
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'until',
          untilDate: '2025-12-31T00:00:00.000Z',
        }) as string

        expect(result).toContain('UNTIL=20251231T235900Z')
      })
    })

    // ── Timezone and date format ─────────────────────────────────────
    describe('timezone and date format', () => {
      it('uses provided timezone in DTSTART', () => {
        // March 15 London is GMT (UTC+0), so 14:00 UTC = 14:00 local
        const result = callHook(computeIcalRule, {
          ...baseFields,
          recurrenceType: 'DAILY',
          firstDate_tz: 'Europe/London',
        }) as string

        expect(result).toContain('DTSTART;TZID=Europe/London')
      })

      it('defaults to UTC when firstDate_tz not specified', () => {
        const result = callHook(computeIcalRule, {
          firstDate: '2025-03-15T14:00:00.000Z',
          recurrenceType: 'DAILY',
        }) as string

        // rrule-temporal always uses DTSTART;TZID format, even for UTC
        expect(result).toContain('DTSTART;TZID=UTC:20250315T140000')
      })

      it('uses time from firstDate datetime', () => {
        const result = callHook(computeIcalRule, {
          firstDate: '2025-03-15T16:45:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'DAILY',
        }) as string

        expect(result).toContain(':20250315T164500')
      })

      it('constructs correct DTSTART from firstDate', () => {
        const result = callHook(computeIcalRule, {
          firstDate: '2025-01-02T09:30:00.000Z',
          firstDate_tz: 'UTC',
          recurrenceType: 'DAILY',
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
    describe('returns empty array for missing data', () => {
      it('returns empty array when firstDate is missing (recurring)', () => {
        const result = callHook(computeUpcomingDates, {
          recurrenceType: 'DAILY',
          firstDate_tz: 'UTC',
        })
        expect(result).toEqual([])
      })

      it('returns empty array when firstDate is missing (no recurrence)', () => {
        const result = callHook(computeUpcomingDates, {
          firstDate_tz: 'UTC',
        })
        expect(result).toEqual([])
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
          recurrenceType: 'DAILY',
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
          recurrenceType: 'DAILY',
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
          recurrenceType: 'WEEKLY',
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
          recurrenceType: 'DAILY',
          endingType: 'count',
          count: 3,
        }) as string[]

        expect(result).toEqual([])
      })
    })

    // ── Timezone correctness (DST bug regression) ────────────────────
    describe('timezone correctness (DST regression)', () => {
      it('returns correct UTC time for Europe/Berlin winter event (CET, UTC+1)', () => {
        // 18:00 Berlin in winter (CET) = 17:00 UTC
        // This is the original bug: rrule v2.8.1 returned 01:00 UTC due to double conversion
        vi.setSystemTime(new Date('2025-02-01T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-02-15T17:00:00.000Z', // 18:00 Berlin (CET, UTC+1)
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)
        // All occurrences should be at 17:00 UTC (18:00 Berlin in winter)
        for (const dateStr of result) {
          expect(dateStr).toMatch(/T17:00:00\.000Z$/)
        }
      })

      it('returns correct UTC time for Europe/Berlin summer event (CEST, UTC+2)', () => {
        // 18:00 Berlin in summer (CEST) = 16:00 UTC
        vi.setSystemTime(new Date('2025-06-01T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-06-15T16:00:00.000Z', // 18:00 Berlin (CEST, UTC+2)
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)
        // All occurrences should be at 16:00 UTC (18:00 Berlin in summer)
        for (const dateStr of result) {
          expect(dateStr).toMatch(/T16:00:00\.000Z$/)
        }
      })

      it('handles recurring event spanning DST transition (CET → CEST)', () => {
        // Weekly event starting in winter, spanning across DST transition
        // Berlin DST spring-forward: last Sunday of March 2025 = March 30
        vi.setSystemTime(new Date('2025-03-15T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-15T17:00:00.000Z', // 18:00 Berlin (CET, UTC+1)
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'WEEKLY',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)

        // Before DST (March): 18:00 Berlin = 17:00 UTC
        // After DST (April): 18:00 Berlin = 16:00 UTC
        for (const dateStr of result) {
          const date = new Date(dateStr)
          const month = date.getUTCMonth() // 0-indexed: 2=March, 3=April
          if (month <= 2) {
            // March and before: CET (UTC+1) → 17:00 UTC
            expect(dateStr).toMatch(/T17:00:00\.000Z$/)
          } else {
            // April and after: CEST (UTC+2) → 16:00 UTC
            expect(dateStr).toMatch(/T16:00:00\.000Z$/)
          }
        }
      })

      it('handles half-hour timezone (Asia/Kolkata, UTC+5:30)', () => {
        // 18:00 Kolkata (IST, UTC+5:30) = 12:30 UTC
        vi.setSystemTime(new Date('2025-03-01T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-15T12:30:00.000Z', // 18:00 Kolkata (IST)
          firstDate_tz: 'Asia/Kolkata',
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)
        // All occurrences should be at 12:30 UTC (18:00 Kolkata, no DST in India)
        for (const dateStr of result) {
          expect(dateStr).toMatch(/T12:30:00\.000Z$/)
        }
      })

      it('returns correct UTC for one-off event with timezone', () => {
        // One-off event at 18:00 Berlin (CET) = 17:00 UTC
        vi.setSystemTime(new Date('2025-02-01T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-02-15T17:00:00.000Z', // 18:00 Berlin (CET)
          firstDate_tz: 'Europe/Berlin',
        }) as string[]

        expect(result).toHaveLength(1)
        expect(result[0]).toBe('2025-02-15T17:00:00.000Z')
      })

      it('handles America/New_York DST transition (EST → EDT)', () => {
        // New York DST spring-forward: 2nd Sunday of March 2025 = March 9
        vi.setSystemTime(new Date('2025-03-01T00:00:00Z'))

        const result = callHook(computeUpcomingDates, {
          firstDate: '2025-03-01T15:00:00.000Z', // 10:00 NYC (EST, UTC-5)
          firstDate_tz: 'America/New_York',
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBeGreaterThan(0)

        for (const dateStr of result) {
          const date = new Date(dateStr)
          // Before March 9: EST (UTC-5) → 10:00 local = 15:00 UTC
          // After March 9: EDT (UTC-4) → 10:00 local = 14:00 UTC
          if (date.getUTCDate() < 9 && date.getUTCMonth() === 2) {
            expect(dateStr).toMatch(/T15:00:00\.000Z$/)
          } else if (date.getUTCDate() >= 10 && date.getUTCMonth() === 2) {
            expect(dateStr).toMatch(/T14:00:00\.000Z$/)
          }
        }
      })
    })

    // ── Limiting behavior ────────────────────────────────────────────
    describe('limiting behavior', () => {
      it('returns at most 10 occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBeLessThanOrEqual(10)
      })

      it('returns exactly 10 for unlimited daily rule with future start', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'DAILY',
        }) as string[]

        expect(result.length).toBe(10)
      })

      it('returns fewer than 10 when count limits occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'DAILY',
          endingType: 'count',
          count: 3,
        }) as string[]

        expect(result.length).toBe(3)
      })

      it('returns fewer than 10 when until date limits occurrences', () => {
        const result = callHook(computeUpcomingDates, {
          ...baseFields,
          recurrenceType: 'DAILY',
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
  describe('computeIcalRule timezone conversion chain', () => {
    it('converts UTC datetime to correct local DTSTART for non-UTC timezone', () => {
      // 13:30 UTC on March 15 = 09:30 EDT (America/New_York)
      const result = callHook(computeIcalRule, {
        firstDate: '2025-03-15T13:30:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'DAILY',
      }) as string

      // DTSTART should show local time 09:30 in NYC timezone
      expect(result).toContain('DTSTART;TZID=America/New_York:20250315T093000')
    })

    it('adjusts DTSTART correctly across DST boundary', () => {
      // January 15 (EST, UTC-5): 14:00 UTC = 09:00 local
      const winterResult = callHook(computeIcalRule, {
        firstDate: '2025-01-15T14:00:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'DAILY',
      }) as string

      // June 15 (EDT, UTC-4): 14:00 UTC = 10:00 local
      const summerResult = callHook(computeIcalRule, {
        firstDate: '2025-06-15T14:00:00.000Z',
        firstDate_tz: 'America/New_York',
        recurrenceType: 'DAILY',
      }) as string

      expect(winterResult).toContain('DTSTART;TZID=America/New_York:20250115T090000')
      expect(summerResult).toContain('DTSTART;TZID=America/New_York:20250615T100000')
    })

    it('handles half-hour offset timezone (Asia/Kolkata, UTC+5:30)', () => {
      // 14:00 UTC = 19:30 IST
      const result = callHook(computeIcalRule, {
        firstDate: '2025-03-15T14:00:00.000Z',
        firstDate_tz: 'Asia/Kolkata',
        recurrenceType: 'DAILY',
      }) as string

      expect(result).toContain('DTSTART;TZID=Asia/Kolkata:20250315T193000')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // computeIcalRule with exclusion date ranges
  // ──────────────────────────────────────────────────────────────────
  describe('computeIcalRule with exclusions', () => {
    it('generates EXDATE for single-day exclusion (no endDate)', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-17' }],
      }) as string

      expect(result).toContain('EXDATE')
      // March 17 at 14:00 UTC should be excluded
      expect(result).toContain('20250317T140000Z')
    })

    it('generates EXDATE for exclusion where startDate === endDate', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-18', endDate: '2025-03-18' }],
      }) as string

      expect(result).toContain('EXDATE')
      expect(result).toContain('20250318T140000Z')
    })

    it('generates multiple EXDATEs for multi-day range', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-20', endDate: '2025-03-22' }],
      }) as string

      expect(result).toContain('EXDATE')
      // All three days should be excluded
      expect(result).toContain('20250320T140000Z')
      expect(result).toContain('20250321T140000Z')
      expect(result).toContain('20250322T140000Z')
    })

    it('generates EXDATEs from multiple exclusion ranges', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [
          { startDate: '2025-03-17' },
          { startDate: '2025-03-20', endDate: '2025-03-21' },
        ],
      }) as string

      expect(result).toContain('20250317T140000Z')
      expect(result).toContain('20250320T140000Z')
      expect(result).toContain('20250321T140000Z')
    })

    it('does not add EXDATE for non-recurring events', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        exclusions: [{ startDate: '2025-03-15' }],
      }) as string

      // Non-recurring: single-occurrence rule, exclusions ignored
      expect(result).toContain('COUNT=1')
      expect(result).not.toContain('EXDATE')
    })

    it('does not add EXDATE when exclusion range is outside rule period', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        endingType: 'count',
        count: 3, // Only March 15, 16, 17
        exclusions: [{ startDate: '2025-04-01', endDate: '2025-04-05' }],
      }) as string

      // April exclusions don't overlap with March 15-17 occurrences
      expect(result).not.toContain('EXDATE')
    })

    it('generates EXDATE for weekly rule with partial-week exclusion', () => {
      // Weekly on Saturdays starting March 15 (Saturday)
      // Next occurrences: Mar 15, Mar 22, Mar 29, Apr 5...
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'WEEKLY',
        exclusions: [{ startDate: '2025-03-21', endDate: '2025-03-23' }],
      }) as string

      // Only March 22 (Saturday) falls in the Mar 21-23 range
      expect(result).toContain('EXDATE')
      expect(result).toContain('20250322T140000Z')
      // Mar 29 should NOT be excluded
      expect(result).not.toContain('20250329')
    })

    it('does not add EXDATE when exclusions array is empty', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [],
      }) as string

      expect(result).not.toContain('EXDATE')
    })

    it('reason field does not affect EXDATE output', () => {
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-17', reason: 'Holiday break' }],
      }) as string

      expect(result).toContain('EXDATE')
      expect(result).toContain('20250317T140000Z')
      expect(result).not.toContain('Holiday')
    })

    it('generates timezone-correct EXDATE for Europe/Berlin', () => {
      // 18:00 Berlin in winter (CET, UTC+1) = 17:00 UTC
      // Daily recurrence starting March 15
      const result = callHook(computeIcalRule, {
        firstDate: '2025-03-15T17:00:00.000Z',
        firstDate_tz: 'Europe/Berlin',
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-18' }],
      }) as string

      expect(result).toContain('EXDATE')
      // EXDATE should be at 17:00 UTC (18:00 Berlin CET)
      expect(result).toContain('20250318T170000Z')
    })

    it('handles ISO datetime format in exclusion startDate', () => {
      // PayloadCMS dayOnly fields may store full ISO datetime
      const result = callHook(computeIcalRule, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-17T00:00:00.000Z' }],
      }) as string

      expect(result).toContain('EXDATE')
      expect(result).toContain('20250317T140000Z')
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // computeUpcomingDates with exclusion date ranges
  // ──────────────────────────────────────────────────────────────────
  describe('computeUpcomingDates with exclusions', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-03-01T00:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('omits excluded dates from results', () => {
      const result = callHook(computeUpcomingDates, {
        ...baseFields,
        recurrenceType: 'DAILY',
        endingType: 'count',
        count: 5, // Mar 15, 16, 17, 18, 19
        exclusions: [{ startDate: '2025-03-17' }],
      }) as string[]

      // Should have 4 dates (5 minus 1 excluded)
      expect(result).toHaveLength(4)
      // Mar 17 should not be in the results
      const dates = result.map((d) => new Date(d).getUTCDate())
      expect(dates).not.toContain(17)
      expect(dates).toContain(15)
      expect(dates).toContain(16)
      expect(dates).toContain(18)
      expect(dates).toContain(19)
    })

    it('correct count when exclusions reduce available dates', () => {
      const result = callHook(computeUpcomingDates, {
        ...baseFields,
        recurrenceType: 'DAILY',
        endingType: 'count',
        count: 5,
        exclusions: [{ startDate: '2025-03-16', endDate: '2025-03-18' }],
      }) as string[]

      // 5 occurrences minus 3 excluded = 2 remaining
      expect(result).toHaveLength(2)
      const dates = result.map((d) => new Date(d).getUTCDate())
      expect(dates).toContain(15)
      expect(dates).toContain(19)
    })

    it('handles multi-day range exclusion for unlimited rule', () => {
      const result = callHook(computeUpcomingDates, {
        ...baseFields,
        recurrenceType: 'DAILY',
        exclusions: [{ startDate: '2025-03-17', endDate: '2025-03-19' }],
      }) as string[]

      // Should return 10 dates, but none on Mar 17-19
      expect(result).toHaveLength(10)
      const dates = result.map((d) => new Date(d).getUTCDate())
      expect(dates).not.toContain(17)
      expect(dates).not.toContain(18)
      expect(dates).not.toContain(19)
    })

    it('timezone-correct exclusions (Europe/Berlin)', () => {
      // 18:00 Berlin CET = 17:00 UTC, daily recurrence
      const result = callHook(computeUpcomingDates, {
        firstDate: '2025-03-15T17:00:00.000Z',
        firstDate_tz: 'Europe/Berlin',
        recurrenceType: 'DAILY',
        endingType: 'count',
        count: 5,
        exclusions: [{ startDate: '2025-03-17' }],
      }) as string[]

      expect(result).toHaveLength(4)
      // All should be at 17:00 UTC
      for (const dateStr of result) {
        expect(dateStr).toMatch(/T17:00:00\.000Z$/)
      }
      // Mar 17 should be excluded
      const days = result.map((d) => new Date(d).getUTCDate())
      expect(days).not.toContain(17)
    })

    it('non-recurring events ignore exclusions', () => {
      const result = callHook(computeUpcomingDates, {
        ...baseFields,
        exclusions: [{ startDate: '2025-03-15' }],
      }) as string[]

      // One-off event should still return the date
      expect(result).toHaveLength(1)
    })
  })

  // ──────────────────────────────────────────────────────────────────
  // cleanupExpiredExclusions — beforeChange hook
  // ──────────────────────────────────────────────────────────────────
  describe('cleanupExpiredExclusions', () => {
    // Helper to call beforeChange hook (uses `value` not `siblingData`)
    const callBeforeChangeHook = (hook: FieldHook, value: unknown): unknown => {
      return hook({ value, siblingData: {} } as Parameters<FieldHook>[0])
    }

    beforeEach(() => {
      vi.useFakeTimers()
      // Pin time to 2025-03-15T12:00:00Z
      vi.setSystemTime(new Date('2025-03-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps future exclusions', () => {
      const exclusions = [
        { startDate: '2025-04-01', endDate: '2025-04-03', reason: 'Spring break' },
        { startDate: '2025-05-01' },
      ]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions)
      expect(result).toHaveLength(2)
    })

    it('keeps items within 1-day grace period', () => {
      // March 14 end-of-day + 1 day grace = March 15 23:59:59.999
      // Current time is March 15 12:00 — within grace period
      const exclusions = [{ startDate: '2025-03-13', endDate: '2025-03-14' }]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions)
      expect(result).toHaveLength(1)
    })

    it('removes items past grace period (with endDate)', () => {
      // March 10 + 1 day grace = March 11 23:59:59.999
      // Current time is March 15 — well past grace
      const exclusions = [{ startDate: '2025-03-08', endDate: '2025-03-10', reason: 'Old break' }]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as unknown[]
      expect(result).toHaveLength(0)
    })

    it('removes single-date items past grace (no endDate)', () => {
      // March 10 + 1 day grace = expired before March 15
      const exclusions = [{ startDate: '2025-03-10' }]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as unknown[]
      expect(result).toHaveLength(0)
    })

    it('filters mixed expired and future items', () => {
      const exclusions = [
        { startDate: '2025-02-01', endDate: '2025-02-05', reason: 'Past break' }, // expired
        { startDate: '2025-03-14' }, // within grace
        { startDate: '2025-04-01', endDate: '2025-04-02' }, // future
        { startDate: '2025-01-01' }, // expired
      ]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as Array<{
        startDate: string
      }>
      expect(result).toHaveLength(2)
      expect(result[0].startDate).toBe('2025-03-14')
      expect(result[1].startDate).toBe('2025-04-01')
    })

    it('returns empty array when all items expired', () => {
      const exclusions = [
        { startDate: '2024-01-01' },
        { startDate: '2024-06-15', endDate: '2024-06-20' },
      ]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as unknown[]
      expect(result).toHaveLength(0)
    })

    it('returns unchanged when no items expired', () => {
      const exclusions = [
        { startDate: '2025-04-01' },
        { startDate: '2025-06-15', endDate: '2025-06-20' },
      ]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as unknown[]
      expect(result).toHaveLength(2)
    })

    it('handles ISO datetime format from dayOnly fields', () => {
      // PayloadCMS dayOnly picker stores full ISO datetime
      const exclusions = [
        { startDate: '2025-03-10T00:00:00.000Z' }, // expired
        { startDate: '2025-04-01T00:00:00.000Z' }, // future
      ]

      const result = callBeforeChangeHook(cleanupExpiredExclusions, exclusions) as Array<{
        startDate: string
      }>
      expect(result).toHaveLength(1)
      expect(result[0].startDate).toBe('2025-04-01T00:00:00.000Z')
    })

    it('returns null/empty input unchanged', () => {
      expect(callBeforeChangeHook(cleanupExpiredExclusions, null)).toBeNull()
      expect(callBeforeChangeHook(cleanupExpiredExclusions, undefined)).toBeUndefined()
      expect(callBeforeChangeHook(cleanupExpiredExclusions, [])).toEqual([])
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // lastOccurrenceEnd / computeLastDate — the stored `lastDate` column
  // ──────────────────────────────────────────────────────────────────────
  describe('lastOccurrenceEnd', () => {
    describe('returns null when there is no last occurrence to compute', () => {
      it('missing firstDate', () => {
        expect(lastOccurrenceEnd({})).toBeNull()
      })

      it('invalid firstDate', () => {
        expect(lastOccurrenceEnd({ firstDate: 'not-a-date' })).toBeNull()
      })

      it('open-ended recurrence (endingType never)', () => {
        expect(
          lastOccurrenceEnd({ ...baseFields, recurrenceType: 'DAILY', interval: 1 }),
        ).toBeNull()
      })

      it('endingType count with a zero count (buildRRuleTemporal ignores it)', () => {
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'WEEKLY',
            endingType: 'count',
            count: 0,
          }),
        ).toBeNull()
      })

      it('endingType until with no untilDate', () => {
        expect(
          lastOccurrenceEnd({ ...baseFields, recurrenceType: 'DAILY', endingType: 'until' }),
        ).toBeNull()
      })

      // The MAX_MONTHS_AHEAD false positive `upcomingDates` suffers from: it
      // only looks 6 months out, so a yearly-cadence event reads as having no
      // upcoming dates. A stored lastDate of null says "never ends" instead.
      it('monthly every 12 months, open-ended', () => {
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'MONTHLY',
            interval: 12,
            monthlyMode: 'date',
            monthDay: 15,
          }),
        ).toBeNull()
      })
    })

    describe('one-off events', () => {
      it('uses the end of the event day in UTC', () => {
        expect(lastOccurrenceEnd(baseFields)).toBe('2025-03-15T23:59:59.999Z')
      })

      it('uses the end of the *local* day for a non-UTC timezone', () => {
        // 14:00Z on Mar 15 is 10:00 EDT; local end-of-day is 23:59:59.999 -04:00
        expect(lastOccurrenceEnd({ ...baseFields, firstDate_tz: 'America/New_York' })).toBe(
          '2025-03-16T03:59:59.999Z',
        )
      })

      it('is computed the same way for a past event as a future one', () => {
        expect(
          lastOccurrenceEnd({ firstDate: '2020-01-06T09:00:00.000Z', firstDate_tz: 'UTC' }),
        ).toBe('2020-01-06T23:59:59.999Z')
      })
    })

    describe('terminating recurrences', () => {
      it('endingType count — end of the final occurrence day', () => {
        // Mar 15, 16, 17 → last is Mar 17
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'DAILY',
            interval: 1,
            endingType: 'count',
            count: 3,
          }),
        ).toBe('2025-03-17T23:59:59.999Z')
      })

      it('endingType until — end of the final occurrence day, not the until date', () => {
        // Weekly on Saturdays from Mar 15, until Apr 10 → last occurrence Apr 5
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'WEEKLY',
            interval: 1,
            weekdays: ['SA'],
            endingType: 'until',
            untilDate: '2025-04-10',
          }),
        ).toBe('2025-04-05T23:59:59.999Z')
      })

      it('an excluded trailing occurrence pulls lastDate earlier', () => {
        // Mar 15, 16, 17 with Mar 17 excluded → last is Mar 16
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'DAILY',
            interval: 1,
            endingType: 'count',
            count: 3,
            exclusions: [{ startDate: '2025-03-17' }],
          }),
        ).toBe('2025-03-16T23:59:59.999Z')
      })

      // An `until` before `firstDate` produces no occurrences at all. The
      // schedule is still over, so it must not read as never-ending (null) —
      // that would pin a broken config to the public feeds forever.
      it('falls back to the start day when the rule yields no occurrences', () => {
        expect(
          lastOccurrenceEnd({
            ...baseFields,
            recurrenceType: 'DAILY',
            interval: 1,
            endingType: 'until',
            untilDate: '2024-01-01',
          }),
        ).toBe('2025-03-15T23:59:59.999Z')
      })
    })

    describe('DST boundaries', () => {
      // Europe/Berlin springs forward (CET → CEST) at 02:00 on 2025-03-30, so
      // end-of-day is UTC+2 that day and UTC+1 the day before.
      it('end of the local day after the spring-forward transition', () => {
        expect(
          lastOccurrenceEnd({
            firstDate: '2025-03-30T10:00:00.000Z',
            firstDate_tz: 'Europe/Berlin',
          }),
        ).toBe('2025-03-30T21:59:59.999Z')
      })

      it('end of the local day before the spring-forward transition', () => {
        expect(
          lastOccurrenceEnd({
            firstDate: '2025-03-29T10:00:00.000Z',
            firstDate_tz: 'Europe/Berlin',
          }),
        ).toBe('2025-03-29T22:59:59.999Z')
      })

      it('a recurrence spanning the transition ends on its final local day', () => {
        // Daily from Mar 28, 5 occurrences → last is Apr 1 (CEST, UTC+2)
        expect(
          lastOccurrenceEnd({
            firstDate: '2025-03-28T10:00:00.000Z',
            firstDate_tz: 'Europe/Berlin',
            recurrenceType: 'DAILY',
            interval: 1,
            endingType: 'count',
            count: 5,
          }),
        ).toBe('2025-04-01T21:59:59.999Z')
      })
    })
  })

  describe('computeLastDate', () => {
    // The hook reads both the incoming patch and the previous doc — a field
    // beforeChange hook only receives the patch, and Payload materialises `{}`
    // for a group the patch omits.
    const callLastDateHook = (
      previousSiblingDoc: Record<string, unknown>,
      siblingData: Record<string, unknown>,
    ): unknown =>
      computeLastDate({ previousSiblingDoc, siblingData } as unknown as Parameters<FieldHook>[0])

    const COURSE = {
      ...baseFields,
      recurrenceType: 'DAILY' as const,
      interval: 1,
      endingType: 'count' as const,
      count: 3,
    }

    it('computes from the patch alone on create (no previous doc)', () => {
      expect(callLastDateHook({}, COURSE)).toBe('2025-03-17T23:59:59.999Z')
    })

    it('is a no-op for an unrelated partial update (empty group patch)', () => {
      // e.g. the ExpireEvents job patching only `notificationLog`
      expect(callLastDateHook({ ...COURSE, lastDate: '2025-03-17T23:59:59.999Z' }, {})).toBe(
        '2025-03-17T23:59:59.999Z',
      )
    })

    it('back-fills a null lastDate on any unrelated write', () => {
      expect(callLastDateHook({ ...COURSE, lastDate: null }, {})).toBe('2025-03-17T23:59:59.999Z')
    })

    it('recomputes from a partial schedule patch merged over the previous doc', () => {
      expect(callLastDateHook(COURSE, { count: 5 })).toBe('2025-03-19T23:59:59.999Z')
    })

    it('lets an explicit null in the patch win over the previous value', () => {
      // Clearing recurrenceType turns the course back into a one-off
      expect(callLastDateHook(COURSE, { recurrenceType: null })).toBe('2025-03-15T23:59:59.999Z')
    })

    it('returns null when the patch makes the recurrence open-ended', () => {
      expect(callLastDateHook(COURSE, { endingType: null })).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // scheduleFields factory — structural assertions
  // ──────────────────────────────────────────────────────────────────────
  describe('scheduleFields factory', () => {
    it('registers ScheduleSummary beforeInput component on the group field', () => {
      const field = scheduleFields() as NamedGroupField
      expect(field.type).toBe('group')
      expect(field.admin?.components?.beforeInput).toEqual(['@/components/admin/ScheduleSummary'])
    })

    it('registers beforeInput with custom group name', () => {
      const field = scheduleFields({ name: 'eventSchedule' }) as NamedGroupField
      expect(field.name).toBe('eventSchedule')
      expect(field.admin?.components?.beforeInput).toEqual(['@/components/admin/ScheduleSummary'])
    })

    it('exposes lastDate as a stored, indexed, hidden column driven by computeLastDate', () => {
      const group = scheduleFields() as NamedGroupField
      const lastDate = group.fields.find(
        (field) => 'name' in field && field.name === 'lastDate',
      ) as (NamedGroupField['fields'][number] & { virtual?: boolean }) | undefined

      expect(lastDate).toBeDefined()
      expect(lastDate).toMatchObject({ type: 'date', index: true, admin: { hidden: true } })
      // Stored, not virtual — the whole point is that it can appear in a `where`
      expect(lastDate?.virtual).toBeUndefined()
      expect(lastDate && 'hooks' in lastDate && lastDate.hooks?.beforeChange).toEqual([
        computeLastDate,
      ])
    })
  })
})
