import { describe, expect, it } from 'vitest'

import { SUBMISSION_TYPES } from '@/collections/UserSubmissions/fields'
import { OPEN_REVIEW_STATUSES } from '@/collections/UserSubmissions/statuses'
import { DELIVERERS } from '@/jobs/DeliverSubmissions/deliverers'
import { REGISTRATION_UPDATE_LOG_TYPE } from '@/lib/registrations/activityLog'
import type { UserSubmission } from '@/payload-types'

import { stubEmailPayload } from '../utils/sendEmailStub'

/**
 * The delivery registry is total over the submission types.
 *
 * `DeliveryRegistry` already keys on the generated `UserSubmission['type']`
 * union, so a missing deliverer is normally a compile error — this covers the
 * window where it is not. `SUBMISSION_TYPES` is what *generates* that union, so
 * between adding an option there and running `pnpm generate:types` the union is
 * stale, the `Record` is satisfied, and `DELIVERERS[submission.type]` would be
 * `undefined` at runtime: a `TypeError` in a job with no caller watching, on a
 * row that already passed screening.
 *
 * Both directions are asserted. A stale row the other way — a deliverer for a
 * type the collection no longer offers — is dead code the type checker cannot
 * see either, since an extra key satisfies the `Record` just as happily.
 */
describe('DELIVERERS', () => {
  it('has exactly one deliverer per submission type', () => {
    expect(Object.keys(DELIVERERS).sort()).toEqual([...SUBMISSION_TYPES].sort())
  })

  it('maps every type to a callable', () => {
    for (const type of SUBMISSION_TYPES) {
      expect(typeof DELIVERERS[type].deliver, `${type} should have a deliverer`).toBe('function')
    }
  })
})

/**
 * What a successful delivery leaves the row at.
 *
 * ⚠ **A proposal's delivery only emails a reviewer**, so that row stays
 * `pending` for them to decide on. Settling it `accepted` hid the review
 * buttons on every proposal whose notification sent, and since #909 put the
 * accept on that same transition it would create the event nobody approved.
 *
 * Pinned against `OPEN_REVIEW_STATUSES` rather than the literal `pending`: the
 * point is that a delivered proposal is still open for review, so the day that
 * set changes this reads the new answer instead of the old one.
 */
describe('deliveredStatus', () => {
  it('leaves a delivered proposal open for review', () => {
    expect(OPEN_REVIEW_STATUSES).toContain(DELIVERERS.proposal.deliveredStatus)
  })

  it.each(['contact', 'subscribe', 'registration'] as const)(
    'settles a delivered %s row',
    (type) => {
      expect(DELIVERERS[type].deliveredStatus).toBe('accepted')
    },
  )
})

/**
 * The manager notice's wording, decided from the row's own activity log.
 *
 * ⚠ **The fixture event carries `registrationNotificationEmail`**, so
 * `resolveRegistrationRecipient` takes the override-address branch and never
 * reads a manager — the one routing shape reachable with no `managers` row to
 * stub. Verified against `src/collections/Events/Events.ts`, which declares
 * that address beside its `Immediate` cadence.
 *
 * The registrant's confirmation goes out first, so the manager's notice is the
 * last send.
 */
describe('deliverRegistration', () => {
  const EVENT = {
    id: 42,
    title: 'Tuesday Evening Meditation',
    eventType: 'offline',
    registrationNotificationEmail: 'events-team@example.org',
    registrationNotificationFrequency: 'Immediate',
    schedule: { firstDate: '2027-01-06T10:00:00.000Z', firstDate_tz: 'Europe/London' },
  }

  const deliver = async (activityLog: unknown[]) => {
    const { payload, sendEmail } = stubEmailPayload()
    const req = {
      payload: Object.assign(payload, { findByID: async () => EVENT }),
    }

    const outcome = await DELIVERERS.registration.deliver({
      req: req as never,
      submission: {
        id: 7,
        type: 'registration',
        senderEmail: 'sam@example.com',
        event: EVENT.id,
        uuid: 'f0e1d2c3-b4a5-4968-8778-695a4b3c2d1e',
        startingAt: '2027-01-13T10:00:00.000Z',
        submissionData: [{ field: 'name', value: 'Sam Seeker' }],
        activityLog,
      } as unknown as UserSubmission,
    })

    expect(outcome).toMatchObject({ ok: true })
    const managerMessage = sendEmail.mock.calls.at(-1)![0]
    expect(managerMessage.to).toBe(EVENT.registrationNotificationEmail)
    return managerMessage
  }

  it('words a first signup as a new registration', async () => {
    const { subject, html } = await deliver([])

    expect(subject).toBe('New registration: Tuesday Evening Meditation')
    expect(html).toContain('New event registration')
  })

  /**
   * The discriminator is the entry `mergeRepeatRegistration` appends when it
   * folds a repeat signup into the row the sender already held. The merge also
   * puts that row back to `pending`, which is what re-queues this delivery.
   */
  it('words a repeat signup as an update', async () => {
    const { subject, html } = await deliver([
      {
        at: '2026-11-10T09:00:00.000Z',
        type: REGISTRATION_UPDATE_LOG_TYPE,
        key: '2026-11-10T09:00:00.000Z',
        cells: { activity: { text: 'Registered again — details updated' } },
      },
    ])

    expect(subject).toBe('Updated registration: Tuesday Evening Meditation')
    expect(html).toContain('Updated event registration')
  })

  /**
   * ⚠ **A `delivery` entry is not an update.** `DeliverSubmissions` logs one
   * per attempt, failures included, so a retried first registration carries
   * one — and reading "has this been delivered" rather than "has this been
   * merged" would announce a brand-new signup as an update.
   */
  it('words a retried first signup as a new registration', async () => {
    const { subject } = await deliver([
      {
        at: '2026-11-10T09:00:00.000Z',
        type: 'delivery',
        key: '2026-11-10T09:00:00.000Z',
        ok: false,
        cells: { activity: { text: 'Delivery failed: smtp timeout' } },
      },
    ])

    expect(subject).toBe('New registration: Tuesday Evening Meditation')
  })
})

/**
 * The one deliverer whose success does not settle its row, driven for real —
 * so the registry entry above is pinned to a deliverer that genuinely sends.
 */
describe('deliverProposal', () => {
  it('emails a reviewer and reports success', async () => {
    const { payload, sendEmail } = stubEmailPayload()

    const outcome = await DELIVERERS.proposal.deliver({
      req: { payload } as never,
      submission: {
        id: 3,
        type: 'proposal',
        senderEmail: 'aria@example.com',
        proposed: { eventType: 'offline' },
        submissionData: [],
      } as unknown as UserSubmission,
    })

    expect(sendEmail).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({ ok: true })
  })
})
