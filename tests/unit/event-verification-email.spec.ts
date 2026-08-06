import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  EventVerificationEmail,
  type EventDetails,
  type EventManagerContact,
  type EventSuggestion,
} from '@/emails/EventVerificationEmail'
import { EVENT_QUALITY_CHECK_METADATA } from '@/lib/eventQuality'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const details: EventDetails = {
  title: 'Saturday Morning Sahaja Yoga Meditation',
  locationLabel: 'Address',
  location: '12 MG Road, Pune, Maharashtra, IN 411001',
  schedule: 'Every week on Saturday at 9:26 AM',
  contact: 'Priya Deshmukh · +91 98765 43210',
  breaks: ['Diwali break: 21 Jul – 23 Jul 2026'],
  lastVerified: 'Wednesday, 12 March 2026',
  recentRegistrations: 4,
}

const eventManager: EventManagerContact = {
  name: 'Priya Deshmukh',
  contacts: [
    { label: 'Email', value: 'priya@example.com' },
    { label: 'WhatsApp', value: '+91 98765 43210' },
  ],
}

/** Built the way the job builds them — labels resolved from the check registry. */
const suggestions: EventSuggestion[] = [
  {
    key: 'description.missing',
    label: EVENT_QUALITY_CHECK_METADATA['description.missing'].label,
    detail: EVENT_QUALITY_CHECK_METADATA['description.missing'].description,
  },
  {
    key: 'images.insufficient',
    label: EVENT_QUALITY_CHECK_METADATA['images.insufficient'].label,
    detail: 'Only one photo so far.',
  },
]

const baseProps = {
  name: 'Jo Manager',
  eventTitle: 'Morning Meditation',
  verifyUrl: 'https://cloud.test/events/verify?token=TKN123',
  audience: 'manager' as const,
  details,
  deadline: 'Saturday, 19 July 2026',
  sinceLastVerified: '3 months',
}

describe('EventVerificationEmail', () => {
  it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
    'renders the %s reminder with the verify link + sahaj-atlas brand',
    async (level) => {
      const html = await renderEmail(createElement(EventVerificationEmail, { ...baseProps, level }))
      const brand = getEmailBrand('sahaj-atlas')

      expect(html).toContain(details.title) // event named in the summary table
      expect(html).toContain(baseProps.verifyUrl)
      expect(html).toContain(brand.productName) // "Sahaj Atlas"
      expect(html).toContain(brand.colors.primary) // "#4a8cd4"
    },
  )

  it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
    'states the unpublish date in the callout for the %s level',
    async (level) => {
      const html = await renderEmail(createElement(EventVerificationEmail, { ...baseProps, level }))
      expect(html).toContain('Saturday, 19 July 2026')
    },
  )

  it('renders the event details summary table', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'due' }),
    )
    expect(html).toContain('12 MG Road, Pune, Maharashtra, IN 411001')
    expect(html).toContain('Every week on Saturday at 9:26 AM')
    expect(html).toContain('4 registrations in the last 30 days')
  })

  it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
    'shows the last-verified date in the details table for the %s level',
    async (level) => {
      const html = await renderEmail(createElement(EventVerificationEmail, { ...baseProps, level }))
      expect(html).toContain('Last verified')
      expect(html).toContain('Wednesday, 12 March 2026')
    },
  )

  it('renders a "View event" button when eventUrl is given', async () => {
    const eventUrl = 'https://wemeditate.com/map#/!/events/1042'
    const html = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'due', eventUrl }),
    )
    expect(html).toContain(eventUrl)
    expect(html).toContain('View event')
  })

  it('omits the "View event" button when eventUrl is null (unpublished)', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'expired', eventUrl: null }),
    )
    expect(html).not.toContain('View event')
  })

  it('marks the urgent level as the final reminder, expired as unpublished', async () => {
    const urgent = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'urgent' }),
    )
    const expired = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'expired' }),
    )
    expect(urgent.toLowerCase()).toContain('final reminder')
    expect(expired).toContain('unpublished')
    expect(expired).toContain('3 months') // fairness: how long it went unverified
  })

  describe('listing suggestions', () => {
    it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
      'renders every open recommendation in the %s reminder',
      async (level) => {
        const html = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level, suggestions }),
        )
        expect(html).toContain('Suggested improvements')
        for (const suggestion of suggestions) {
          expect(html).toContain(suggestion.label)
          expect(html).toContain(suggestion.detail)
        }
      },
    )

    it('takes its wording from the check registry, not the template', async () => {
      // The one source of truth with the admin panel: nothing here is spelled
      // out in the template, so re-wording `copy.ts` re-words the email too.
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', suggestions }),
      )
      expect(html).toContain(EVENT_QUALITY_CHECK_METADATA['description.missing'].label)
      expect(html).toContain(EVENT_QUALITY_CHECK_METADATA['description.missing'].description)
    })

    it('says the suggestions are optional, so the email stays a nudge', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', suggestions }),
      )
      expect(html).toContain('don’t affect verification')
    })

    it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
      'renders the %s email byte-identically when there is nothing open',
      async (level) => {
        const untouched = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level }),
        )
        const empty = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level, suggestions: [] }),
        )
        const absent = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level, suggestions: undefined }),
        )

        expect(empty).toBe(untouched)
        expect(absent).toBe(untouched)
        expect(untouched).not.toContain('Suggested improvements')
      },
    )

    it('omits them from region-manager mail — they can’t act on the listing', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'escalated',
          audience: 'region',
          regionName: 'Maharashtra',
          eventManager,
          suggestions,
        }),
      )
      expect(html).not.toContain('Suggested improvements')
      expect(html).not.toContain(suggestions[0].label)
    })
  })

  describe('region-manager framing', () => {
    const regionProps = {
      ...baseProps,
      audience: 'region' as const,
      name: 'Rohan Patil',
      regionName: 'Maharashtra',
      eventManager,
    }

    it('frames it as an event in their region and asks them to follow up', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...regionProps, level: 'escalated' }),
      )
      expect(html).toContain('event in')
      expect(html).not.toContain('your event')
      expect(html.toLowerCase()).toMatch(/reach out|get in touch|contact/)
    })

    it('names the region that links the manager to the event in the body', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...regionProps, level: 'escalated' }),
      )
      expect(html).toContain('event in')
      expect(html).toContain('Maharashtra')
    })

    it('includes the event manager name and every contact method', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...regionProps, level: 'urgent' }),
      )
      expect(html).toContain('Priya Deshmukh')
      expect(html).toContain('priya@example.com')
      expect(html).toContain('+91 98765 43210')
      expect(html).toContain('Event manager')
    })

    it('points its CTA at the event manager (mailto), not the verify link', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...regionProps, level: 'escalated' }),
      )
      expect(html).toContain('mailto:priya@example.com')
      // Region managers don't verify the event themselves.
      expect(html).not.toContain(baseProps.verifyUrl)
    })

    it('throws for the unsupported region "due" reminder', async () => {
      await expect(
        renderEmail(createElement(EventVerificationEmail, { ...regionProps, level: 'due' })),
      ).rejects.toThrow(/not supported for region/)
    })
  })

  it('warns against forwarding the email', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, { ...baseProps, level: 'due' }),
    )
    expect(html).toContain('forward this email')
  })

  it('renders without a details table when none is supplied', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        name: 'Sam',
        eventTitle: 'Untitled',
        verifyUrl: 'https://cloud.test/verify',
        level: 'escalated',
        audience: 'manager',
        sinceLastVerified: '3 months',
      }),
    )
    expect(html).toContain('Sam') // renders (greeting), just without a table
    expect(html).not.toContain('registrations in the last 30 days')
  })
})
