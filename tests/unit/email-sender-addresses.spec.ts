/**
 * Which envelope `From` each transactional sender uses.
 *
 * The addresses diverge by **audience**, and the `to:` of each send decides it:
 * registrant mail goes out as `USER_EMAIL_FROM`, manager and reviewer mail as
 * `MANAGER_EMAIL_FROM` (#790). Nothing in the body carries that distinction, so
 * a sender repointed at the wrong constant is invisible outside a header —
 * every row below therefore asserts the recipient beside the sender, since the
 * recipient is the reason the sender is what it is.
 */
import type { Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import { sendRegistrationDigest } from '@/jobs/RegistrationNotifications/sendRegistrationDigest'
import { sendSessionReminder } from '@/jobs/RegistrationNotifications/sendSessionReminder'
import { sendRegistrationConfirmation } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendRegistrationNotification } from '@/lib/notifications/sendRegistrationNotification'
import { sendSubmissionReview } from '@/lib/notifications/sendSubmissionReview'
import type { Event } from '@/payload-types'
import { MANAGER_EMAIL_FROM, USER_EMAIL_FROM } from '@/plugins/email'

import { stubEmailPayload } from '../utils/sendEmailStub'

const REGISTRANT = 'seeker@example.com'
const MANAGER = 'manager@example.org'

const event = {
  id: 7,
  title: 'Sunday meditation',
  schedule: {
    firstDate: '2026-06-13T03:56:00.000Z',
    firstDate_tz: 'Asia/Calcutta',
    interval: 1,
    recurrenceType: 'WEEKLY',
    weekdays: ['SA'],
  },
} as unknown as Event

const recipient = {
  destination: MANAGER,
  name: 'Ravi',
  channel: 'email' as const,
  frequency: 'immediate',
}

const CASES: { label: string; to: string; from: string; send: (payload: Payload) => Promise<void> }[] =
  [
    {
      label: 'registration confirmation',
      to: REGISTRANT,
      from: USER_EMAIL_FROM,
      send: (payload) =>
        sendRegistrationConfirmation({
          payload,
          event,
          registrantName: 'Asha',
          registrantEmail: REGISTRANT,
        }),
    },
    {
      label: 'session reminder',
      to: REGISTRANT,
      from: USER_EMAIL_FROM,
      send: (payload) =>
        sendSessionReminder({
          payload,
          event,
          registrantName: 'Asha',
          registrantEmail: REGISTRANT,
          submissionId: 12,
          occurrenceIso: '2026-06-20T03:56:00.000Z',
        }),
    },
    {
      label: 'new-registration notice',
      to: MANAGER,
      from: MANAGER_EMAIL_FROM,
      send: (payload) =>
        sendRegistrationNotification({
          payload,
          recipient,
          event: { id: event.id, title: event.title },
          registrantName: 'Asha',
          registrantEmail: REGISTRANT,
        }),
    },
    {
      label: 'registration digest',
      to: MANAGER,
      from: MANAGER_EMAIL_FROM,
      send: (payload) =>
        sendRegistrationDigest({
          payload,
          recipient,
          period: 'day',
          groups: [
            {
              eventTitle: 'Sunday meditation',
              eventAdminUrl: 'https://cloud.example.org/admin/collections/events/7',
              registrations: [{ registrantName: 'Asha', registrantEmail: REGISTRANT }],
            },
          ],
        }),
    },
    {
      label: 'submission-review request',
      to: MANAGER,
      from: MANAGER_EMAIL_FROM,
      send: (payload) =>
        sendSubmissionReview({
          payload,
          to: MANAGER,
          kind: 'new-event',
          submitterName: 'Asha',
          details: [],
          reviewUrl: 'https://cloud.example.org/admin/collections/user-submissions/3',
        }),
    },
  ]

describe('transactional senders pick their envelope by audience', () => {
  it.each(CASES)('$label → $to, sent as $from', async ({ to, from, send }) => {
    const { payload, sendEmail } = stubEmailPayload()

    await send(payload)

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(to)
    // The angle brackets pin the address to the envelope rather than the display
    // name, which also carries a brand string.
    expect(message.from).toContain(`<${from}>`)
  })

  it('uses two different addresses, so no row above can pass vacuously', () => {
    // Every assertion in this file compares a constant against a constant, and
    // would stay green if the split collapsed back to one address.
    expect(USER_EMAIL_FROM).not.toBe(MANAGER_EMAIL_FROM)
  })
})
