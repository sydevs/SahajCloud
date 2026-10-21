import { describe, expect, it } from 'vitest'

import { SUBMISSION_TYPES } from '@/collections/UserSubmissions/fields'
import { OPEN_REVIEW_STATUSES } from '@/collections/UserSubmissions/statuses'
import { DELIVERERS } from '@/jobs/DeliverSubmissions/deliverers'
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
