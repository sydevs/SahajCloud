import { describe, expect, it } from 'vitest'

import { isScheduleActiveNow } from '@/lib/audiences/scheduleMatch'
import type { ScheduleSubFields } from '@/types/schedule'

// Fixed base date for deterministic tests: 2024-01-16 (Tuesday)
// DAILY schedule starts 2024-01-15T09:00:00Z → occurrences at 09:00 UTC each day
const DAILY_SCHEDULE: Partial<ScheduleSubFields> = {
  firstDate: '2024-01-15T09:00:00.000Z',
  firstDate_tz: 'Europe/London', // UTC+0 in January — equivalent to UTC here
  recurrenceType: 'DAILY',
  interval: 1,
}

function dateAt(iso: string) {
  return new Date(iso)
}

describe('isScheduleActiveNow', () => {
  describe('null / empty input', () => {
    it('returns false for null schedule', () => {
      expect(isScheduleActiveNow({ schedule: null, now: dateAt('2024-01-16T09:30:00.000Z') })).toBe(
        false,
      )
    })

    it('returns false for undefined schedule', () => {
      expect(
        isScheduleActiveNow({ schedule: undefined, now: dateAt('2024-01-16T09:30:00.000Z') }),
      ).toBe(false)
    })

    it('returns false when schedule has no firstDate', () => {
      expect(
        isScheduleActiveNow({
          schedule: { recurrenceType: 'DAILY', interval: 1 },
          now: dateAt('2024-01-16T09:30:00.000Z'),
        }),
      ).toBe(false)
    })
  })

  describe('default 1-hour window (no endTime)', () => {
    it('returns true when now is 30 min into an occurrence window', () => {
      // Jan 16 09:00 occurrence + 30 min = 09:30 → within [09:00, 10:00)
      expect(
        isScheduleActiveNow({
          schedule: DAILY_SCHEDULE,
          now: dateAt('2024-01-16T09:30:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false when now is 30 min before an occurrence', () => {
      // 08:30 < 09:00 occurrence start
      expect(
        isScheduleActiveNow({
          schedule: DAILY_SCHEDULE,
          now: dateAt('2024-01-16T08:30:00.000Z'),
        }),
      ).toBe(false)
    })

    it('returns false when now is 90 min after an occurrence start (past 1-hour window)', () => {
      // 10:30 > 09:00 + 1h = 10:00 → window closed
      expect(
        isScheduleActiveNow({
          schedule: DAILY_SCHEDULE,
          now: dateAt('2024-01-16T10:30:00.000Z'),
        }),
      ).toBe(false)
    })

    it('returns true at exactly the occurrence start (inclusive lower bound)', () => {
      expect(
        isScheduleActiveNow({
          schedule: DAILY_SCHEDULE,
          now: dateAt('2024-01-16T09:00:00.000Z'),
        }),
      ).toBe(true)
    })
  })

  describe('custom window via endTime', () => {
    const scheduleWith90MinWindow: Partial<ScheduleSubFields> = {
      ...DAILY_SCHEDULE,
      // endTime is stored as HH:MM text by scheduleField
      endTime: '10:30', // 10:30 → delta from 09:00 = 90 min
    }

    it('returns true when now is 60 min into a 90-min window', () => {
      // Jan 16 09:00 + 60 min = 10:00, which is < 10:30 → active
      expect(
        isScheduleActiveNow({
          schedule: scheduleWith90MinWindow,
          now: dateAt('2024-01-16T10:00:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false when now is 105 min after occurrence start (past 90-min window)', () => {
      // 09:00 + 105 min = 10:45 → window [09:00, 10:30) closed
      // searchStart = 10:45 - 90min = 09:15 → 09:00 occurrence is before 09:15 → not returned
      expect(
        isScheduleActiveNow({
          schedule: scheduleWith90MinWindow,
          now: dateAt('2024-01-16T10:45:00.000Z'),
        }),
      ).toBe(false)
    })
  })

  describe('overnight window (endTime before startTime)', () => {
    const overnightSchedule: Partial<ScheduleSubFields> = {
      firstDate: '2024-01-15T22:00:00.000Z', // 22:00 London
      firstDate_tz: 'Europe/London',
      recurrenceType: 'DAILY',
      interval: 1,
      endTime: '02:00', // 02:00 HH:MM → 4-hour overnight window
    }

    it('returns true when now is 1 hour into an overnight window', () => {
      // Jan 16 22:00 occurrence, window extends to Jan 17 02:00 → 4 hours
      // 23:00 = 1h in → active
      expect(
        isScheduleActiveNow({
          schedule: overnightSchedule,
          now: dateAt('2024-01-16T23:00:00.000Z'),
        }),
      ).toBe(true)
    })
  })

  describe('non-recurring (single occurrence)', () => {
    const singleSchedule: Partial<ScheduleSubFields> = {
      firstDate: '2024-01-16T09:00:00.000Z',
      firstDate_tz: 'Europe/London',
      // no recurrenceType → count=1
    }

    it('returns true when now is within the single occurrence window', () => {
      expect(
        isScheduleActiveNow({
          schedule: singleSchedule,
          now: dateAt('2024-01-16T09:30:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false when now is after the single occurrence window', () => {
      expect(
        isScheduleActiveNow({
          schedule: singleSchedule,
          now: dateAt('2024-01-16T10:30:00.000Z'),
        }),
      ).toBe(false)
    })

    it('returns false when now is before the single occurrence', () => {
      expect(
        isScheduleActiveNow({
          schedule: singleSchedule,
          now: dateAt('2024-01-16T08:30:00.000Z'),
        }),
      ).toBe(false)
    })
  })

  describe('weekly recurrence', () => {
    // WEEKLY on Tuesdays (Jan 16 2024 is a Tuesday)
    const weeklySchedule: Partial<ScheduleSubFields> = {
      firstDate: '2024-01-16T10:00:00.000Z', // Tuesday 10:00 London
      firstDate_tz: 'Europe/London',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['TU'],
    }

    it('returns true on the correct weekday within the window', () => {
      // Tuesday Jan 16 at 10:30 → within [10:00, 11:00)
      expect(
        isScheduleActiveNow({
          schedule: weeklySchedule,
          now: dateAt('2024-01-16T10:30:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false on a different weekday', () => {
      // Wednesday Jan 17 at 10:30 → no occurrence
      expect(
        isScheduleActiveNow({
          schedule: weeklySchedule,
          now: dateAt('2024-01-17T10:30:00.000Z'),
        }),
      ).toBe(false)
    })
  })
})
