/**
 * Unit tests for the session-reminder + registration-digest email templates and
 * the reminder occurrence-detail shaping. Pure render/shape contract — no
 * Payload, no DB.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { RegistrationDigestEmail, registrationDigestText } from '@/emails/RegistrationDigestEmail'
import { SessionReminderEmail, sessionReminderText } from '@/emails/SessionReminderEmail'
import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import { buildReminderEmailDetails, occurrenceLine } from '@/lib/notifications/registrationDetails'
import { type EmailStrings, EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'
import type { Event } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const strings: EmailStrings = { ...EMAIL_STRING_DEFAULTS }
const brand = getEmailBrand('sahaj-atlas')
const UNSUBSCRIBE_URL = 'https://cloud.test/registrations/unsubscribe?token=TKN-1'

const onlineDetails: RegistrationEmailDetails = {
  eventTitle: 'Morning Meditation',
  scheduleLine: 'Tuesday, 21 July 2026, 10:00 – 11:00 AM GMT+1',
  sessions: null,
  location: { type: 'online', joinUrl: 'https://meet.example.com/abc' },
  description: null,
  contact: 'Jane · +44 123',
}

describe('SessionReminderEmail', () => {
  it('renders the single occurrence, join URL, and unsubscribe link', async () => {
    const html = await renderEmail(
      createElement(SessionReminderEmail, {
        name: 'Sam',
        brand,
        strings,
        details: onlineDetails,
        unsubscribeUrl: UNSUBSCRIBE_URL,
      }),
    )
    expect(html).toContain('Your class is tomorrow')
    expect(html).toContain('Morning Meditation')
    expect(html).toContain('Tuesday, 21 July 2026')
    expect(html).toContain('https://meet.example.com/abc')
    expect(html).toContain(UNSUBSCRIBE_URL)
    expect(html).toContain('Unsubscribe from these reminders')
    // A reminder is about one session — never the series' session count.
    expect(html).not.toContain('sessions')
  })

  it('offline variant shows the address + directions instead of a join URL', async () => {
    const html = await renderEmail(
      createElement(SessionReminderEmail, {
        name: 'Sam',
        brand,
        strings,
        details: {
          ...onlineDetails,
          location: {
            type: 'offline',
            address: '1 High St, London',
            mapsUrl: 'https://maps.test/x',
          },
        },
        unsubscribeUrl: UNSUBSCRIBE_URL,
      }),
    )
    expect(html).toContain('1 High St, London')
    expect(html).toContain('https://maps.test/x')
    expect(html).toContain('Get Directions')
  })

  it('plain-text alternative carries the occurrence + unsubscribe URL', () => {
    const text = sessionReminderText({
      name: 'Sam',
      brand,
      strings,
      details: onlineDetails,
      unsubscribeUrl: UNSUBSCRIBE_URL,
    })
    expect(text).toContain('Tuesday, 21 July 2026')
    expect(text).toContain(UNSUBSCRIBE_URL)
  })
})

describe('RegistrationDigestEmail', () => {
  const groups = [
    {
      eventTitle: 'Morning Meditation',
      eventAdminUrl: 'https://cloud.test/admin/collections/events/1',
      registrations: [
        {
          registrantName: 'Alice',
          registrantEmail: 'alice@example.com',
          startDate: null,
          answers: [
            { label: 'How did you hear about this event?', value: 'A friend recommended it' },
          ],
        },
        { registrantName: 'Bob', registrantEmail: 'bob@example.com', startDate: '5 August 2025' },
      ],
    },
    {
      eventTitle: 'Evening Class',
      eventAdminUrl: 'https://cloud.test/admin/collections/events/2',
      registrations: [
        { registrantName: 'Cara', registrantEmail: 'cara@example.com', startDate: null },
      ],
    },
  ]

  it('groups registrations by event, renders their answers, and shows a total (no per-event count)', async () => {
    const html = await renderEmail(
      createElement(RegistrationDigestEmail, { recipientName: 'Mgr', period: 'day', groups }),
    )
    expect(html).toContain('Morning Meditation')
    expect(html).toContain('Evening Class')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Cara')
    // The registrant's registration-question answer is included.
    expect(html).toContain('How did you hear about this event?')
    expect(html).toContain('A friend recommended it')
    // The session date is labelled so a bare date can't be misread as a signup date.
    expect(html).toContain('Attending 5 August 2025')
    // Grand total in the intro + daily phrasing; the redundant per-event count is gone.
    expect(html).toContain('3 registrations')
    expect(html).toContain('in the last day')
    expect(html).not.toContain('2 registrations')
    expect(html).toContain('https://cloud.test/admin/collections/events/1')
  })

  it('singularizes a one-registration count and uses the weekly phrase', async () => {
    const text = registrationDigestText({
      recipientName: 'Mgr',
      period: 'week',
      groups: [groups[1]],
    })
    expect(text).toContain('1 registration')
    expect(text).not.toContain('1 registrations')
    expect(text).toContain('in the last week')
  })
})

describe('occurrenceLine / buildReminderEmailDetails', () => {
  const schedule = {
    firstDate: '2026-07-01T09:00:00.000Z',
    firstDate_tz: 'Europe/London',
    endTime: '11:00',
    recurrenceType: 'WEEKLY' as const,
  }

  it('formats a specific occurrence date + time span in the event timezone', () => {
    // 09:00 UTC on 21 July is 10:00 London (BST); endTime 11:00 local.
    const line = occurrenceLine(schedule as never, '2026-07-21T09:00:00.000Z')
    expect(line).toContain('21 July 2026')
    expect(line).toContain('10:00')
    expect(line).toContain('11:00')
  })

  it('collapses to the single occurrence with no session count', () => {
    const event = {
      id: 1,
      title: 'Morning Meditation',
      eventType: 'online',
      onlineUrl: 'https://meet.example.com/abc',
      contactName: 'Jane',
      contactPhone: null,
      description: null,
      schedule,
    } as unknown as Event

    const details = buildReminderEmailDetails(event, '2026-07-21T09:00:00.000Z')
    expect(details.sessions).toBeNull()
    expect(details.scheduleLine).toContain('21 July 2026')
    expect(details.location).toEqual({ type: 'online', joinUrl: 'https://meet.example.com/abc' })
  })
})
