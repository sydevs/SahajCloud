/**
 * The one rule deciding what the calendar feed answers, which `Events.calendarFeedUrl`
 * reads too — the integration spec covers both sides against a real document, so this
 * covers only the schedules no stored row can be written with.
 */
import { describe, expect, it } from 'vitest'

import { calendarFeedAnswer } from '@/collections/Events/endpoints/calendarFeed'
import type { EventSchedule } from '@/types/schedule'

const weekly = {
  firstDate: '2026-07-21T18:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  weekdays: ['TU'],
} satisfies Partial<EventSchedule>

const now = new Date('2026-08-01T00:00:00.000Z')

describe('calendarFeedAnswer', () => {
  it('answers a published, running class with its live document', () => {
    expect(
      calendarFeedAnswer({ _status: 'published', schedule: weekly, updatedAt: null }, 'en', now),
    ).toBe('live')
  })

  /**
   * ⚠ `buildRRuleTemporal` throws rather than answering null on a schedule it cannot
   * parse, and this rule now runs on an ordinary document read — so a class with no
   * feed must read as having none, not as a 500.
   */
  it('answers none for a schedule that cannot be parsed into a recurrence', () => {
    const unparseable = {
      ...weekly,
      endingType: 'until',
      untilDate: 'not-a-date',
    } satisfies Partial<EventSchedule>

    expect(calendarFeedAnswer({ _status: 'published', schedule: unparseable }, 'en', now)).toBe(
      'none',
    )
    expect(
      calendarFeedAnswer(
        { _status: 'draft', schedule: unparseable, updatedAt: now.toISOString() },
        'en',
        now,
      ),
    ).toBe('none')
  })
})
