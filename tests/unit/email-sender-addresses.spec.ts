/**
 * Which envelope `From` each transactional sender uses.
 *
 * The addresses diverge by **audience**, and the `to:` of each send is what
 * decides it: registrant mail goes out as `USER_EMAIL_FROM`, manager and
 * reviewer mail as `MANAGER_EMAIL_FROM` (#790). Nothing else in the message
 * carries that distinction, so a repoint to the wrong constant is invisible
 * outside a header — hence a spec per sender rather than a shared helper.
 *
 * Pure: `payload` is a stub, so there is no bootstrap, no DB and no SMTP.
 * `findGlobal` rejects on purpose — `resolveEmailStrings` then falls back to
 * the English defaults, which is all these assertions need.
 */
import { describe, expect, it, vi } from 'vitest'

import { MANAGER_EMAIL_FROM, USER_EMAIL_FROM } from '@/lib/contact'
import type { Event } from '@/payload-types'

type SentMessage = { to: string; from: string; subject: string }

/**
 * A stub `payload`. `secret` is a real-length string because
 * `signUnsubscribeToken` derives a key from it.
 */
function fakePayload() {
  const sendEmail = vi.fn(async (_message: SentMessage) => undefined)
  const payload = {
    sendEmail,
    findGlobal: vi.fn(async () => {
      throw new Error('no translations global in the unit lane')
    }),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    secret: 'test-secret-key-with-32-chars-minimum',
  }
  return { payload: payload as never, sendEmail }
}

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

const REGISTRANT = 'seeker@example.com'
const MANAGER = 'manager@example.org'

/** The address inside a `Name <addr>` header. */
function envelope(from: string): string {
  return from.replace(/^.*</, '').replace(/>$/, '')
}

describe('registrant-facing mail sends as USER_EMAIL_FROM', () => {
  it('sends the registration confirmation from the user address', async () => {
    const { sendRegistrationConfirmation } = await import(
      '@/lib/notifications/sendRegistrationConfirmation'
    )
    const { payload, sendEmail } = fakePayload()

    await sendRegistrationConfirmation({
      payload,
      event,
      registrantName: 'Asha',
      registrantEmail: REGISTRANT,
    })

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(REGISTRANT)
    expect(envelope(message.from)).toBe(USER_EMAIL_FROM)
  })

  it('sends the session reminder from the user address', async () => {
    const { sendSessionReminder } = await import(
      '@/jobs/RegistrationNotifications/sendSessionReminder'
    )
    const { payload, sendEmail } = fakePayload()

    await sendSessionReminder({
      payload,
      event,
      registrantName: 'Asha',
      registrantEmail: REGISTRANT,
      submissionId: 12,
      occurrenceIso: '2026-06-20T03:56:00.000Z',
    })

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(REGISTRANT)
    expect(envelope(message.from)).toBe(USER_EMAIL_FROM)
  })
})

describe('manager-facing mail sends as MANAGER_EMAIL_FROM', () => {
  const recipient = {
    destination: MANAGER,
    name: 'Ravi',
    channel: 'email' as const,
    frequency: 'immediate',
  }

  it('sends the new-registration notice from the manager address', async () => {
    const { sendRegistrationNotification } = await import(
      '@/lib/notifications/sendRegistrationNotification'
    )
    const { payload, sendEmail } = fakePayload()

    await sendRegistrationNotification({
      payload,
      recipient,
      event: { id: event.id, title: event.title },
      registrantName: 'Asha',
      registrantEmail: REGISTRANT,
    })

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(MANAGER)
    expect(envelope(message.from)).toBe(MANAGER_EMAIL_FROM)
  })

  it('sends the registration digest from the manager address', async () => {
    const { sendRegistrationDigest } = await import(
      '@/jobs/RegistrationNotifications/sendRegistrationDigest'
    )
    const { payload, sendEmail } = fakePayload()

    await sendRegistrationDigest({
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
    })

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(MANAGER)
    expect(envelope(message.from)).toBe(MANAGER_EMAIL_FROM)
  })

  it('sends the submission-review request from the manager address', async () => {
    const { sendSubmissionReview } = await import('@/lib/notifications/sendSubmissionReview')
    const { payload, sendEmail } = fakePayload()

    await sendSubmissionReview({
      payload,
      to: MANAGER,
      kind: 'new-event',
      submitterName: 'Asha',
      details: [],
      reviewUrl: 'https://cloud.example.org/admin/collections/user-submissions/3',
    })

    const message = sendEmail.mock.calls[0][0]
    expect(message.to).toBe(MANAGER)
    expect(envelope(message.from)).toBe(MANAGER_EMAIL_FROM)
  })
})

describe('the two constants', () => {
  it('differ, so a single-constant regression cannot pass the specs above', () => {
    // Every assertion here compares against a constant rather than a literal, so
    // it would stay green if both resolved to the same address.
    expect(USER_EMAIL_FROM).not.toBe(MANAGER_EMAIL_FROM)
  })
})
