/**
 * Render tests for the registrant confirmation email.
 *
 * Follows `email-templates.spec.ts`: pure render contract, no Payload
 * bootstrap, no DB. Covers the AC's matrix — online + offline, two locales,
 * and a branded vs fallback client — plus the plain-text alternative.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  RegistrationConfirmationEmail,
  registrationConfirmationText,
} from '@/emails/RegistrationConfirmationEmail'
import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import type { EmailStrings } from '@/lib/translations/emailStrings'
import { EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'
import { getClientEmailBrand, getEmailBrand, renderEmail } from '@/plugins/email'

const ONLINE_URL = 'https://meet.example/abc-def'

const baseDetails: RegistrationEmailDetails = {
  eventTitle: 'Tuesday Evening Meditation',
  scheduleLine: 'Every week on Tuesday, 7:00 – 8:30 PM GMT+1',
  sessions: 8,
  location: { type: 'online', joinUrl: ONLINE_URL },
  description: 'Bring a cushion and an open mind.',
  contact: 'Ana · +44 20 7946 0000',
}

const offlineDetails: RegistrationEmailDetails = {
  ...baseDetails,
  location: {
    type: 'offline',
    address: '12 Example Street, London, United Kingdom SW1A 1AA',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
  },
}

/** A German locale's strings, as the resolver would return them. */
const germanStrings: EmailStrings = {
  ...EMAIL_STRING_DEFAULTS,
  confirmation_heading: 'Du bist angemeldet',
  confirmation_intro: 'Hallo %{name}, dein Platz ist bestätigt.',
  when_label: 'Wann',
  where_label: 'Wo',
  online_cta: 'Online teilnehmen',
}

/**
 * Decode the entities react-email emits, so assertions can use the source copy
 * verbatim. Without this, `You're` renders as `You&#x27;re` and a
 * `not.toContain("You're …")` assertion would pass for the wrong reason.
 */
function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function render(props: Partial<Parameters<typeof RegistrationConfirmationEmail>[0]> = {}) {
  const html = await renderEmail(
    createElement(RegistrationConfirmationEmail, {
      name: 'Jo',
      brand: getEmailBrand('sahaj-atlas'),
      strings: EMAIL_STRING_DEFAULTS,
      details: baseDetails,
      ...props,
    }),
  )
  return decodeEntities(html)
}

describe('RegistrationConfirmationEmail — online', () => {
  it('renders the join URL as a CTA *and* as selectable plain text', async () => {
    const html = await render()

    // Button-stripping clients are common, so the URL must survive twice.
    const occurrences = html.split(ONLINE_URL).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
    expect(html).toContain(EMAIL_STRING_DEFAULTS.online_cta)
    expect(html).toContain(EMAIL_STRING_DEFAULTS.online_link_hint)
  })

  it('renders the registrant name, event title, and schedule', async () => {
    const html = await render()

    expect(html).toContain('Jo')
    expect(html).toContain('Tuesday Evening Meditation')
    expect(html).toContain('Every week on Tuesday')
    expect(html).toContain('8 sessions')
  })

  it('renders host contact and the description', async () => {
    const html = await render()

    expect(html).toContain('Ana')
    expect(html).toContain('Bring a cushion')
    expect(html).toContain(EMAIL_STRING_DEFAULTS.contact_label)
  })

  it('shows no address or maps link for an online event', async () => {
    const html = await render()

    expect(html).not.toContain('Example Street')
    expect(html).not.toContain(EMAIL_STRING_DEFAULTS.map_link)
  })
})

describe('RegistrationConfirmationEmail — offline', () => {
  it('renders the full address and a maps link', async () => {
    const html = await render({ details: offlineDetails })

    expect(html).toContain('12 Example Street')
    expect(html).toContain('SW1A 1AA')
    expect(html).toContain(EMAIL_STRING_DEFAULTS.map_link)
    expect(html).toContain('maps/search')
  })

  it('renders no join-link section', async () => {
    const html = await render({ details: offlineDetails })

    expect(html).not.toContain(ONLINE_URL)
    expect(html).not.toContain(EMAIL_STRING_DEFAULTS.online_cta)
  })

  it('omits the maps link when the venue could not be located', async () => {
    const html = await render({
      details: {
        ...offlineDetails,
        location: { type: 'offline', address: 'Somewhere', mapsUrl: null },
      },
    })

    expect(html).toContain('Somewhere')
    expect(html).not.toContain(EMAIL_STRING_DEFAULTS.map_link)
  })
})

describe('RegistrationConfirmationEmail — localization', () => {
  it('renders the resolved strings for a second locale', async () => {
    const html = await render({ strings: germanStrings })

    expect(html).toContain('Du bist angemeldet')
    expect(html).toContain('Hallo Jo')
    expect(html).toContain('Wann')
    expect(html).toContain('Online teilnehmen')

    // Match element text, not the whole document: this fixture leaves
    // `confirmation_subject` untranslated on purpose (per-key fallback), so the
    // English subject legitimately still appears in <title> and the preview text.
    expect(html).toContain('>Du bist angemeldet<')
    expect(html).not.toContain(">You're registered<")
  })

  it('still renders English for keys the locale left untranslated', async () => {
    const html = await render({ strings: germanStrings })
    expect(html).toContain(EMAIL_STRING_DEFAULTS.contact_label)
  })
})

describe('RegistrationConfirmationEmail — client branding', () => {
  it('uses the client service name and colour when configured', async () => {
    const brand = getClientEmailBrand({
      name: 'Sahaja Yoga London',
      color1: '#123456',
      color2: '#654321',
      logo: null,
    })

    const html = await render({ brand, websiteUrl: 'https://example.org' })

    expect(html).toContain('Sahaja Yoga London')
    expect(html).toContain('#123456')
    expect(html).toContain('https://example.org')
    expect(html).toContain('Visit Sahaja Yoga London')
  })

  it('falls back to the Atlas project brand for an unconfigured client', async () => {
    const fallback = getEmailBrand('sahaj-atlas')
    // `Clients.name` is required by the schema, so the reachable "unconfigured"
    // state is an empty string, not null.
    const brand = getClientEmailBrand({ name: '', color1: null, color2: null, logo: null })

    expect(brand.productName).toBe(fallback.productName)
    expect(brand.colors.primary).toBe(fallback.colors.primary)

    const html = await render({ brand })
    expect(html).toContain(fallback.productName)
  })

  it('omits the footer website link when the client has no website', async () => {
    const html = await render({ websiteUrl: null })
    expect(html).not.toContain('Visit ')
  })
})

describe('RegistrationConfirmationEmail — calendar hint', () => {
  it('mentions the attachment by default', async () => {
    expect(await render()).toContain(EMAIL_STRING_DEFAULTS.calendar_hint)
  })

  it('omits the hint when no calendar could be built', async () => {
    const html = await render({ hasCalendarAttachment: false })
    expect(html).not.toContain(EMAIL_STRING_DEFAULTS.calendar_hint)
  })
})

describe('registrationConfirmationText', () => {
  const props = {
    name: 'Jo',
    brand: getEmailBrand('sahaj-atlas'),
    strings: EMAIL_STRING_DEFAULTS,
    details: baseDetails,
  }

  it('carries the same key facts as the HTML', () => {
    const text = registrationConfirmationText(props)

    expect(text).toContain('Jo')
    expect(text).toContain('Tuesday Evening Meditation')
    expect(text).toContain('Every week on Tuesday')
    expect(text).toContain(ONLINE_URL)
    expect(text).toContain('8 sessions')
    expect(text).toContain('Ana')
  })

  it('contains no HTML markup', () => {
    expect(registrationConfirmationText(props)).not.toMatch(/<[a-z]/i)
  })

  it('renders the address and maps link for an offline event', () => {
    const text = registrationConfirmationText({ ...props, details: offlineDetails })

    expect(text).toContain('12 Example Street')
    expect(text).toContain('maps/search')
    expect(text).not.toContain(ONLINE_URL)
  })

  it('follows the resolved locale', () => {
    const text = registrationConfirmationText({ ...props, strings: germanStrings })

    expect(text).toContain('Du bist angemeldet')
    expect(text).toContain('Hallo Jo')
  })
})
