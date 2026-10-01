import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import { mapCsvSchedule, type MapScheduleArgs } from '@/collections/EventImports/csv/schedule'

/**
 * A Thursday, so "the next TU" and "the next TH" land in different weeks and a
 * spec asserting either one cannot pass by accident.
 */
const TODAY = Temporal.PlainDate.from('2026-10-01')

function map(columns: Partial<MapScheduleArgs>) {
  return mapCsvSchedule({
    timezone: 'Europe/Berlin',
    today: TODAY,
    scheduleType: 'weekly',
    startTime: '18:30',
    ...columns,
  })
}

/** Narrow to the success arm so a failing spec reports the errors, not `undefined`. */
function schedule(result: ReturnType<typeof mapCsvSchedule>) {
  if (!result.ok) throw new Error(`expected a schedule, got errors: ${result.errors.join('; ')}`)
  if (result.inactive) throw new Error('expected an active schedule')
  return result.schedule
}

function errors(result: ReturnType<typeof mapCsvSchedule>): string[] {
  if (result.ok) throw new Error('expected errors, got a schedule')
  return result.errors
}

describe('mapCsvSchedule — scheduleType', () => {
  it('maps inactive to no schedule at all', () => {
    const result = map({ scheduleType: 'inactive', startTime: '' })
    expect(result).toEqual({ ok: true, inactive: true })
  })

  it('accepts the type case-insensitively and trimmed', () => {
    expect(map({ scheduleType: '  Weekly ', weekdays: 'TU' }).ok).toBe(true)
  })

  it('refuses an unknown type without reporting anything else', () => {
    const result = map({ scheduleType: 'fortnightly', startTime: 'nonsense' })
    expect(errors(result)).toEqual([
      'scheduleType must be one of one-off, weekly, monthly, inactive (got "fortnightly")',
    ])
  })
})

describe('mapCsvSchedule — the first instant', () => {
  it('reads the local wall time in the row timezone', () => {
    // 18:30 in Berlin on 2026-10-06 is CEST (UTC+2) → 16:30 UTC.
    const result = schedule(map({ date: '2026-10-06', weekdays: 'TU' }))
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
    expect(result.firstDate_tz).toBe('Europe/Berlin')
  })

  it('follows the zone across a DST boundary rather than a fixed offset', () => {
    // Berlin leaves CEST on 2026-10-25, so the same wall time is 17:30 UTC after.
    const result = schedule(map({ date: '2026-10-27', weekdays: 'TU' }))
    expect(result.firstDate).toBe('2026-10-27T17:30:00.000Z')
  })

  it('pads a single-digit hour', () => {
    const result = schedule(map({ date: '2026-10-06', startTime: '9:05', weekdays: 'TU' }))
    expect(result.firstDate).toBe('2026-10-06T07:05:00.000Z')
  })
})

describe('mapCsvSchedule — weekly', () => {
  it('takes the next matching day when no date is given', () => {
    // TODAY is Thursday 2026-10-01, so the next Tuesday is the 6th.
    const result = schedule(map({ weekdays: 'TU' }))
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
    expect(result.weekdays).toEqual(['TU'])
    expect(result.recurrenceType).toBe('WEEKLY')
  })

  it('counts today as matching', () => {
    const result = schedule(map({ weekdays: 'TH' }))
    expect(result.firstDate).toBe('2026-10-01T16:30:00.000Z')
  })

  it('picks the earliest of several weekdays', () => {
    const result = schedule(map({ weekdays: 'MO,SA' }))
    // Saturday the 3rd beats Monday the 5th.
    expect(result.firstDate).toBe('2026-10-03T16:30:00.000Z')
    expect(result.weekdays).toEqual(['MO', 'SA'])
  })

  it("derives the weekday from the date when the column is blank", () => {
    const result = schedule(map({ date: '2026-10-06', weekdays: '' }))
    expect(result.weekdays).toEqual(['TU'])
  })

  it('refuses a row with neither weekdays nor a date', () => {
    expect(errors(map({ weekdays: '' }))).toContain(
      'weekly needs weekdays, or a date to take the weekday from',
    )
  })

  it('normalises case and drops duplicates', () => {
    expect(schedule(map({ weekdays: 'tu, TU ,mo' })).weekdays).toEqual(['TU', 'MO'])
  })

  it('names an unparseable weekday', () => {
    expect(errors(map({ weekdays: 'TU,Funday' }))).toContain(
      'weekdays must be two-letter codes like MO,TH (got "Funday")',
    )
  })
})

describe('mapCsvSchedule — monthly', () => {
  it('maps a bare date to day-of-month', () => {
    const result = schedule(map({ scheduleType: 'monthly', date: '2026-10-14' }))
    expect(result).toMatchObject({ recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: 14 })
  })

  it('maps monthWeek plus one weekday to the ordinal shape', () => {
    const result = schedule(map({ scheduleType: 'monthly', monthWeek: '2', weekdays: 'TU' }))
    expect(result).toMatchObject({
      monthlyMode: 'weekday',
      weekNumber: '2',
      weekdayOfMonth: 'TU',
    })
    // The 2nd Tuesday of October 2026 is the 13th, still ahead of TODAY.
    expect(result.firstDate).toBe('2026-10-13T16:30:00.000Z')
  })

  it('rolls to next month when this month`s ordinal day has passed', () => {
    // The 1st Thursday of October 2026 is the 1st — today — so it still counts;
    // the 1st Tuesday was the 6th... use a day already gone instead.
    const result = schedule(
      mapCsvSchedule({
        timezone: 'Europe/Berlin',
        today: Temporal.PlainDate.from('2026-10-20'),
        scheduleType: 'monthly',
        startTime: '18:30',
        monthWeek: '1',
        weekdays: 'TU',
      }),
    )
    // November's 1st Tuesday is the 3rd; Berlin is on CET by then (UTC+1).
    expect(result.firstDate).toBe('2026-11-03T17:30:00.000Z')
  })

  it('resolves -1 to the last matching weekday of the month', () => {
    const result = schedule(map({ scheduleType: 'monthly', monthWeek: '-1', weekdays: 'TU' }))
    expect(result.weekNumber).toBe('-1')
    // The last Tuesday of October 2026 is the 27th, after the DST change.
    expect(result.firstDate).toBe('2026-10-27T17:30:00.000Z')
  })

  it('refuses weekdays without monthWeek, rather than guessing the shape', () => {
    expect(errors(map({ scheduleType: 'monthly', weekdays: 'TU', date: '2026-10-13' }))).toContain(
      'monthly with weekdays also needs monthWeek (1-4, or -1 for the last)',
    )
  })

  it('refuses monthWeek with more than one weekday', () => {
    expect(errors(map({ scheduleType: 'monthly', monthWeek: '2', weekdays: 'TU,TH' }))).toContain(
      'monthWeek needs exactly one weekday (got 2)',
    )
  })

  it('refuses monthWeek with no weekday', () => {
    expect(errors(map({ scheduleType: 'monthly', monthWeek: '2' }))).toContain(
      'monthWeek needs exactly one weekday',
    )
  })

  it('refuses an out-of-range monthWeek', () => {
    expect(errors(map({ scheduleType: 'monthly', monthWeek: '5', weekdays: 'TU' }))).toContain(
      'monthWeek must be 1, 2, 3, 4 or -1 (got "5")',
    )
  })

  it('refuses a row with neither a date nor monthWeek', () => {
    expect(errors(map({ scheduleType: 'monthly' }))).toContain(
      'monthly needs a date, or monthWeek plus one weekday',
    )
  })
})

describe('mapCsvSchedule — one-off', () => {
  it('writes no recurrence', () => {
    const result = schedule(map({ scheduleType: 'one-off', date: '2026-10-06' }))
    expect(result.recurrenceType).toBeUndefined()
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
  })

  it('requires a date, because there is no weekday to match on', () => {
    expect(errors(map({ scheduleType: 'one-off' }))).toContain(
      'date is required for a one-off class',
    )
  })
})

describe('mapCsvSchedule — times, interval and ending', () => {
  it('keeps a valid end time and pads it', () => {
    expect(schedule(map({ weekdays: 'TU', endTime: '9:00', startTime: '08:00' })).endTime).toBe(
      '09:00',
    )
  })

  it('refuses an end time at or before the start', () => {
    expect(errors(map({ weekdays: 'TU', endTime: '18:30' }))).toContain(
      'endTime must be after startTime',
    )
  })

  it('refuses a 24-hour overflow rather than wrapping it', () => {
    expect(errors(map({ weekdays: 'TU', startTime: '24:00' }))).toContain(
      'startTime must be HH:MM in 24-hour format (got "24:00")',
    )
  })

  it('requires a start time unless the row is inactive', () => {
    expect(errors(map({ weekdays: 'TU', startTime: '' }))).toContain(
      'startTime is required unless scheduleType is inactive',
    )
  })

  it('defaults the interval to 1 and accepts an explicit one', () => {
    expect(schedule(map({ weekdays: 'TU' })).interval).toBe(1)
    expect(schedule(map({ weekdays: 'TU', interval: '2' })).interval).toBe(2)
  })

  it('refuses a non-integer or out-of-range interval', () => {
    expect(errors(map({ weekdays: 'TU', interval: '0' }))).toContain(
      'interval must be a whole number from 1 to 99 (got "0")',
    )
    expect(errors(map({ weekdays: 'TU', interval: '1.5' }))).toContain(
      'interval must be a whole number from 1 to 99 (got "1.5")',
    )
  })

  it('maps untilDate to an until ending', () => {
    const result = schedule(map({ weekdays: 'TU', untilDate: '2026-12-31' }))
    expect(result).toMatchObject({ endingType: 'until', untilDate: '2026-12-31' })
  })

  it('leaves an open-ended recurrence with no ending', () => {
    const result = schedule(map({ weekdays: 'TU' }))
    expect(result.endingType).toBeUndefined()
    expect(result.untilDate).toBeUndefined()
  })

  it('refuses an untilDate before the first date', () => {
    expect(errors(map({ weekdays: 'TU', date: '2026-10-06', untilDate: '2026-10-01' }))).toContain(
      'untilDate must be on or after date',
    )
  })

  it('names an unparseable date', () => {
    expect(errors(map({ weekdays: 'TU', date: '06/10/2026' }))).toContain(
      'date must be YYYY-MM-DD (got "06/10/2026")',
    )
  })
})

describe('mapCsvSchedule — error accumulation', () => {
  it('reports every bad column in one pass', () => {
    const result = errors(
      map({ weekdays: 'Funday', startTime: 'half six', interval: 'two', date: 'tomorrow' }),
    )
    // A volunteer re-uploads once, not once per mistake. Asserted by content
    // rather than by count: an unusable `weekdays` and an unusable `date` also
    // leave weekly with no weekday to match on, so a fifth, derived error is
    // correct here and a count would pin the derivation instead of the rule.
    expect(result).toEqual(
      expect.arrayContaining([
        'weekdays must be two-letter codes like MO,TH (got "Funday")',
        'startTime must be HH:MM in 24-hour format (got "half six")',
        'interval must be a whole number from 1 to 99 (got "two")',
        'date must be YYYY-MM-DD (got "tomorrow")',
      ]),
    )
  })
})
