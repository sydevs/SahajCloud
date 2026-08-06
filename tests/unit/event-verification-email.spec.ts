import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  EventVerificationEmail,
  type EventDetails,
  type EventListingProgress,
  type EventManagerContact,
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

/**
 * The section's fingerprint. Asserted instead of a heading string because
 * headings get reworded — and a reworded heading silently turns every
 * "section is absent" assertion into a vacuous pass.
 */
const PROGRESS_CAPTION = /\d+ of \d+ complete/

const check = (key: string) => EVENT_QUALITY_CHECK_METADATA[key]

/** Built the way the job builds it — labels resolved from the check registry. */
const listingProgress: EventListingProgress = {
  open: [
    {
      key: 'description.missing',
      label: check('description.missing').label,
      detail: check('description.missing').description,
    },
    {
      key: 'images.insufficient',
      label: check('images.insufficient').label,
      detail: 'Only one photo so far.',
    },
  ],
  done: [{ key: 'title.quality', label: check('title.quality').passedLabel }],
  resolved: 1,
  total: 3,
}

/**
 * Every check passing — the state that earns the completion note. Note the
 * absence of `description.missing`: once `description.quality` passes it
 * supersedes it, so a real report never carries both.
 */
const completeProgress: EventListingProgress = {
  open: [],
  done: [
    { key: 'description.quality', label: check('description.quality').passedLabel },
    { key: 'title.quality', label: check('title.quality').passedLabel },
    { key: 'images.insufficient', label: check('images.insufficient').passedLabel },
  ],
  resolved: 3,
  total: 3,
}

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

  describe('listing progress', () => {
    it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
      'renders every open recommendation in the %s reminder',
      async (level) => {
        const html = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level, listingProgress }),
        )
        expect(html).toMatch(PROGRESS_CAPTION)
        for (const suggestion of listingProgress.open) {
          expect(html).toContain(suggestion.label)
          expect(html).toContain(suggestion.detail)
        }
      },
    )

    it('takes its wording from the check registry, not the template', async () => {
      // The one source of truth with the admin panel: nothing here is spelled
      // out in the template, so re-wording `copy.ts` re-words the email too.
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', listingProgress }),
      )
      expect(html).toContain(check('description.missing').label)
      expect(html).toContain(check('description.missing').description)
    })

    it('says the suggestions are optional, so the email stays a nudge', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', listingProgress }),
      )
      expect(html).toContain('don’t affect verification')
    })

    it('states how far along the listing is', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', listingProgress }),
      )
      expect(html).toContain('1 of 3 complete')
    })

    it('draws the bar filled to the resolved share', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: { ...listingProgress, resolved: 1, total: 4 },
        }),
      )
      // A real filled cell, not a styled div — Outlook drops div backgrounds.
      expect(html).toMatch(/width:\s*25%/)
      expect(html).toMatch(/width:\s*75%/)
    })

    it('names what already passes, worded as a state not an instruction', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', listingProgress }),
      )
      expect(html).toContain('Already done')
      expect(html).toContain(check('title.quality').passedLabel)
      // The imperative must not appear beside a tick.
      expect(html).not.toContain(check('title.quality').label)
    })

    it('celebrates a complete listing instead of listing nothing', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: completeProgress,
        }),
      )
      expect(html).toContain('Your listing is complete')
      expect(html).toContain('nothing left to improve')
      // Names every check it passed, so "complete" is backed by specifics.
      for (const item of completeProgress.done) {
        expect(html).toContain(item.label)
      }
      // No open items, so no "here's what to do next" framing…
      expect(html).not.toContain('don’t affect verification')
      // …and no separator heading: the one-line intro introduces the ticks.
      expect(html).not.toContain('Already done')
    })

    it('drops the progress bar once the listing is complete', async () => {
      // A full-width bar would only restate the word "complete", and the ticks
      // already name every check it would have counted.
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: completeProgress,
        }),
      )
      expect(html).not.toMatch(PROGRESS_CAPTION)
      expect(html).not.toMatch(/width:\s*100%;background-color/)
    })

    it('runs the complete heading and its line together, not stacked', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: completeProgress,
        }),
      )
      // One sentence: "<strong>Your listing is complete</strong> — nothing …".
      expect(html).toMatch(/Your listing is complete<\/strong>[^<]*—/)
    })

    it('does not tell a complete listing to improve itself', async () => {
      // The heading swaps with the state: "Improve your listing" sitting
      // directly above "Nothing left to improve" contradicts itself.
      const open = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due', listingProgress }),
      )
      const complete = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: completeProgress,
        }),
      )
      expect(open).toMatch(/Improve your listing/i)
      expect(complete).not.toMatch(/Improve your listing/i)
    })

    it.each(['due', 'escalated', 'urgent', 'expired'] as const)(
      'renders the %s email byte-identically when the listing was never checked',
      async (level) => {
        // The skipped case (unpublished / finished / expired / trashed): the
        // section is absent entirely, exactly as before #611. A *complete*
        // listing is deliberately not this case — it gets the note above.
        const untouched = await renderEmail(
          createElement(EventVerificationEmail, { ...baseProps, level }),
        )
        const absent = await renderEmail(
          createElement(EventVerificationEmail, {
            ...baseProps,
            level,
            listingProgress: undefined,
          }),
        )

        expect(absent).toBe(untouched)
        expect(untouched).not.toMatch(PROGRESS_CAPTION)
      },
    )

    it('suppresses the section when every check bowed out', async () => {
      // `total: 0` would render "0 of 0 complete" over an empty bar — there is
      // nothing to be a fraction of. Asserted as byte-identity against the
      // never-checked render rather than "no caption appears": the complete
      // state has no caption either, so that alone wouldn't tell the two apart.
      const empty = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'due',
          listingProgress: { open: [], done: [], resolved: 0, total: 0 },
        }),
      )
      const neverChecked = await renderEmail(
        createElement(EventVerificationEmail, { ...baseProps, level: 'due' }),
      )
      expect(empty).toBe(neverChecked)
    })

    it('omits it from region-manager mail — they can’t act on the listing', async () => {
      const html = await renderEmail(
        createElement(EventVerificationEmail, {
          ...baseProps,
          level: 'escalated',
          audience: 'region',
          regionName: 'Maharashtra',
          eventManager,
          listingProgress,
        }),
      )
      expect(html).not.toMatch(PROGRESS_CAPTION)
      expect(html).not.toContain(listingProgress.open[0].label)
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
