/**
 * Unit tests for the React Email transactional templates.
 *
 * Pure render contract — no Payload bootstrap, no DB. Asserts each template
 * interpolates the recipient name + token URL and renders the expected CTA,
 * and that branding is configurable per project via the `project` prop.
 *
 * ⚠ The URLs below are INPUTS, so nothing here can tell you whether the shape
 * is one Payload will route — a wrong URL round-trips just as happily as a
 * right one, which is how #320 survived. Their shape is pinned in
 * `manager-auth-urls.spec.ts`, against the config that builds them. They are
 * written correctly here only so the fixtures do not teach the wrong URL.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { buildReplyBody, EventRegistrationEmail } from '@/emails/EventRegistrationEmail'
import { ResetPasswordEmail } from '@/emails/ResetPasswordEmail'
import { buildUserMessageDetails, UserMessageEmail } from '@/emails/UserMessageEmail'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

describe('VerifyEmail', () => {
  it('renders the recipient name, verify URL, and CTA', async () => {
    const html = await renderEmail(
      createElement(VerifyEmail, {
        name: 'Jo',
        verifyUrl: 'https://cloud.test/admin/managers/verify/TKN-123',
      }),
    )

    expect(html).toBeTruthy()
    expect(html).toContain('Jo')
    expect(html).toContain('https://cloud.test/admin/managers/verify/TKN-123')
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
  const props = { name: 'Jo', verifyUrl: 'https://cloud.test/admin/managers/verify/T' }

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
    startDate: 'Saturday, 19 July 2026',
    answers: [
      { label: 'How did you hear about this event?', value: 'A friend recommended it' },
      { label: 'Do you have any questions for us?', value: 'Is parking available?' },
    ],
    eventAdminUrl: 'https://cloud.test/admin/collections/events/42',
  }

  it('renders the recipient, registrant, start date, answers, and both CTAs', async () => {
    const html = await renderEmail(createElement(EventRegistrationEmail, props))

    expect(html).toContain('Anna')
    expect(html).toContain('Morning Meditation')
    expect(html).toContain('Sam Seeker')
    // Section headings (shared SectionHeading).
    expect(html).toContain('Event details')
    expect(html).toContain('Start date')
    expect(html).toContain('Saturday, 19 July 2026')
    // Forwarded registrant answers.
    expect(html).toContain('Registration answers')
    expect(html).toContain('How did you hear about this event?')
    expect(html).toContain('A friend recommended it')
    expect(html).toContain('Do you have any questions for us?')
    expect(html).toContain('Is parking available?')
    // Both CTAs render on the button row; Reply is a pre-filled mailto.
    expect(html).toContain('Reply')
    expect(html).toContain('mailto:sam@example.com?subject=')
    expect(html).toContain('View event')
    expect(html).toContain('https://cloud.test/admin/collections/events/42')
    // Branded for the Sahaj Atlas project (a manager notice, not client mail).
    expect(html).toContain(getEmailBrand('sahaj-atlas').productName)
  })

  it('greets neutrally for a bare override address (no recipient name)', async () => {
    const html = await renderEmail(
      createElement(EventRegistrationEmail, { ...props, recipientName: null }),
    )
    // React Email inserts `<!-- -->` markers between adjacent text nodes. Strip
    // them so the greeting reads as one string.
    expect(html.replace(/<!-- -->/g, '')).toContain('Hello there')
    expect(html).not.toContain('Anna')
  })

  it('omits the start-date row and answers section when neither is supplied', async () => {
    const html = await renderEmail(
      createElement(EventRegistrationEmail, { ...props, startDate: null, answers: [] }),
    )
    expect(html).not.toContain('Start date')
    expect(html).not.toContain('Registration answers')
  })
})

describe('buildReplyBody', () => {
  it('greets the registrant and quotes the event, start date, and answers', () => {
    const body = buildReplyBody({
      registrantName: 'Sam',
      eventTitle: 'Morning Meditation',
      startDate: 'Saturday, 19 July 2026',
      answers: [{ label: 'How did you hear about this event?', value: 'A friend' }],
    })

    expect(body).toContain('Hello Sam,')
    // A quoted recap the seeker sees in the reply chain: facts block, a blank
    // quoted separator, then the question on its own line above its answer.
    expect(body).toContain('> Your registration for Morning Meditation')
    expect(body).toContain('> Start date: Saturday, 19 July 2026')
    expect(body).toContain('\n>\n')
    expect(body).toContain('> How did you hear about this event?')
    expect(body).toContain('> A friend')
  })

  it('omits the start-date and answer lines when they are absent', () => {
    const body = buildReplyBody({
      registrantName: 'Sam',
      eventTitle: 'Morning Meditation',
      startDate: null,
      answers: [],
    })

    expect(body).toContain('> Your registration for Morning Meditation')
    expect(body).not.toContain('Start date')
    // Only the facts block — no answer separators.
    expect(body).not.toContain('\n>\n')
  })
})

describe('buildUserMessageDetails', () => {
  it('renders every supplied context key, in a stable order', () => {
    const details = buildUserMessageDetails({
      clientName: 'Atlas Widget',
      receivedAt: '2026-08-03T09:30:00.000Z',
      context: {
        locale: 'de',
        path: '/events/berlin',
        hostUrl: 'https://atlas.example.org/embed',
        error: 'TypeError: x is not a function',
        userAgent: 'Mozilla/5.0 (X11)',
      },
    })

    expect(details.map((detail) => detail.label)).toEqual([
      'Service',
      'Locale',
      'Path',
      'Host page',
      'Error',
      'User agent',
      'Received',
    ])
    expect(details[0]).toEqual({ label: 'Service', value: 'Atlas Widget' })
    expect(details[3]).toEqual({ label: 'Host page', value: 'https://atlas.example.org/embed' })
  })

  it('omits a row for every key the caller did not send', () => {
    // The minimal `{ message, turnstileToken }` body — only what the server
    // itself knows survives. A caller sending fewer keys must not produce a
    // table of empty rows, which is the whole reason this is a filter.
    const details = buildUserMessageDetails({
      clientName: 'Atlas Widget',
      receivedAt: '2026-08-03T09:30:00.000Z',
    })

    expect(details.map((detail) => detail.label)).toEqual(['Service', 'Received'])
  })

  it('treats a blank or whitespace-only value as absent', () => {
    const details = buildUserMessageDetails({
      clientName: 'Atlas Widget',
      receivedAt: '2026-08-03T09:30:00.000Z',
      context: { locale: '', path: '   ', hostUrl: 'https://atlas.example.org' },
    })

    expect(details.map((detail) => detail.label)).toEqual(['Service', 'Host page', 'Received'])
  })
})

describe('UserMessageEmail', () => {
  const details = [
    { label: 'Service', value: 'Atlas Widget' },
    { label: 'Path', value: '/events/berlin' },
  ]
  // Resolved by the send helper and passed in, so the `From` display name and
  // the rendered body cannot drift apart.
  const brand = getEmailBrand()

  it('renders the message, the sender address, and every detail row', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        message: 'The venue for this class closed last month.',
        senderEmail: 'seeker@example.com',
        subject: 'Issue report',
        details,
        brand,
      }),
    )

    expect(html).toContain('Issue report')
    expect(html).toContain('The venue for this class closed last month.')
    expect(html).toContain('seeker@example.com')
    expect(html).toContain('mailto:seeker@example.com')
    expect(html).toContain('Atlas Widget')
    expect(html).toContain('/events/berlin')
  })

  it('says the message is unanswerable when no address was supplied', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        message: 'Something went wrong on the map page.',
        subject: 'Issue report',
        details,
        brand,
      }),
    )

    expect(html).toContain('Something went wrong on the map page.')
    // No sender → no mailto anywhere, and the copy says so rather than
    // inviting a reply that would go nowhere.
    expect(html).not.toContain('mailto:')
    expect(html).toContain('no way to reply')
  })

  it('drops the details block entirely when there is nothing to show', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        message: 'A message with no context at all.',
        subject: 'Message',
        details: [],
        brand,
      }),
    )

    expect(html).toContain('A message with no context at all.')
    expect(html).not.toContain('Details')
  })

  it('renders whatever brand it is handed', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        message: 'Branding check message body.',
        subject: 'Message',
        details: [],
        brand: getEmailBrand('sahaj-atlas'),
      }),
    )

    expect(html).toContain(getEmailBrand('sahaj-atlas').productName)
  })
})
