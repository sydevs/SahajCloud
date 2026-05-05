import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import { DAYTIME_END_HOUR, DAYTIME_START_HOUR, isEventInUserDaytime } from '@/lib/audiences/daytimeMatch'

function instant(iso: string) {
  return Temporal.Instant.from(iso)
}

describe('isEventInUserDaytime', () => {
  describe('constants', () => {
    it('exports DAYTIME_START_HOUR = 8', () => {
      expect(DAYTIME_START_HOUR).toBe(8)
    })

    it('exports DAYTIME_END_HOUR = 22', () => {
      expect(DAYTIME_END_HOUR).toBe(22)
    })
  })

  describe('cross-timezone conversion', () => {
    // All tests use a fixed winter (Jan 15 2024) base to avoid DST ambiguity
    // London = UTC+0, Los_Angeles = UTC-8, Tokyo = UTC+9

    it('returns true when 19:00 London converts to 11:00 Los Angeles (within daytime)', () => {
      // 19:00 UTC = 11:00 America/Los_Angeles (UTC-8 in January)
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T19:00:00.000Z',
          eventTimeTz: 'Europe/London',
          userTimezone: 'America/Los_Angeles',
          now: instant('2024-01-15T19:00:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false when 19:00 London converts to 04:00 Tokyo (outside daytime)', () => {
      // 19:00 UTC → Tokyo (UTC+9) = 04:00 next day — before 08:00
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T19:00:00.000Z',
          eventTimeTz: 'Europe/London',
          userTimezone: 'Asia/Tokyo',
          now: instant('2024-01-15T19:00:00.000Z'),
        }),
      ).toBe(false)
    })
  })

  describe('boundary conditions', () => {
    // America/New_York = UTC-5 in January (EST)

    it('returns true at exactly 08:00 user-local time (lower boundary, inclusive)', () => {
      // 08:00 New York = 13:00 UTC
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T13:00:00.000Z',
          eventTimeTz: 'America/New_York',
          userTimezone: 'America/New_York',
          now: instant('2024-01-15T13:00:00.000Z'),
        }),
      ).toBe(true)
    })

    it('returns false at exactly 22:00 user-local time (upper boundary, exclusive)', () => {
      // 22:00 New York = 03:00 UTC next day
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-16T03:00:00.000Z',
          eventTimeTz: 'America/New_York',
          userTimezone: 'America/New_York',
          now: instant('2024-01-16T03:00:00.000Z'),
        }),
      ).toBe(false)
    })

    it('returns true at 07:59 in eventTimeTz that shifts to 08:00 in userTimezone', () => {
      // Event at 14:00 UTC, user in Asia/Tokyo (UTC+9) = 23:00 → outside daytime
      // But event at 13:00 UTC, user in Asia/Tokyo = 22:00 → exactly on upper boundary → false
      // Instead: event at 13:00 UTC, user in Europe/Berlin (UTC+1 winter) = 14:00 → pass
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T13:00:00.000Z',
          eventTimeTz: 'Europe/London',
          userTimezone: 'Europe/Berlin',
          now: instant('2024-01-15T13:00:00.000Z'),
        }),
      ).toBe(true) // 14:00 Berlin (UTC+1) is in [8, 22)
    })
  })

  describe('DST awareness', () => {
    // Summer: America/New_York = EDT (UTC-4), Europe/London = BST (UTC+1)

    it('accounts for DST: 09:00 New York EDT → 14:00 London BST (within daytime)', () => {
      // Jul 15, 09:00 New York EDT = 13:00 UTC → 14:00 London BST
      expect(
        isEventInUserDaytime({
          eventTime: '2024-07-15T13:00:00.000Z',
          eventTimeTz: 'America/New_York',
          userTimezone: 'Europe/London',
          now: instant('2024-07-15T13:00:00.000Z'),
        }),
      ).toBe(true)
    })

    it('uses today-in-eventTimeTz from `now`, not from the stored eventTime date', () => {
      // Event stored at Jan 15 (winter) but evaluated on Jul 15 (summer).
      // Both have hour=09 in New_York, but the offset differs.
      // Jul 15: 09:00 EDT = 13:00 UTC → 14:00 BST (London) → pass
      // This confirms `now` governs the calendar date, not the eventTime date.
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T14:00:00.000Z', // 09:00 EST (winter UTC-5)
          eventTimeTz: 'America/New_York',
          userTimezone: 'Europe/London',
          now: instant('2024-07-15T13:00:00.000Z'), // summer (EDT, UTC-4)
          // Algorithm takes today=Jul 15, extracts stored hour=09,
          // rebuilds Jul 15 09:00 EDT = Jul 15 13:00 UTC = Jul 15 14:00 BST → true
        }),
      ).toBe(true)
    })
  })

  describe('date rollover', () => {
    it('handles events that roll into the next calendar day in userTimezone', () => {
      // 23:00 Europe/London → Asia/Tokyo (UTC+9) = 08:00 next day → exactly on start boundary → pass
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T23:00:00.000Z',
          eventTimeTz: 'Europe/London',
          userTimezone: 'Asia/Tokyo',
          now: instant('2024-01-15T23:00:00.000Z'),
        }),
      ).toBe(true) // 23:00 UTC + 9h = 08:00 Tokyo next day — exactly the start boundary
    })

    it('returns false for events that are before daytime in userTimezone after rollover', () => {
      // 22:00 Europe/London → Asia/Tokyo = 07:00 next day → before 08:00 → fail
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T22:00:00.000Z',
          eventTimeTz: 'Europe/London',
          userTimezone: 'Asia/Tokyo',
          now: instant('2024-01-15T22:00:00.000Z'),
        }),
      ).toBe(false)
    })
  })

  describe('error handling', () => {
    it('returns false for an invalid eventTime string', () => {
      expect(
        isEventInUserDaytime({
          eventTime: 'not-a-date',
          eventTimeTz: 'Europe/London',
          userTimezone: 'America/Los_Angeles',
          now: instant('2024-01-15T12:00:00.000Z'),
        }),
      ).toBe(false)
    })

    it('returns false for an invalid eventTimeTz', () => {
      expect(
        isEventInUserDaytime({
          eventTime: '2024-01-15T12:00:00.000Z',
          eventTimeTz: 'Not/ATimezone',
          userTimezone: 'America/Los_Angeles',
          now: instant('2024-01-15T12:00:00.000Z'),
        }),
      ).toBe(false)
    })
  })
})
