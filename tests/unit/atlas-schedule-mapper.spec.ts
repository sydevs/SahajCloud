import { describe, expect, it } from 'vitest'

import {
  type AtlasSchedule,
  mapSchedule,
  supportedTimezone,
} from '../../seeds/atlas/helpers/scheduleMapper'

const base: AtlasSchedule = {
  frequency: 'weekly',
  interval: 1,
  weekNumber: null,
  weekday: 'tuesday',
  startDate: '2021-07-27',
  startTime: '19:00',
  endDate: null,
  endTime: '20:00',
}

describe('mapSchedule', () => {
  it('returns null for an absent schedule (inactive events)', () => {
    expect(mapSchedule(null, 'UTC')).toBeNull()
    expect(mapSchedule(undefined, 'UTC')).toBeNull()
  })

  it('returns null when the schedule has no start date', () => {
    expect(mapSchedule({ ...base, startDate: null }, 'UTC')).toBeNull()
  })

  it('converts local start date+time in the event timezone to a UTC firstDate', () => {
    // 19:00 in Pacific/Auckland (UTC+12 in July, no DST) → 07:00 UTC same day.
    const result = mapSchedule(base, 'Pacific/Auckland')
    expect(result?.firstDate).toBe('2021-07-27T07:00:00.000Z')
    expect(result?.firstDate_tz).toBe('Pacific/Auckland')
  })

  it('treats a missing timezone as UTC and a missing start time as midnight', () => {
    const result = mapSchedule({ ...base, startTime: null }, null)
    expect(result?.firstDate).toBe('2021-07-27T00:00:00.000Z')
    expect(result?.firstDate_tz).toBe('UTC')
  })

  it('resolves an unsupported timezone consistently across firstDate and firstDate_tz', () => {
    // `+05:30` is a zone Temporal accepts and the `firstDate_tz` column does not.
    // Both halves must fall back together: computing the instant at +05:30 and
    // labelling the column `UTC` puts the whole recurrence 5.5 hours out, which
    // no later read can detect.
    const result = mapSchedule(base, '+05:30')
    expect(result?.firstDate_tz).toBe('UTC')
    expect(result?.firstDate).toBe('2021-07-27T19:00:00.000Z')
  })

  it('maps a weekly schedule to recurrenceType + weekdays', () => {
    const result = mapSchedule(base, 'UTC')
    expect(result?.recurrenceType).toBe('WEEKLY')
    expect(result?.interval).toBe(1)
    expect(result?.weekdays).toEqual(['TU'])
    expect(result?.endTime).toBe('20:00')
  })

  it('carries a >1 interval (weekly_2)', () => {
    const result = mapSchedule({ ...base, interval: 2 }, 'UTC')
    expect(result?.interval).toBe(2)
  })

  it('derives the weekday from the start date when weekly weekday is null', () => {
    // 2021-07-27 is a Tuesday; the required weekdays must still be set.
    const result = mapSchedule({ ...base, weekday: null, startDate: '2021-07-27' }, 'UTC')
    expect(result?.weekdays).toEqual(['TU'])
  })

  it('defaults a missing/zero interval to 1', () => {
    expect(mapSchedule({ ...base, interval: null }, 'UTC')?.interval).toBe(1)
    expect(mapSchedule({ ...base, interval: 0 }, 'UTC')?.interval).toBe(1)
  })

  it('maps a daily schedule with no weekday/monthly fields', () => {
    const result = mapSchedule({ ...base, frequency: 'daily', weekday: null }, 'UTC')
    expect(result?.recurrenceType).toBe('DAILY')
    expect(result?.weekdays).toBeUndefined()
    expect(result?.monthlyMode).toBeUndefined()
  })

  it('maps a monthly "nth weekday" schedule (1st Saturday)', () => {
    const result = mapSchedule(
      {
        ...base,
        frequency: 'monthly',
        weekNumber: 1,
        weekday: 'saturday',
        startDate: '2023-08-19',
      },
      'UTC',
    )
    expect(result?.recurrenceType).toBe('MONTHLY')
    expect(result?.monthlyMode).toBe('weekday')
    expect(result?.weekNumber).toBe('1')
    expect(result?.weekdayOfMonth).toBe('SA')
    expect(result?.monthDay).toBeUndefined()
  })

  it('maps a monthly "by date" schedule (no weekday) from the start day', () => {
    const result = mapSchedule(
      { ...base, frequency: 'monthly', weekNumber: null, weekday: null, startDate: '2023-08-19' },
      'UTC',
    )
    expect(result?.monthlyMode).toBe('date')
    expect(result?.monthDay).toBe(19)
    expect(result?.weekdayOfMonth).toBeUndefined()
  })

  it('turns a legacy endDate into an "until" ending', () => {
    const result = mapSchedule({ ...base, endDate: '2024-12-31' }, 'UTC')
    expect(result?.endingType).toBe('until')
    expect(result?.untilDate).toBe('2024-12-31')
  })

  it('omits the ending when there is no endDate', () => {
    const result = mapSchedule(base, 'UTC')
    expect(result?.endingType).toBeUndefined()
    expect(result?.untilDate).toBeUndefined()
  })
})

describe('supportedTimezone', () => {
  it('passes a zone the column accepts through unchanged', () => {
    // The importer detects a substitution by comparing its input against this
    // output, so an accepted zone returning anything but itself would make
    // every registration and event look substituted.
    expect(supportedTimezone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(supportedTimezone('  Europe/Prague  ')).toBe('Europe/Prague')
  })

  it('substitutes UTC for a zone the column would refuse', () => {
    expect(supportedTimezone('Mars/Olympus')).toBe('UTC')
    expect(supportedTimezone('+05:30')).toBe('UTC')
  })

  it('resolves an absent zone to UTC', () => {
    expect(supportedTimezone(null)).toBe('UTC')
    expect(supportedTimezone(undefined)).toBe('UTC')
    expect(supportedTimezone('   ')).toBe('UTC')
  })
})
