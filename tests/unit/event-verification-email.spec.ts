import type { Payload } from 'payload'

import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  EventVerificationEmail,
  verificationSubject,
  type EventDetails,
  type EventManagerContact,
} from '@/emails/EventVerificationEmail'
import {
  EMAIL_STRING_DEFAULTS,
  resolveEmailStrings,
  type EmailStrings,
} from '@/lib/translations/emailStrings'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const details: EventDetails = {
  title: 'Saturday Morning Sahaja Yoga Meditation',
  isOnline: false,
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

/** English copy — what a manager with no `language` set receives. */
const english: EmailStrings = { ...EMAIL_STRING_DEFAULTS }

const baseProps = {
  name: 'Jo Manager',
  eventTitle: 'Morning Meditation',
  verifyUrl: 'https://cloud.test/events/verify?token=TKN123',
  audience: 'manager' as const,
  strings: english,
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
        strings: english,
        sinceLastVerified: '3 months',
      }),
    )
    expect(html).toContain('Sam') // renders (greeting), just without a table
    expect(html).not.toContain('registrations in the last 30 days')
  })
})

/**
 * Czech translations for part of the reminder — deliberately partial, which is
 * the realistic state of a locale a translator is still working through.
 */
const CZECH: Record<string, string> = {
  verify_greeting: 'Dobrý den, %{name},',
  verify_manager_due_subject: 'Ověřte prosím svou událost: %{event}',
  verify_manager_due_heading: 'Ověřte svou hodinu Sahaja Yogy',
  verify_manager_due_preview: 'Rychlá kontrola, že vaše hodina stále probíhá.',
  verify_manager_due_cta: 'Ověřit událost',
  verify_manager_due_body:
    'Aby byly veřejné výpisy přesné, je potřeba události na %{brand} pravidelně kontrolovat.',
  verify_manager_due_callout: '✅ Ověřte do %{deadline}, aby událost zůstala zveřejněná.',
  verify_details_heading: 'Údaje o události',
  verify_label_last_verified: 'Naposledy ověřeno',
  verify_region_escalated_body:
    'Událost v oblasti %{region} potřebuje ověření. Kontaktujte prosím %{manager}.',
  verify_registrations_count_one: '%{count} registrace za posledních 30 dní',
  verify_registrations_count_few: '%{count} registrace za posledních 30 dní',
  verify_registrations_count_many: '%{count} registrací za posledních 30 dní',
  verify_registrations_count_other: '%{count} registrací za posledních 30 dní',
}

/** Resolve the strings a Czech-speaking manager gets, through the real resolver. */
function czechStrings(): Promise<EmailStrings> {
  const payload = {
    findGlobal: vi.fn().mockResolvedValue({ emails: CZECH }),
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as Payload
  return resolveEmailStrings({ payload, locale: 'cs' })
}

describe('EventVerificationEmail — localized copy', () => {
  it('renders the reminder in the manager’s language', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        level: 'due',
        strings: await czechStrings(),
        locale: 'cs',
      }),
    )
    expect(html).toContain('Ověřte svou hodinu Sahaja Yogy') // heading
    expect(html).toContain('Aby byly veřejné výpisy přesné') // body
    expect(html).toContain('Ověřit událost') // CTA
    expect(html).toContain('Údaje o události') // summary-table heading
    expect(html).toContain('Naposledy ověřeno') // row label
    // The English it replaced is gone, not merely appended to.
    expect(html).not.toContain('Verify your Sahaja Yoga class')
  })

  it('falls back to the English default for a key the locale has not translated', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        level: 'due',
        strings: await czechStrings(),
        locale: 'cs',
      }),
    )
    // CZECH translates neither the button hint nor the footer — English, not
    // blank and not a raw key.
    expect(html).toContain('copy and paste this link into your browser')
    expect(html).toContain('please don’t forward this email')
    expect(html).not.toContain('verify_button_hint')
  })

  it('interpolates values into the translated sentence rather than around it', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        level: 'due',
        strings: await czechStrings(),
        locale: 'cs',
      }),
    )
    // `%{deadline}` sits mid-sentence in Czech and keeps its bold styling.
    expect(html).toContain('✅ Ověřte do ')
    expect(html).toContain('<strong>Saturday, 19 July 2026</strong>')
    expect(html).toContain(', aby událost zůstala zveřejněná.')
    expect(html).toContain('Dobrý den, ')
    expect(html).toContain('<strong>Jo Manager</strong>')
  })

  it('localizes the region variation, naming region and manager in place', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        audience: 'region',
        level: 'escalated',
        name: 'Rohan Patil',
        regionName: 'Maharashtra',
        eventManager,
        strings: await czechStrings(),
        locale: 'cs',
      }),
    )
    expect(html).toContain('Událost v oblasti ')
    expect(html).toContain('<strong>Maharashtra</strong>')
    expect(html).toContain('. Kontaktujte prosím ')
    expect(html).toContain('<strong>Priya Deshmukh</strong>')
  })

  it('selects the locale’s plural form for the registration count', async () => {
    const strings = await czechStrings()
    const render = (recentRegistrations: number) =>
      renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          strings,
          locale: 'cs',
          details: { ...details, recentRegistrations },
        }),
      )

    // Czech: 4 → few, 8 → other. English would spell both the same way.
    expect(await render(4)).toContain('4 registrace za posledních 30 dní')
    expect(await render(8)).toContain('8 registrací za posledních 30 dní')
  })

  it.each([
    ['manager', 'due'],
    ['manager', 'escalated'],
    ['manager', 'urgent'],
    ['manager', 'expired'],
    ['region', 'escalated'],
    ['region', 'urgent'],
    ['region', 'expired'],
  ] as const)('leaves no %s/%s placeholder unsubstituted', async (audience, level) => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        audience,
        level,
        regionName: 'Maharashtra',
        eventManager,
      }),
    )
    expect(html).not.toContain('%{')
  })

  it('shows the localized stand-in when the event has never been verified', async () => {
    const html = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        level: 'due',
        details: { ...details, lastVerified: null },
      }),
    )
    expect(html).toContain('Never')
  })

  it('labels an online event’s location differently from an address', async () => {
    const online = await renderEmail(
      createElement(EventVerificationEmail, {
        ...baseProps,
        level: 'due',
        details: { ...details, isOnline: true, location: 'https://meet.test/room' },
      }),
    )
    expect(online).toContain('Online')
    expect(online).toContain('https://meet.test/room')
  })
})

describe('verificationSubject', () => {
  it.each([
    ['manager', 'due', 'Please verify your event: Morning Meditation'],
    ['manager', 'escalated', 'Action needed — verify your event: Morning Meditation'],
    ['manager', 'urgent', 'Final reminder — verify your event: Morning Meditation'],
    ['manager', 'expired', 'Your event has been unpublished: Morning Meditation'],
    ['region', 'escalated', 'Needs verification — an event in your region: Morning Meditation'],
    ['region', 'urgent', 'Final notice — an event in your region: Morning Meditation'],
    ['region', 'expired', 'Unpublished — an event in your region: Morning Meditation'],
  ] as const)('names the event in the %s/%s subject', (audience, level, expected) => {
    expect(
      verificationSubject({ strings: english, audience, level, eventTitle: 'Morning Meditation' }),
    ).toBe(expected)
  })

  it('resolves the subject in the manager’s language', async () => {
    expect(
      verificationSubject({
        strings: await czechStrings(),
        audience: 'manager',
        level: 'due',
        eventTitle: 'Ranní meditace',
      }),
    ).toBe('Ověřte prosím svou událost: Ranní meditace')
  })

  it('throws for the unsupported region "due" reminder, like the render does', () => {
    expect(() =>
      verificationSubject({
        strings: english,
        audience: 'region',
        level: 'due',
        eventTitle: 'Morning Meditation',
      }),
    ).toThrow(/not supported for region/)
  })
})
