/**
 * Unit tests for the React Email transactional templates.
 *
 * Pure render contract — no Payload bootstrap, no DB. Asserts each template
 * interpolates the recipient name + token URL and renders the expected CTA,
 * and that branding is configurable per project via the `project` prop.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { EventRegistrationEmail } from '@/emails/EventRegistrationEmail'
import { ResetPasswordEmail } from '@/emails/ResetPasswordEmail'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

describe('VerifyEmail', () => {
  it('renders the recipient name, verify URL, and CTA', async () => {
    const html = await renderEmail(
      createElement(VerifyEmail, {
        name: 'Jo',
        verifyUrl: 'https://cloud.test/admin/verify/TKN-123',
      }),
    )

    expect(html).toBeTruthy()
    expect(html).toContain('Jo')
    expect(html).toContain('https://cloud.test/admin/verify/TKN-123')
    expect(html).toContain('Verify Email Address')
  })
})

describe('ResetPasswordEmail', () => {
  it('renders the recipient name, reset URL, and CTA', async () => {
    const html = await renderEmail(
      createElement(ResetPasswordEmail, {
        name: 'Sam',
        resetUrl: 'https://cloud.test/admin/reset/RST-456',
      }),
    )

    expect(html).toBeTruthy()
    expect(html).toContain('Sam')
    expect(html).toContain('https://cloud.test/admin/reset/RST-456')
    expect(html).toContain('Reset Password')
  })
})

describe('brand configurability', () => {
  const props = { name: 'Jo', verifyUrl: 'https://cloud.test/admin/verify/T' }

  it('renders a different product name + primary color per project', async () => {
    const web = await renderEmail(
      createElement(VerifyEmail, { ...props, project: 'wemeditate-web' }),
    )
    const atlas = await renderEmail(
      createElement(VerifyEmail, { ...props, project: 'sahaj-atlas' }),
    )

    const webBrand = getEmailBrand('wemeditate-web')
    const atlasBrand = getEmailBrand('sahaj-atlas')

    // Each render carries its own brand...
    expect(web).toContain(webBrand.productName) // "WeMeditate Web"
    expect(web).toContain(webBrand.colors.primary) // "#F07855"
    expect(atlas).toContain(atlasBrand.productName) // "Sahaj Atlas"
    expect(atlas).toContain(atlasBrand.colors.primary) // "#4a8cd4"

    // ...and no other project's brand bleeds in.
    expect(web).not.toContain(atlasBrand.productName)
    expect(atlas).not.toContain(webBrand.productName)
    expect(web).not.toBe(atlas)
  })

  it('defaults to wemeditate-web when no project is passed', async () => {
    const html = await renderEmail(createElement(VerifyEmail, props))
    expect(html).toContain(getEmailBrand('wemeditate-web').productName)
  })
})

describe('EventRegistrationEmail', () => {
  const props = {
    recipientName: 'Anna',
    eventTitle: 'Morning Meditation',
    registrantName: 'Sam Seeker',
    registrantEmail: 'sam@example.com',
    sessionDate: 'Saturday, 19 July 2026',
    eventAdminUrl: 'https://cloud.test/admin/collections/events/42',
  }

  it('renders the recipient, registrant, session, admin link, and CTA', async () => {
    const html = await renderEmail(createElement(EventRegistrationEmail, props))

    expect(html).toContain('Anna')
    expect(html).toContain('Morning Meditation')
    expect(html).toContain('Sam Seeker')
    expect(html).toContain('mailto:sam@example.com')
    expect(html).toContain('Saturday, 19 July 2026')
    expect(html).toContain('https://cloud.test/admin/collections/events/42')
    expect(html).toContain('View event')
    // Branded for the Sahaj Atlas project (a manager notice, not client mail).
    expect(html).toContain(getEmailBrand('sahaj-atlas').productName)
  })

  it('greets neutrally for a bare override address (no recipient name)', async () => {
    const html = await renderEmail(
      createElement(EventRegistrationEmail, { ...props, recipientName: null }),
    )
    // React Email inserts `<!-- -->` markers between adjacent text nodes; strip
    // them so the greeting reads as one string.
    expect(html.replace(/<!-- -->/g, '')).toContain('Hello there')
    expect(html).not.toContain('Anna')
  })

  it('omits the session row when no session date is supplied', async () => {
    const html = await renderEmail(
      createElement(EventRegistrationEmail, { ...props, sessionDate: null }),
    )
    expect(html).not.toContain('Session')
  })
})
