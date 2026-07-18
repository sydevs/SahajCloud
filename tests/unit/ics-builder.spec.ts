/**
 * Unit tests for the event ICS builder.
 *
 * Acceptance criterion: the calendar imports correctly into Google Calendar and
 * Apple Calendar for one-off, weekly, fortnightly, monthly, and a bounded
 * course with exclusions — with correct TZID, recurrence, and COUNT/UNTIL.
 *
 * Importing into the real clients is a manual check, so these tests pin the
 * wire format the clients parse: the presence of a VTIMEZONE, TZID-qualified
 * DTSTART/EXDATE, and the exact RRULE.
 */
import { describe, expect, it } from 'vitest'

import { buildEventCalendar } from '@/lib/schedule/icsBuilder'
import type { ScheduleSubFields } from '@/types/schedule'


// 19:00 in Europe/London on Tue 21 Jul 2026 (BST, UTC+1) == 18:00 UTC.
const FIRST_DATE = '2026-07-21T18:00:00.000Z'
const TZ = 'Europe/London'

function build(schedule: Partial<ScheduleSubFields>, overrides = {}) {
  return buildEventCalendar({
    title: 'Meditation Class',
    schedule: {
      firstDate: FIRST_DATE,
      firstDate_tz: TZ,
      ...schedule,
    } as Partial<ScheduleSubFields>,
    ...overrides,
  })
}

/**
 * The VEVENT block only.
 *
 * Scoping matters: VTIMEZONE carries its own `DTSTART` and `RRULE` lines for
 * the DST transition rules, so an unscoped search silently matches those.
 */
function vevent(ics: string): string {
  return ics.slice(ics.indexOf('BEGIN:VEVENT'), ics.indexOf('END:VEVENT'))
}

/** Pull a single property line out of the VEVENT (ICS folds on CRLF). */
function line(ics: string, prop: string): string | undefined {
  return vevent(ics)
    .split('\r\n')
    .find((l) => l.startsWith(prop))
}

describe('buildEventCalendar — envelope', () => {
  it('wraps the event in a VCALENDAR with a VTIMEZONE for the event timezone', () => {
    const ics = build({ recurrenceType: 'WEEKLY', weekdays: ['TU'] })!

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    // Apple can float the time without a real VTIMEZONE component.
    expect(ics).toContain('BEGIN:VTIMEZONE')
    expect(ics).toContain('TZID:Europe/London')
    expect(ics).toMatch(/BEGIN:DAYLIGHT/)
  })

  it('anchors DTSTART to the local wall-clock time via TZID, not UTC', () => {
    const ics = build({})!

    // 19:00 local — not 18:00Z. A UTC anchor drifts an hour across a DST change.
    expect(line(ics, 'DTSTART')).toBe('DTSTART;TZID=Europe/London:20260721T190000')
  })

  it('returns null when the schedule has no firstDate', () => {
    expect(buildEventCalendar({ title: 'x', schedule: {} })).toBeNull()
  })

  it('carries summary, location, description, and url', () => {
    const ics = build(
      { recurrenceType: 'WEEKLY', weekdays: ['TU'] },
      {
        location: '12 Example St, London',
        description: 'A weekly class',
        url: 'https://atlas.example/e/1',
      },
    )!

    expect(line(ics, 'SUMMARY')).toContain('Meditation Class')
    expect(line(ics, 'LOCATION')).toContain('12 Example St')
    expect(line(ics, 'DESCRIPTION')).toContain('A weekly class')
    expect(line(ics, 'URL')).toContain('https://atlas.example/e/1')
  })

  it('reuses a supplied uid so re-sends update rather than duplicate the entry', () => {
    const ics = build({}, { uid: 'registration-abc' })!
    expect(line(ics, 'UID')).toContain('registration-abc')
  })
})

describe('buildEventCalendar — end time', () => {
  it('derives DTEND from the same-day endTime', () => {
    const ics = build({ endTime: '20:30' })!
    expect(line(ics, 'DTEND')).toBe('DTEND;TZID=Europe/London:20260721T203000')
  })

  it('falls back to a one-hour duration when endTime is absent', () => {
    const ics = build({})!
    expect(line(ics, 'DTEND')).toBe('DTEND;TZID=Europe/London:20260721T200000')
  })

  it('falls back when endTime is at or before the start rather than emitting a negative span', () => {
    const ics = build({ endTime: '18:00' })!
    expect(line(ics, 'DTEND')).toBe('DTEND;TZID=Europe/London:20260721T200000')
  })
})

describe('buildEventCalendar — recurrence shapes', () => {
  it('one-off: emits a plain VEVENT with no RRULE', () => {
    const ics = build({})!

    // Internally a one-off is FREQ=DAILY;COUNT=1; that must not leak out as a
    // series, or a single class shows as a repeating event.
    expect(vevent(ics)).not.toContain('RRULE:')
  })

  it('weekly', () => {
    const ics = build({ recurrenceType: 'WEEKLY', weekdays: ['TU'] })!
    expect(line(ics, 'RRULE')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU')
  })

  it('fortnightly (interval 2)', () => {
    const ics = build({ recurrenceType: 'WEEKLY', weekdays: ['TU'], interval: 2 })!
    expect(line(ics, 'RRULE')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')
  })

  it('monthly by date', () => {
    const ics = build({ recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: 21 })!
    expect(line(ics, 'RRULE')).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=21')
  })

  it('monthly by nth weekday: splits the BYDAY prefix into BYSETPOS', () => {
    const ics = build({
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekNumber: '3',
      weekdayOfMonth: 'TU',
    })!

    // rrule-temporal yields byDay ['3TU']; ical-generator rejects the prefix,
    // so it must be split — otherwise the whole build throws.
    const rrule = line(ics, 'RRULE')!
    expect(rrule).toContain('FREQ=MONTHLY')
    expect(rrule).toContain('BYDAY=TU')
    expect(rrule).toContain('BYSETPOS=3')
  })

  it('bounded course: carries COUNT', () => {
    const ics = build({
      recurrenceType: 'WEEKLY',
      weekdays: ['TU'],
      endingType: 'count',
      count: 8,
    })!
    expect(line(ics, 'RRULE')).toBe('RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=TU')
  })

  it('bounded course: carries UNTIL', () => {
    const ics = build({
      recurrenceType: 'WEEKLY',
      weekdays: ['TU'],
      endingType: 'until',
      untilDate: '2026-09-30',
    })!

    const rrule = line(ics, 'RRULE')!
    expect(rrule).toContain('FREQ=WEEKLY')
    expect(rrule).toContain('UNTIL=20260930')
  })
})

describe('buildEventCalendar — exclusions', () => {
  const bounded = {
    recurrenceType: 'WEEKLY' as const,
    weekdays: ['TU'],
    endingType: 'count' as const,
    count: 8,
  }

  it('emits EXDATE qualified with TZID and the local wall-clock time', () => {
    const ics = build({
      ...bounded,
      exclusions: [{ startDate: '2026-08-11', endDate: '2026-08-11' }],
    })!

    // The load-bearing assertion: TZID-qualified local time, NOT the
    // `EXDATE:20260811T180000Z` that RRuleTemporal.toString() would emit.
    // A UTC EXDATE often fails to match a TZID-local instance, so the
    // cancelled session would still appear in the client.
    expect(line(ics, 'EXDATE')).toBe('EXDATE;TZID=Europe/London:20260811T190000')
    expect(ics).not.toContain('EXDATE:20260811T180000Z')
  })

  it('expands a multi-day exclusion range into every affected occurrence', () => {
    const ics = build({
      ...bounded,
      exclusions: [{ startDate: '2026-08-11', endDate: '2026-08-19' }],
    })!

    const exdate = line(ics, 'EXDATE')!
    expect(exdate).toContain('20260811T190000')
    expect(exdate).toContain('20260818T190000')
  })

  it('keeps the RRULE bound intact alongside exclusions', () => {
    const ics = build({
      ...bounded,
      exclusions: [{ startDate: '2026-08-11' }],
    })!

    expect(line(ics, 'RRULE')).toBe('RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=TU')
    expect(line(ics, 'EXDATE')).toContain('TZID=Europe/London')
  })
})

describe('buildEventCalendar — DST correctness', () => {
  it('holds the local hour across a DST boundary', () => {
    // Europe/London leaves BST on 25 Oct 2026. A weekly 19:00 class must stay
    // at 19:00 local afterwards — the failure this whole design guards against.
    const ics = build({ recurrenceType: 'WEEKLY', weekdays: ['TU'] })!

    expect(line(ics, 'DTSTART')).toBe('DTSTART;TZID=Europe/London:20260721T190000')
    // The rule is anchored in local time + a VTIMEZONE with the transition
    // rules, so the client — not us — resolves post-transition instances.
    expect(ics).toContain('BEGIN:STANDARD')
    expect(ics).toContain('BEGIN:DAYLIGHT')
  })

  it('handles a timezone with no DST (Asia/Kolkata)', () => {
    const ics = buildEventCalendar({
      title: 'IST Class',
      schedule: {
        firstDate: '2026-07-21T13:30:00.000Z', // 19:00 IST
        firstDate_tz: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        weekdays: ['TU'],
      } as Partial<ScheduleSubFields>,
    })!

    expect(line(ics, 'DTSTART')).toBe('DTSTART;TZID=Asia/Kolkata:20260721T190000')
    expect(ics).toContain('TZID:Asia/Kolkata')
  })
})
