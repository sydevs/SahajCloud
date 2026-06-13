import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  EventVerificationReminderEmail,
  type EventDetails,
} from '@/emails/EventVerificationReminderEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const details: EventDetails = {
  title: 'Saturday Morning Sahaja Yoga Meditation',
  locationLabel: 'Address',
  location: '12 MG Road, Pune, Maharashtra, IN 411001',
  schedule: 'Weekly on Saturday, 09:00–10:30 (Asia/Kolkata)',
  contact: 'Priya Deshmukh · +91 98765 43210',
  breaks: ['Diwali break: 21 Jul – 23 Jul 2026'],
  recentRegistrations: 4,
}

const baseProps = {
  name: 'Jo Manager',
  eventTitle: 'Morning Meditation',
  verifyUrl: 'https://cloud.test/api/events/42/verify?token=TKN123',
  details,
}

describe('EventVerificationReminderEmail', () => {
  it.each(['due', 'escalated', 'expired'] as const)(
    'renders the %s reminder with the verify link + sahaj-atlas brand',
    async (level) => {
      const html = await renderEmail(
        createElement(EventVerificationReminderEmail, { ...baseProps, level }),
      )
      const brand = getEmailBrand('sahaj-atlas')

      expect(html).toContain('Morning Meditation')
      expect(html).toContain(baseProps.verifyUrl)
      expect(html).toContain(brand.productName) // "Sahaj Atlas"
      expect(html).toContain(brand.colors.primary) // "#4a8cd4"
    },
  )

  it('renders the event details summary table', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'due' }),
    )
    expect(html).toContain('12 MG Road, Pune, Maharashtra, IN 411001')
    expect(html).toContain('Weekly on Saturday')
    expect(html).toContain('Priya Deshmukh · +91 98765 43210')
    expect(html).toContain('Diwali break: 21 Jul – 23 Jul 2026')
    expect(html).toContain('Registrations (last 30 days)')
    expect(html).toContain('Address')
  })

  it('renders an online URL row for online events', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, {
        ...baseProps,
        level: 'due',
        details: { ...details, locationLabel: 'Online', location: 'https://meet.example.com/abc' },
      }),
    )
    expect(html).toContain('Online')
    expect(html).toContain('https://meet.example.com/abc')
  })

  it('omits the registrations row when there are none', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, {
        ...baseProps,
        level: 'due',
        details: { ...details, recentRegistrations: undefined },
      }),
    )
    expect(html).not.toContain('Registrations (last 30 days)')
  })

  it('shows an alert for escalated and expired, but not for due', async () => {
    const due = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'due' }),
    )
    const escalated = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'escalated' }),
    )
    const expired = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'expired' }),
    )

    expect(escalated).toContain('Final reminder')
    expect(expired).toContain('currently unpublished')
    expect(due).not.toContain('Final reminder')
    expect(due).not.toContain('currently unpublished')
  })

  it('renders without a details table when none is supplied', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, {
        name: 'Sam',
        eventTitle: 'Untitled',
        verifyUrl: 'https://cloud.test/verify',
        level: 'due',
      }),
    )
    expect(html).toContain('Untitled')
    expect(html).not.toContain('Registrations (last 30 days)')
  })
})
