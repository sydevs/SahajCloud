import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import { mapCsvSchedule, type MapScheduleArgs } from '@/collections/EventImports/csv/schedule'

/** A Thursday, five days before the Tuesday the defaults below use. */
const TODAY = Temporal.PlainDate.from('2026-10-01')

function map(columns: Partial<MapScheduleArgs>) {
  return mapCsvSchedule({
    timezone: 'Europe/Berlin',
    today: TODAY,
    scheduleType: 'weekly',
    startTime: '18:30',
    date: '2026-10-06',
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
    const result = map({ scheduleType: 'inactive', startTime: '', date: '' })
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
  it('takes the first occurrence from the date column', () => {
    const result = schedule(map({ date: '2026-10-06', weekdays: 'TU' }))
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
    expect(result.weekdays).toEqual(['TU'])
    expect(result.recurrenceType).toBe('WEEKLY')
  })

  it('derives the weekday from the date when the column is blank', () => {
    const result = schedule(map({ date: '2026-10-06', weekdays: '' }))
    expect(result.weekdays).toEqual(['TU'])
  })

  it('keeps every weekday a class meets on, beside the date', () => {
    const result = schedule(map({ date: '2026-10-06', weekdays: 'TU,TH' }))
    expect(result.weekdays).toEqual(['TU', 'TH'])
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
  })

  it('refuses a row with no date, rather than picking the next matching day', () => {
    // Deriving it made the same CSV build a different first occurrence on each
    // day it was uploaded, which no reviewer could see on the row.
    expect(errors(map({ date: '', weekdays: 'TU' }))).toContain(
      'date is required for a weekly class — its first occurrence',
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

  it('refuses a row with no date, which is the only shape it has', () => {
    expect(errors(map({ scheduleType: 'monthly', date: '' }))).toContain(
      'date is required for a monthly class — its first occurrence',
    )
  })

  it('never reaches the ordinal-weekday shape, whatever the weekdays say', () => {
    // There is no column for "the 2nd Tuesday", so `weekdays` on a monthly row
    // is a volunteer expecting one. Reported, not dropped.
    const result = errors(map({ scheduleType: 'monthly', date: '2026-10-13', weekdays: 'TU' }))
    expect(result).toContain('weekdays does not apply to a monthly class (got weekdays "TU")')
  })
})

describe('mapCsvSchedule — one-off', () => {
  it('writes no recurrence', () => {
    const result = schedule(map({ scheduleType: 'one-off', date: '2026-10-06' }))
    expect(result.recurrenceType).toBeUndefined()
    expect(result.firstDate).toBe('2026-10-06T16:30:00.000Z')
  })

  it('requires a date', () => {
    expect(errors(map({ scheduleType: 'one-off', date: '' }))).toContain(
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

  it.each(['1e1', '0x10', '+2', '2.0'])('refuses interval %s, which Number would read', (raw) => {
    expect(errors(map({ weekdays: 'TU', interval: raw }))).toContain(
      `interval must be a whole number from 1 to 99 (got "${raw}")`,
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

  it('refuses an untilDate before an explicit first date', () => {
    expect(errors(map({ weekdays: 'TU', date: '2026-10-06', untilDate: '2026-10-01' }))).toContain(
      'untilDate must be on or after the first date (2026-10-06)',
    )
  })

  it('names an unparseable date', () => {
    expect(errors(map({ weekdays: 'TU', date: '06/10/2026' }))).toContain(
      'date must be YYYY-MM-DD (got "06/10/2026")',
    )
  })
})

describe('mapCsvSchedule — the first date must be a day the class runs', () => {
  it('refuses a weekly date whose weekday is not in weekdays', () => {
    // 2026-10-06 is a Tuesday. Stored as firstDate beside BYDAY=MO, the first
    // occurrence would be a day the class never runs.
    expect(errors(map({ date: '2026-10-06', weekdays: 'MO' }))).toContain(
      'date 2026-10-06 is a TU, which is not in weekdays (MO)',
    )
  })

  it('accepts a weekly date that is one of several weekdays', () => {
    expect(schedule(map({ date: '2026-10-06', weekdays: 'MO,TU' })).firstDate).toBe(
      '2026-10-06T16:30:00.000Z',
    )
  })

})

describe('mapCsvSchedule — columns that do not apply', () => {
  it('refuses recurrence columns on a one-off row', () => {
    const result = errors(
      map({ scheduleType: 'one-off', date: '2026-10-06', weekdays: 'TU', interval: '2' }),
    )
    expect(result).toContain(
      'weekdays and interval do not apply to a one-off class (got weekdays "TU", interval "2")',
    )
  })

  it('leaves weekly alone, which reads every schedule column', () => {
    expect(map({ weekdays: 'TU', interval: '2', untilDate: '2026-12-31' }).ok).toBe(true)
  })

  it('refuses schedule columns on an inactive row rather than publishing it dormant', () => {
    // `map` fills startTime, so this is the "weekly class marked wrong" case.
    expect(errors(map({ scheduleType: 'inactive', weekdays: 'TU', date: '' }))).toEqual([
      'startTime and weekdays do not apply to an inactive class (got startTime "18:30", weekdays "TU")',
    ])
  })
})

describe('mapCsvSchedule — dates against the anchor', () => {
  it('refuses a one-off date before the anchor', () => {
    expect(errors(map({ scheduleType: 'one-off', date: '2026-09-30' }))).toEqual([
      'date 2026-09-30 has already passed (today is 2026-10-01)',
    ])
  })

  it('accepts a one-off on the anchor day itself', () => {
    expect(schedule(map({ scheduleType: 'one-off', date: '2026-10-01' })).firstDate).toBe(
      '2026-10-01T16:30:00.000Z',
    )
  })

  it('refuses an untilDate before the anchor, once, even where it also precedes the first date', () => {
    // A weekly row with an explicit first date in the past is a class that has
    // run for years — legitimate — but an ending in the past is not.
    expect(errors(map({ weekdays: 'TU', date: '2025-01-07', untilDate: '2026-09-30' }))).toEqual([
      'untilDate 2026-09-30 has already passed (today is 2026-10-01 in Europe/Berlin) — a class that has ended needs no import',
    ])
    expect(errors(map({ weekdays: 'TU', untilDate: '2026-09-01' }))).toHaveLength(1)
  })
})

describe('mapCsvSchedule — monthly day of month', () => {
  it.each(['2026-10-29', '2026-10-30', '2026-10-31'])(
    'refuses %s, a day some months lack, and names the last day it accepts',
    (date) => {
      const [message] = errors(map({ scheduleType: 'monthly', date }))
      expect(message).toContain(`(got date "${date}")`)
      expect(message).toContain('day 28')
    },
  )

  it('accepts the 28th, which every month has', () => {
    expect(schedule(map({ scheduleType: 'monthly', date: '2026-10-28' })).monthDay).toBe(28)
  })
})

describe('mapCsvSchedule — a wall time the clocks skip', () => {
  it('refuses a start time inside the spring-forward gap', () => {
    // Berlin jumps 02:00 → 03:00 on 2027-03-28, so 02:30 never happens.
    // Temporal would silently shift it to 03:30, which then reads back as an
    // hour later than the volunteer typed — and an endTime of 03:00 becomes
    // "before" the start, which scheduleFields refuses at write.
    const result = errors(
      map({ scheduleType: 'one-off', date: '2027-03-28', startTime: '02:30' }),
    )
    expect(result).toEqual([
      '02:30 does not exist on 2027-03-28 in Europe/Berlin — the clocks move forward. Pick another time or date.',
    ])
  })

  it('accepts the hour after the gap', () => {
    const result = schedule(map({ scheduleType: 'one-off', date: '2027-03-28', startTime: '03:30' }))
    expect(result.firstDate).toBe('2027-03-28T01:30:00.000Z')
  })

  it('accepts a fall-back ambiguous time, taking the first of the two', () => {
    // Berlin repeats 02:00-03:00 on 2027-10-31. Ambiguity is not a gap: the
    // time does exist, so the row is fine and Temporal picks the earlier.
    const result = schedule(map({ scheduleType: 'one-off', date: '2027-10-31', startTime: '02:30' }))
    expect(result.firstDate).toBe('2027-10-31T00:30:00.000Z')
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
