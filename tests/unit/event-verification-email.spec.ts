import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  EventVerificationReminderEmail,
  type EventDetails,
  type EventManagerContact,
} from '@/emails/EventVerificationReminderEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const details: EventDetails = {
  title: 'Saturday Morning Sahaja Yoga Meditation',
  locationLabel: 'Address',
  location: '12 MG Road, Pune, Maharashtra, IN 411001',
  schedule: 'Every week on Saturday at 9:26 AM',
  contact: 'Priya Deshmukh · +91 98765 43210',
  breaks: ['Diwali break: 21 Jul – 23 Jul 2026'],
  recentRegistrations: 4,
}

const eventManager: EventManagerContact = {
  name: 'Priya Deshmukh',
  contacts: [
    { label: 'Email', value: 'priya@example.com' },
    { label: 'WhatsApp', value: '+91 98765 43210' },
  ],
}

const baseProps = {
  name: 'Jo Manager',
  eventTitle: 'Morning Meditation',
  verifyUrl: 'https://cloud.test/api/events/42/verify?token=TKN123',
  audience: 'manager' as const,
  details,
  deadline: 'Saturday, 19 July 2026',
  sinceLastVerified: '3 months',
}

describe('EventVerificationReminderEmail', () => {
  it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
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

  it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
    'states the unpublish date in the body for the %s level',
    async (level) => {
      const html = await renderEmail(
        createElement(EventVerificationReminderEmail, { ...baseProps, level }),
      )
      expect(html).toContain('Saturday, 19 July 2026')
    },
  )

  it('renders the event details summary table', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'due' }),
    )
    expect(html).toContain('12 MG Road, Pune, Maharashtra, IN 411001')
    expect(html).toContain('Every week on Saturday at 9:26 AM')
    expect(html).toContain('4 registrations in the last 30 days')
  })

  it('marks the urgent level as the final reminder, expired as unpublished', async () => {
    const urgent = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'urgent' }),
    )
    const expired = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'expired' }),
    )
    expect(urgent.toLowerCase()).toContain('final reminder')
    expect(expired).toContain('unpublished')
    expect(expired).toContain('3 months') // fairness: how long it went unverified
  })

  describe('region-manager framing', () => {
    const regionProps = {
      ...baseProps,
      audience: 'region' as const,
      name: 'Rohan Patil',
      eventManager,
    }

    it('frames it as an event in their region and asks them to follow up', async () => {
      const html = await renderEmail(
        createElement(EventVerificationReminderEmail, { ...regionProps, level: 'escalated' }),
      )
      expect(html).toContain('in your region')
      expect(html).not.toContain('your event')
      expect(html.toLowerCase()).toMatch(/reach out|get in touch|contact/)
    })

    it('includes the event manager name and every contact method', async () => {
      const html = await renderEmail(
        createElement(EventVerificationReminderEmail, { ...regionProps, level: 'urgent' }),
      )
      expect(html).toContain('Priya Deshmukh')
      expect(html).toContain('priya@example.com')
      expect(html).toContain('+91 98765 43210')
      expect(html).toContain('Event manager')
    })
  })

  it('warns against forwarding the email', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, { ...baseProps, level: 'due' }),
    )
    expect(html).toContain('forward this email')
  })

  it('renders without a details table when none is supplied', async () => {
    const html = await renderEmail(
      createElement(EventVerificationReminderEmail, {
        name: 'Sam',
        eventTitle: 'Untitled',
        verifyUrl: 'https://cloud.test/verify',
        level: 'due',
        audience: 'manager',
      }),
    )
    expect(html).toContain('Untitled')
    expect(html).not.toContain('registrations in the last 30 days')
  })
})
