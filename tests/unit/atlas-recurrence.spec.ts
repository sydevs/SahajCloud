import { describe, expect, it } from 'vitest'

import { normalizeDate, parseSchedule, weekdayOf } from '../../seeds/atlas/helpers/recurrence'
import { mapSchedule } from '../../seeds/atlas/helpers/scheduleMapper'

/**
 * Real `recurrence_data` blobs from the Atlas dump, one per dialect. The third
 * (string keys, no `on` key at all) is the one that needs the start-date
 * weekday fallback.
 */
const DIALECT_SYMBOL_KEYS =
  "---\n:type: :weekly_1\n:start_date: 2021-07-27\n:start_time: '19:00'\n:end_date: \n:end_time: '20:00'\n:on: :tuesday\n"
const DIALECT_QUOTED_ON =
  "---\ntype: monthly_1st\nstart_date: August 19, 2023\nstart_time: '10:00'\nend_date: ''\nend_time: '12:00'\n'on': :saturday\n"
const DIALECT_NO_ON =
  "---\ntype: weekly_1\nstart_date: September 6, 2024\nend_date: December 13, 2024\nstart_time: '17:30'\nend_time: '18:30'\n"
const DIALECT_NO_ON_MONTHLY =
  "---\ntype: monthly_1st\nstart_date: November 3, 2024\nend_date: ''\nstart_time: '09:00'\nend_time: '11:00'\n"
const DIALECT_DAILY =
  "---\n:type: :daily\n:start_date: 2023-08-06\n:start_time: '10:00'\n:end_date: \n:end_time: '13:00'\n:on: \n"
// The 2026 dump added monthly types beyond `monthly_1st` (events #318, #397).
const MONTHLY_2ND =
  "---\ntype: monthly_2nd\nstart_date: December 9, 2024\nstart_time: '19:30'\nend_date: ''\nend_time: '21:00'\n'on': :monday\n"
const MONTHLY_LAST_EMPTY_ON =
  "---\ntype: monthly_last\nstart_date: November 24, 2024\nstart_time: '09:30'\nend_date: ''\nend_time: '11:30'\n'on':\n"

describe('weekdayOf', () => {
  it('names the weekday of an ISO date', () => {
    expect(weekdayOf('2024-09-06')).toBe('friday')
    expect(weekdayOf('2024-11-03')).toBe('sunday')
    expect(weekdayOf('2021-07-27')).toBe('tuesday')
  })

  it('is timezone-independent (constructs the date in UTC)', () => {
    // A local-time construction would shift this to the previous day west of UTC.
    expect(weekdayOf('2024-01-01')).toBe('monday')
  })

  it('returns null for a missing or unparseable date', () => {
    expect(weekdayOf(null)).toBeNull()
    expect(weekdayOf('')).toBeNull()
    expect(weekdayOf('not-a-date')).toBeNull()
  })
})

describe('normalizeDate', () => {
  it('passes an ISO date through', () => {
    expect(normalizeDate('2021-07-27')).toBe('2021-07-27')
  })

  it('converts a human date to ISO without a timezone day-shift', () => {
    expect(normalizeDate('August 19, 2023')).toBe('2023-08-19')
    expect(normalizeDate('November 3, 2024')).toBe('2024-11-03')
  })

  it('returns null for blank, quoted-empty, and unparseable values', () => {
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate("''")).toBeNull()
    expect(normalizeDate('nonsense')).toBeNull()
  })
})

describe('parseSchedule', () => {
  it('returns null when there is no recurrence data (inactive events)', () => {
    expect(parseSchedule(null)).toBeNull()
    expect(parseSchedule({})).toBeNull()
    expect(parseSchedule('---\n')).toBeNull()
  })

  it('reads the `:symbol:` dialect with an explicit weekday', () => {
    expect(parseSchedule(DIALECT_SYMBOL_KEYS)).toEqual({
      frequency: 'weekly',
      interval: 1,
      weekNumber: null,
      weekday: 'tuesday',
      startDate: '2021-07-27',
      startTime: '19:00',
      endDate: null,
      endTime: '20:00',
    })
  })

  it('reads the string-key dialect with a quoted `on` key', () => {
    expect(parseSchedule(DIALECT_QUOTED_ON)).toMatchObject({
      frequency: 'monthly',
      weekNumber: 1,
      weekday: 'saturday',
      startDate: '2023-08-19',
    })
  })

  it('derives a weekly weekday from the start date when `on` is absent', () => {
    // 2024-09-06 is a Friday — and event #683's own description says
    // "perjantaisin" (Fridays), which is how this was confirmed.
    expect(parseSchedule(DIALECT_NO_ON)).toMatchObject({
      frequency: 'weekly',
      weekday: 'friday',
      startDate: '2024-09-06',
      endDate: '2024-12-13',
    })
  })

  it('derives a monthly weekday from the start date when `on` is absent', () => {
    // Without this, mapSchedule reads `monthly_1st` as "day 3 of the month"
    // rather than "first Sunday" — see the mapSchedule assertion below.
    expect(parseSchedule(DIALECT_NO_ON_MONTHLY)).toMatchObject({
      frequency: 'monthly',
      weekNumber: 1,
      weekday: 'sunday',
      startDate: '2024-11-03',
    })
  })

  it('leaves a daily schedule without a weekday', () => {
    expect(parseSchedule(DIALECT_DAILY)).toMatchObject({
      frequency: 'daily',
      weekday: null,
    })
  })

  it('reads a >1 weekly interval out of the type', () => {
    expect(parseSchedule('---\ntype: weekly_2\nstart_date: 2024-01-03\n')).toMatchObject({
      frequency: 'weekly',
      interval: 2,
    })
  })

  it('returns null for an unrecognised frequency', () => {
    expect(parseSchedule('---\ntype: yearly\nstart_date: 2024-01-03\n')).toBeNull()
  })

  it('maps `monthly_2nd` to weekNumber 2, not 1', () => {
    expect(parseSchedule(MONTHLY_2ND)).toMatchObject({
      frequency: 'monthly',
      weekNumber: 2,
      weekday: 'monday',
    })
  })

  it('maps `monthly_last` to weekNumber -1 and derives the weekday from an empty `on`', () => {
    // 2024-11-24 is a Sunday — the last Sunday of that November.
    expect(parseSchedule(MONTHLY_LAST_EMPTY_ON)).toMatchObject({
      frequency: 'monthly',
      weekNumber: -1,
      weekday: 'sunday',
      startDate: '2024-11-24',
    })
  })
})

describe('parseSchedule → mapSchedule (the reason the fallback matters)', () => {
  it('maps a derived monthly weekday to "first <weekday>", not a day-of-month', () => {
    const parsed = parseSchedule(DIALECT_NO_ON_MONTHLY)
    const mapped = mapSchedule(parsed, 'America/Sao_Paulo')
    expect(mapped).toMatchObject({
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekNumber: '1',
      weekdayOfMonth: 'SU',
    })
    expect(mapped?.monthDay).toBeUndefined()
  })

  it('without the weekday, the same blob would recur on day-of-month instead', () => {
    // Mutation check: this is the behaviour the fallback exists to prevent.
    const parsed = parseSchedule(DIALECT_NO_ON_MONTHLY)!
    const mapped = mapSchedule({ ...parsed, weekday: null }, 'America/Sao_Paulo')
    expect(mapped).toMatchObject({ monthlyMode: 'date', monthDay: 3 })
  })

  it('maps a derived weekly weekday to the RFC 5545 code', () => {
    const mapped = mapSchedule(parseSchedule(DIALECT_NO_ON), 'Europe/Helsinki')
    expect(mapped).toMatchObject({ recurrenceType: 'WEEKLY', weekdays: ['FR'] })
  })

  it("carries `monthly_last`'s -1 through to the schedule field ('-1' is a valid weekNumber)", () => {
    const mapped = mapSchedule(parseSchedule(MONTHLY_LAST_EMPTY_ON), 'Europe/Berlin')
    expect(mapped).toMatchObject({
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekNumber: '-1',
      weekdayOfMonth: 'SU',
    })
  })
})
