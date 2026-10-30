
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { RefusedRegistrationDigestEmailProps } from '@/emails/RefusedRegistrationDigestEmail'
import {
  RefusedRegistrationDigestEmail,
  refusedRegistrationDigestText,
} from '@/emails/RefusedRegistrationDigestEmail'
import { dueDigestPeriod } from '@/jobs/RegistrationNotifications/digestCadence'
import { renderEmail } from '@/plugins/email'

const props: RefusedRegistrationDigestEmailProps = {
  recipientName: 'Ada',
  period: 'day',
  total: 30,
  listUrl: 'https://cloud.example/admin/collections/registration-refusals',
  groups: [
    {
      eventTitle: 'Tuesday Meditation',
      eventAdminUrl: 'https://cloud.example/admin/collections/events/7',
      atRequest: [{ reason: 'The captcha check failed', count: 3 }],
      atScreening: [
        {
          name: 'Kept Visitor',
          email: 'kept@example.com',
          reason: 'A disposable email address',
          submissionAdminUrl: 'https://cloud.example/admin/collections/user-submissions/9',
        },
        {
          name: 'A sign-up that has since been deleted',
          email: '',
          reason: 'A disposable email address',
          submissionAdminUrl: null,
        },
      ],
      moreAtScreening: 25,
    },
    {
      eventTitle: 'A class that has since been deleted',
      eventAdminUrl: null,
      atRequest: [{ reason: 'A link in one of the answers', count: 1 }],
      atScreening: [],
      moreAtScreening: 0,
    },
  ],
}

describe('RefusedRegistrationDigestEmail', () => {
  it('counts the form refusals, lists the screened ones, and links only what still exists', async () => {
    const html = await renderEmail(createElement(RefusedRegistrationDigestEmail, props))

    expect(html).toContain('30 class sign-ups')
    expect(html).toContain('Tuesday Meditation')
    expect(html).toContain('The captcha check failed')
    expect(html).toContain('mailto:kept@example.com')
    expect(html).toContain('user-submissions/9')
    expect(html).toContain('and <!-- -->25<!-- --> more')
    expect(html).not.toContain('mailto:"')
    // One "View class" link, for the class that still exists.
    expect(html.match(/View class/g)).toHaveLength(1)
  })

  it('carries the same content in its plain-text part', () => {
    const text = refusedRegistrationDigestText(props)

    expect(text).toContain('The spam check refused 30 class sign-ups in the last day.')
    expect(text).toContain('- 3× The captcha check failed')
    expect(text).toContain('- Kept Visitor — kept@example.com: A disposable email address')
    expect(text).toContain('- …and 25 more.')
    expect(text).toContain(
      'See every refused sign-up: https://cloud.example/admin/collections/registration-refusals',
    )
  })
})

describe('dueDigestPeriod', () => {
  const monday = new Date('2026-11-02T07:00:00.000Z')
  const tuesday = new Date('2026-11-03T07:00:00.000Z')

  it('serves a daily summary every run, and a weekly one on Monday only', () => {
    expect(dueDigestPeriod('Daily Summary', tuesday)?.period).toBe('day')
    expect(dueDigestPeriod('Weekly Summary', tuesday)).toBeNull()
    expect(dueDigestPeriod('Weekly Summary', monday)?.period).toBe('week')
  })

  it('serves nothing for any other cadence', () => {
    for (const frequency of ['Never', 'Immediate', undefined]) {
      expect(dueDigestPeriod(frequency, monday)).toBeNull()
    }
  })
})
