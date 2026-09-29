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
 *
 * The same holds for `InviteEmail`'s grant rows: the LABELS are inputs here,
 * and `manager-invite.spec.ts` is what proves the summary produces them.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { buildReplyBody, EventRegistrationEmail } from '@/emails/EventRegistrationEmail'
import { InviteEmail, inviteHeading } from '@/emails/InviteEmail'
import { ResetPasswordEmail } from '@/emails/ResetPasswordEmail'
import { buildUserMessageDetails, UserMessageEmail } from '@/emails/UserMessageEmail'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const INVITE_URL = 'https://cloud.test/managers/signin?invite=TKN-123'

const inviteProps = {
  name: 'Jo',
  accepted: false,
  actionUrl: INVITE_URL,
  listsOnlyNew: false,
  validFor: '7 days',
  fullAccess: false,
  grants: [
    { locale: 'English', roles: ['Meditations Editor', 'Path Editor'] },
    { locale: 'French', roles: ['Web Translator'] },
  ],
  responsibilities: [],
}

const regions = (...titles: string[]) => ({
  label: 'Regions',
  singular: 'Region',
  items: titles.map((title) => ({ title, url: `https://atlas.test/${title.toLowerCase()}` })),
})

const events = (...items: { title: string; url: null | string }[]) => ({
  label: 'Events',
  singular: 'Event',
  items,
})

describe('InviteEmail', () => {
  it('renders the recipient name, invitation URL, CTA, and validity', async () => {
    const html = await renderEmail(createElement(InviteEmail, inviteProps))

    expect(html).toContain('Jo')
    expect(html).toContain(INVITE_URL)
    expect(html).toContain('Confirm your email')
    expect(html).toContain('7 days')
  })

  it('names the roles per locale', async () => {
    const html = await renderEmail(createElement(InviteEmail, inviteProps))

    expect(html).toContain('English')
    expect(html).toContain('Meditations Editor, Path Editor')
    expect(html).toContain('French')
    expect(html).toContain('Web Translator')
  })

  it('names full access for an admin instead of a role table', async () => {
    const html = await renderEmail(createElement(InviteEmail, { ...inviteProps, fullAccess: true }))

    expect(html).toContain('Administrator')
    expect(html).not.toContain('Meditations Editor')
  })

  it('opens by naming who asked, when a person did', async () => {
    const html = await renderEmail(
      createElement(InviteEmail, {
        ...inviteProps,
        assignedBy: 'Anna Schmidt',
        responsibilities: [regions('Berlin')],
      }),
    )

    expect(html).toContain('Anna Schmidt has invited you to look after the following on')
  })

  it('lists each kind as a row beside the roles, one document per line, linked', async () => {
    const html = await renderEmail(
      createElement(InviteEmail, {
        ...inviteProps,
        responsibilities: [
          regions('Berlin', 'Hamburg'),
          events({ title: 'Tuesday Evening Meditation', url: 'https://atlas.test/tuesday' }),
        ],
      }),
    )

    expect(html).toContain('Your responsibilities')
    // The same label-and-value rows the roles use: "Regions" beside its list.
    expect(html).toMatch(/>Regions<\/td>/)
    // One event, so its row is singular.
    expect(html).toMatch(/>Event<\/td>/)
    expect(html).toMatch(
      /<a[^>]+href="https:\/\/atlas.test\/berlin"[^>]*>Berlin<\/a><br\/><a[^>]+href="https:\/\/atlas.test\/hamburg"/,
    )
    expect(html).toMatch(/<a[^>]+href="https:\/\/atlas.test\/tuesday"[^>]*>Tuesday Evening Meditation/)
    expect(html).not.toContain('Including the')
  })

  it('says "role" and "responsibility", and names the kind, when there is one of each', async () => {
    const html = await renderEmail(
      createElement(InviteEmail, {
        ...inviteProps,
        grants: [{ locale: 'English', roles: ['Atlas Manager'] }],
        responsibilities: [regions('Berlin')],
      }),
    )

    expect(html).toContain('Your role<')
    expect(html).toContain('Your responsibility<')
    expect(html).toMatch(/>Region<\/td>/)
    expect(html).not.toMatch(/>Regions<\/td>/)
  })

  it('stays plural for two roles in one locale, or two documents of a kind', async () => {
    const html = await renderEmail(
      createElement(InviteEmail, {
        ...inviteProps,
        listsOnlyNew: true,
        grants: [{ locale: 'English', roles: ['Atlas Manager', 'Web Translator'] }],
        responsibilities: [regions('Berlin', 'Hamburg')],
      }),
    )

    expect(html).toContain('Your new roles<')
    expect(html).toContain('Your new responsibilities<')
    expect(html).toMatch(/>Regions<\/td>/)
  })

  it('marks a document with no public page, outside its title', async () => {
    const html = await renderEmail(
      createElement(InviteEmail, {
        ...inviteProps,
        responsibilities: [events({ title: 'Sunday Workshop', url: null })],
      }),
    )

    // A separate, differently styled span, so it cannot read as part of the name.
    expect(html).toMatch(/Sunday Workshop<span[^>]*> \(Not yet public\)<\/span>/)
    expect(html).not.toMatch(/<a[^>]*>Sunday Workshop/)
  })

  it('introduces Sahaj Atlas to a manager meeting it for the first time', async () => {
    const atlas = await renderEmail(
      createElement(InviteEmail, { ...inviteProps, project: 'sahaj-atlas' }),
    )
    const web = await renderEmail(createElement(InviteEmail, inviteProps))

    expect(atlas).toContain(
      'Sahaj Atlas is a worldwide map of free Sahaja Yoga meditation classes.',
    )
    expect(atlas).toContain('local Sahaj websites')
    expect(web).not.toContain('worldwide map')
  })

  it('offers an accepted manager their notification settings, and no confirmation', async () => {
    const settings = 'https://cloud.test/managers/signin?link=SETTINGS'
    const html = await renderEmail(
      createElement(InviteEmail, { ...inviteProps, accepted: true, actionUrl: settings }),
    )

    expect(html).toContain('Configure notifications')
    expect(html).toContain(settings)
    expect(html).not.toContain('Confirm your email')
    expect(html).not.toContain('valid for')
    expect(html).toContain('where you choose which emails you get')
  })

  it('asks for a confirmation that says what it does — and no set-up that is not there', async () => {
    const one = await renderEmail(
      createElement(InviteEmail, { ...inviteProps, responsibilities: [regions('Berlin')] }),
    )
    const none = await renderEmail(createElement(InviteEmail, inviteProps))

    expect(one).toContain('Confirm your email below so you can sign in and keep it up to date')
    expect(none).toContain('Confirm your email below so you can sign in —')
    expect(one).not.toContain('set up your account')
  })

  it('introduces each project to a manager who has not confirmed, and to no one else', async () => {
    const render = (project: 'sahaj-atlas' | 'wemeditate-app' | 'wemeditate-web', accepted = false) =>
      renderEmail(createElement(InviteEmail, { ...inviteProps, accepted, project }))

    expect(await render('wemeditate-web')).toContain('We Meditate is a free website')
    expect(await render('wemeditate-app')).toContain('We Meditate is a free app')
    expect(await render('sahaj-atlas')).toContain('worldwide map')
    expect(await render('sahaj-atlas', true)).not.toContain('worldwide map')
  })
})

describe('inviteHeading', () => {
  const heading = (props: Partial<Parameters<typeof inviteHeading>[0]>) =>
    inviteHeading({ grants: [], responsibilities: [], ...props }, 'Sahaj Atlas')

  it('names a single document outright', () => {
    expect(heading({ responsibilities: [regions('Berlin')] })).toBe(
      "You've been invited to look after Berlin",
    )
  })

  it('counts one kind, and each of several', () => {
    expect(heading({ responsibilities: [regions('Berlin', 'Hamburg')] })).toBe(
      "You've been invited to look after 2 regions",
    )
    expect(
      heading({
        responsibilities: [
          regions('Berlin'),
          events({ title: 'A', url: null }, { title: 'B', url: null }),
        ],
      }),
    ).toBe("You've been invited to look after 1 region and 2 events")
  })

  it('names the role when there is nothing to look after', () => {
    expect(heading({ grants: [{ locale: 'French', roles: ['Web Translator'] }] })).toBe(
      "You've been invited to help as Web Translator",
    )
    expect(
      heading({
        grants: [
          { locale: 'French', roles: ['Web Translator'] },
          { locale: 'English', roles: ['Atlas Manager'] },
        ],
      }),
    ).toBe("You've been invited to help with Sahaj Atlas")
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
  const props = inviteProps

  it('renders a different product name + primary color per project', async () => {
    const web = await renderEmail(
      createElement(InviteEmail, { ...props, project: 'wemeditate-web' }),
    )
    const atlas = await renderEmail(
      createElement(InviteEmail, { ...props, project: 'sahaj-atlas' }),
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
    const html = await renderEmail(createElement(InviteEmail, props))
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

  const answers = [
    { label: 'What went wrong?', value: 'The venue for this class closed last month.' },
    { label: 'Which venue?', value: 'Berlin Mitte' },
  ]

  it('renders every answer under its own label, the sender address, and every detail row', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        answers,
        senderEmail: 'seeker@example.com',
        subject: 'Issue report',
        details,
        brand,
      }),
    )

    expect(html).toContain('Issue report')
    expect(html).toContain('What went wrong?')
    expect(html).toContain('The venue for this class closed last month.')
    expect(html).toContain('Which venue?')
    expect(html).toContain('Berlin Mitte')
    expect(html).toContain('seeker@example.com')
    expect(html).toContain('mailto:seeker@example.com')
    expect(html).toContain('Atlas Widget')
    expect(html).toContain('/events/berlin')
  })

  it('gives no answer its own `Message` heading', async () => {
    // The section is gone: every answer is a sibling row, whatever its field
    // was named. A heading would re-privilege the one key this template used to
    // build its whole body from (#832).
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        answers: [{ label: 'Your message', value: 'Hello.' }],
        subject: 'Issue report',
        details: [],
        brand,
      }),
    )

    expect(html).toContain('Your message')
    expect(html).toContain('Hello.')
    expect(html).not.toContain('>Message<')
  })

  it('renders an answer value as text, never as an anchor', async () => {
    // Submitter-chosen text reaching a renderer. A manager-written row is not
    // URL-scanned at intake (`URL_EXEMPT_KEYS`), so escaping is the only guard.
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        answers: [{ label: 'Details', value: '<script>x</script> see evil.example.com' }],
        subject: 'Issue report',
        details: [],
        brand,
      }),
    )

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="http://evil.example.com"')
    expect(html).toContain('evil.example.com')
  })

  it('says the message is unanswerable when no address was supplied', async () => {
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        answers: [{ label: 'Details', value: 'Something went wrong on the map page.' }],
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
        answers: [{ label: 'What happened?', value: 'A message with no context at all.' }],
        subject: 'Issue report',
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
        answers: [{ label: 'Details', value: 'Branding check message body.' }],
        subject: 'Message',
        details: [],
        brand: getEmailBrand('sahaj-atlas'),
      }),
    )

    expect(html).toContain(getEmailBrand('sahaj-atlas').productName)
  })

  it('previews the longest answer, not the first', async () => {
    // A form's first block is almost always its Email field, so picking by
    // position made every inbox preview the sender's own address — which is
    // already the `Reply-To` and already two lines into the body.
    //
    // `<Preview>` renders nothing at all for an empty string, so the assertion
    // names the preview element: a bare `toContain` would pass on the answer
    // row alone, and would not notice which answer was chosen.
    const html = await renderEmail(
      createElement(UserMessageEmail, {
        answers: [
          { label: 'Your email', value: 'seeker@example.com' },
          { label: 'What went wrong?', value: 'The pin is in the sea.' },
          { label: 'Contact me', value: 'No' },
        ],
        subject: 'Issue report',
        details: [],
        brand,
      }),
    )

    expect(html).toContain('data-skip-in-text="true">The pin is in the sea.')
    expect(html).not.toContain('data-skip-in-text="true">seeker@example.com')
  })
})
