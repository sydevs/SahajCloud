/**
 * Unit tests for the session-reminder email template and the reminder
 * occurrence-detail shaping. Pure render/shape contract — no Payload, no DB.
 *
 * The manager digest moved to `tests/unit/digest-email.spec.ts` when #1070
 * replaced `RegistrationDigestEmail` with one per-role template.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

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

describe('occurrenceLine / buildReminderEmailDetails', () => {
  const schedule = {
    firstDate: '2026-07-01T09:00:00.000Z',
    firstDate_tz: 'Europe/London',
    endTime: '11:00',
    recurrenceType: 'WEEKLY' as const,
  }

  it('formats a specific occurrence date + time span in the event timezone', () => {
    // 09:00 UTC on 21 July is 10:00 London (BST). endTime is 11:00 local.
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
