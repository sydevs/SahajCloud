/**
 * Unit tests for the registrant confirmation email's content shaping.
 *
 * These are the *facts* the email states (schedule in words, where, host) —
 * none of it is translated. Chrome is covered by `email-strings.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import {
  buildRegistrationEmailDetails,
  descriptionText,
  mapsUrl,
  registrationScheduleLine,
  sessionCount,
} from '@/lib/notifications/registrationDetails'
import type { Event } from '@/payload-types'


// 19:00 in Europe/London on Tue 21 Jul 2026 (BST) == 18:00 UTC.
const FIRST_DATE = '2026-07-21T18:00:00.000Z'

type Schedule = NonNullable<Event['schedule']>

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    firstDate: FIRST_DATE,
    firstDate_tz: 'Europe/London',
    ...overrides,
  } as Schedule
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    title: 'Meditation Class',
    eventType: 'offline',
    schedule: schedule({ recurrenceType: 'WEEKLY', weekdays: ['TU'] }),
    ...overrides,
  } as Event
}

describe('registrationScheduleLine', () => {
  it('renders recurrence plus a time span in the event timezone', () => {
    const line = registrationScheduleLine(
      schedule({ recurrenceType: 'WEEKLY', weekdays: ['TU'], endTime: '20:30' }),
    )

    // 19:00 local, not the 18:00 UTC the column stores.
    expect(line).toContain('Every week on Tuesday')
    expect(line).toContain('7:00')
    expect(line).toContain('8:30 PM')
    expect(line).toContain('GMT+1')
  })

  it('renders only the start time when no endTime is set', () => {
    const line = registrationScheduleLine(schedule({ recurrenceType: 'WEEKLY', weekdays: ['TU'] }))

    expect(line).toContain('7:00 PM')
    expect(line).not.toContain('–')
  })

  it('renders a one-off as a full date rather than a recurrence phrase', () => {
    const line = registrationScheduleLine(schedule())

    expect(line).toContain('Tuesday, 21 July 2026')
    expect(line).not.toContain('Every')
  })

  it('uses the event timezone, not the machine timezone (IST case)', () => {
    const line = registrationScheduleLine(
      schedule({
        firstDate: '2026-07-21T13:30:00.000Z', // 19:00 IST
        firstDate_tz: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        weekdays: ['TU'],
      }),
    )

    expect(line).toContain('7:00 PM')
    expect(line).toContain('GMT+5:30')
  })

  it('ignores an endTime at or before the start rather than emitting a reversed span', () => {
    const line = registrationScheduleLine(
      schedule({ recurrenceType: 'WEEKLY', weekdays: ['TU'], endTime: '18:00' }),
    )

    expect(line).not.toContain('–')
    expect(line).toContain('7:00 PM')
  })

  it('returns an empty string when there is no firstDate', () => {
    expect(registrationScheduleLine(null)).toBe('')
    expect(registrationScheduleLine({} as Schedule)).toBe('')
  })

  it('uses no narrow no-break space (renders as a stray glyph in some clients)', () => {
    const line = registrationScheduleLine(schedule({ recurrenceType: 'DAILY', endTime: '20:30' }))
    expect(line).not.toMatch(/ /)
  })
})

describe('sessionCount', () => {
  it('returns the count for a bounded course', () => {
    expect(
      sessionCount(schedule({ recurrenceType: 'WEEKLY', endingType: 'count', count: 8 })),
    ).toBe(8)
  })

  it('returns null for an open-ended class', () => {
    expect(sessionCount(schedule({ recurrenceType: 'WEEKLY' }))).toBeNull()
  })

  it('returns null for an until-bounded run (total needs the recurrence expanded)', () => {
    expect(
      sessionCount(
        schedule({ recurrenceType: 'WEEKLY', endingType: 'until', untilDate: '2026-09-30' }),
      ),
    ).toBeNull()
  })

  it('returns null for a one-off', () => {
    expect(sessionCount(schedule())).toBeNull()
  })
})

describe('mapsUrl', () => {
  it('prefers geocoded coordinates', () => {
    const url = mapsUrl({ address: { latitude: 51.5074, longitude: -0.1278 } } as Event)
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=51.5074,-0.1278')
  })

  it('falls back to an encoded address query when not geocoded', () => {
    const url = mapsUrl({ address: { street: '12 Example St', city: 'London' } } as Event)
    expect(url).toContain('12%20Example%20St')
    expect(url).toContain('London')
  })

  it('returns null with neither coordinates nor address', () => {
    expect(mapsUrl({ address: {} } as Event)).toBeNull()
  })
})

describe('descriptionText', () => {
  it('extracts plain text from a Lexical editor state', () => {
    const description = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Bring a cushion.' }],
          },
        ],
      },
    }

    expect(descriptionText(description as never)).toBe('Bring a cushion.')
  })

  it('returns null for empty or missing content', () => {
    expect(descriptionText(null)).toBeNull()
    expect(descriptionText(undefined as never)).toBeNull()
  })

  it('returns null rather than throwing on malformed editor state', () => {
    expect(descriptionText({ nonsense: true } as never)).toBeNull()
  })
})

describe('buildRegistrationEmailDetails', () => {
  it('shapes an online event with the join URL', () => {
    const details = buildRegistrationEmailDetails(
      event({ eventType: 'online', onlineUrl: 'https://meet.example/abc' }),
    )

    expect(details.location).toEqual({ type: 'online', joinUrl: 'https://meet.example/abc' })
  })

  it('shapes an offline event with address and maps link', () => {
    const details = buildRegistrationEmailDetails(
      event({
        eventType: 'offline',
        address: { street: '12 Example St', city: 'London', latitude: 51.5, longitude: -0.12 },
      }),
    )

    expect(details.location.type).toBe('offline')
    if (details.location.type !== 'offline') throw new Error('expected offline')
    expect(details.location.address).toContain('12 Example St')
    expect(details.location.mapsUrl).toContain('51.5,-0.12')
  })

  it('marks an online event with no URL as unspecified rather than rendering an empty button', () => {
    const details = buildRegistrationEmailDetails(event({ eventType: 'online', onlineUrl: null }))
    expect(details.location).toEqual({ type: 'unspecified' })
  })

  it('marks an offline event with no address as unspecified', () => {
    const details = buildRegistrationEmailDetails(event({ eventType: 'offline', address: {} }))
    expect(details.location).toEqual({ type: 'unspecified' })
  })

  it('joins host name and phone, and falls back to null when absent', () => {
    expect(
      buildRegistrationEmailDetails(event({ contactName: 'Ana', contactPhone: '+44 123' })).contact,
    ).toBe('Ana · +44 123')
    expect(buildRegistrationEmailDetails(event()).contact).toBeNull()
  })

  it('falls back to an id-based title when the event has none', () => {
    expect(buildRegistrationEmailDetails(event({ id: 42, title: null })).eventTitle).toBe(
      'Event #42',
    )
  })
})
