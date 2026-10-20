import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import { mapCsvSchedule } from '@/plugins/eventImport/csv/schedule'

/** A Thursday, five days before the Tuesday the defaults below use. */
const TODAY = Temporal.PlainDate.from('2026-10-01')

const map = (columns: Record<string, string>) =>
  mapCsvSchedule(
    { recurrenceType: 'WEEKLY', startTime: '18:30', date: '2026-10-06', ...columns },
    'Europe/Berlin',
    TODAY,
  )

/** Narrow to the success arm so a failing spec reports the errors, not `undefined`. */
function schedule(result: ReturnType<typeof mapCsvSchedule>) {
  if (!result.ok) throw new Error(`expected a schedule, got errors: ${result.errors.join('; ')}`)
  return result.schedule
}

function errors(result: ReturnType<typeof mapCsvSchedule>): string[] {
  if (result.ok) throw new Error('expected errors, got a schedule')
  return result.errors
}

describe('mapCsvSchedule — the recurrence', () => {
  it('reads a blank recurrenceType as a one-off, with no recurrence', () => {
    const result = schedule(map({ recurrenceType: '' }))
    expect(result).toEqual({
      firstDate: '2026-10-06T16:30:00.000Z',
      firstDate_tz: 'Europe/Berlin',
      interval: 1,
    })
  })

  it('takes the Events values, in any case', () => {
    expect(schedule(map({ recurrenceType: 'weekly' })).recurrenceType).toBe('WEEKLY')
    expect(schedule(map({ recurrenceType: 'DAILY' })).recurrenceType).toBe('DAILY')
    expect(errors(map({ recurrenceType: 'fortnightly' }))).toEqual([
      'recurrenceType must be DAILY, WEEKLY, MONTHLY, or blank for a one-off class (got "fortnightly")',
    ])
  })
})

describe('mapCsvSchedule — weekly', () => {
  it('uses the weekday of the date when weekdays is blank', () => {
    expect(schedule(map({})).weekdays).toEqual(['TU'])
  })

  it('keeps every weekday a class meets on, once each', () => {
    expect(schedule(map({ weekdays: 'tu, TH,TU' })).weekdays).toEqual(['TU', 'TH'])
  })

  it('refuses a date on a day the class does not meet, and an unknown code', () => {
    expect(errors(map({ weekdays: 'MO' }))).toEqual([
      'date is a TU, which is not in weekdays (got "2026-10-06")',
    ])
    expect(errors(map({ weekdays: 'Funday' }))).toEqual([
      'weekdays must be codes from MO,TU,WE,TH,FR,SA,SU (got "Funday")',
    ])
  })
})

describe('mapCsvSchedule — monthly and daily', () => {
  it('recurs monthly on the date’s day of the month, up to the 28th', () => {
    expect(schedule(map({ recurrenceType: 'MONTHLY' }))).toMatchObject({
      monthlyMode: 'date',
      monthDay: 6,
    })
    expect(errors(map({ recurrenceType: 'MONTHLY', date: '2026-10-30' }))).toEqual([
      'date falls on day 30, which some months lack — pick day 28 or earlier (got "2026-10-30")',
    ])
  })

  it('refuses weekdays on a daily or monthly class', () => {
    expect(errors(map({ recurrenceType: 'DAILY', weekdays: 'MO' }))).toEqual([
      'weekdays does not apply to a daily class (got "MO")',
    ])
  })
})

describe('mapCsvSchedule — strict formats', () => {
  it('takes only YYYY-MM-DD dates and 24-hour HH:MM times', () => {
    expect(
      errors(
        map({ date: '6/10/2026', startTime: '9:30', endTime: '7pm', untilDate: '2026-02-30' }),
      ),
    ).toEqual([
      'date must be YYYY-MM-DD (got "6/10/2026")',
      'startTime must be HH:MM, 24-hour, e.g. 09:30 (got "9:30")',
      'endTime must be HH:MM, 24-hour, e.g. 09:30 (got "7pm")',
      'untilDate must be YYYY-MM-DD (got "2026-02-30")',
    ])
  })

  it('keeps an end time, an interval and an until date', () => {
    expect(
      schedule(map({ endTime: '20:00', interval: '2', untilDate: '2027-01-01' })),
    ).toMatchObject({
      endTime: '20:00',
      interval: 2,
      endingType: 'until',
      untilDate: '2027-01-01',
    })
  })
})

describe('mapCsvSchedule — dates against today', () => {
  it('refuses a one-off in the past, and repeat columns on a one-off', () => {
    expect(
      errors(map({ recurrenceType: '', date: '2026-09-30', untilDate: '2027-01-01' })),
    ).toEqual([
      'untilDate does not apply to a one-off class (got "2027-01-01")',
      'date has already passed (today is 2026-10-01) (got "2026-09-30")',
    ])
  })

  it('accepts a one-off today, and a weekly class that started in the past', () => {
    expect(map({ recurrenceType: '', date: '2026-10-01' }).ok).toBe(true)
    expect(map({ date: '2026-01-06' }).ok).toBe(true)
  })

  it('refuses an until date that has passed, or comes before the first date', () => {
    expect(errors(map({ untilDate: '2026-09-01' }))).toEqual([
      'untilDate has already passed (today is 2026-10-01) (got "2026-09-01")',
    ])
    expect(errors(map({ untilDate: '2026-10-05' }))).toEqual([
      'untilDate must be on or after date (got "2026-10-05")',
    ])
  })
})

describe('mapCsvSchedule — a wall time the clocks skip', () => {
  it('refuses a start time inside the spring-forward gap', () => {
    // Berlin jumps 02:00 → 03:00 on 2027-03-28, so 02:30 never happens.
    expect(errors(map({ recurrenceType: '', date: '2027-03-28', startTime: '02:30' }))).toEqual([
      'startTime 02:30 does not exist on 2027-03-28 in Europe/Berlin — the clocks move forward. Pick another time or date.',
    ])
  })

  it('accepts a fall-back ambiguous time, taking the first of the two', () => {
    const result = schedule(map({ recurrenceType: '', date: '2027-10-31', startTime: '02:30' }))
    expect(result.firstDate).toBe('2027-10-31T00:30:00.000Z')
  })
})
