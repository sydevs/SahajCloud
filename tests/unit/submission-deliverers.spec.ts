import { describe, expect, it } from 'vitest'

import { SUBMISSION_TYPES } from '@/collections/UserSubmissions/fields'
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
      expect(typeof DELIVERERS[type], `${type} should have a deliverer`).toBe('function')
    }
  })
})

/**
 * What a successful delivery leaves the row at — `accepted` for three of the
 * four intakes, and `pending` for the one whose delivery decides nothing.
 *
 * ⚠ **A proposal's delivery only emails a reviewer.** Settling it `accepted`
 * hid the review buttons on every proposal whose notification sent, and since
 * #909 put the accept on that same transition it would create the event nobody
 * approved. `deliverProposal` is the one row that answers `nextStatus`, and
 * `DeliverSubmissions` is what honours it.
 */
describe('what a delivered row becomes', () => {
  const proposal = {
    id: 3,
    type: 'proposal',
    senderEmail: 'aria@example.com',
    proposed: { eventType: 'offline' },
    submissionData: [],
  } as unknown as UserSubmission

  it('leaves a delivered proposal open for its reviewer', async () => {
    const { payload, sendEmail } = stubEmailPayload()

    const outcome = await DELIVERERS.proposal({
      req: { payload } as never,
      submission: proposal,
    })

    expect(sendEmail).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({ ok: true, nextStatus: 'pending' })
  })

  it('names no status on a delivery that settles the row', async () => {
    // The default the task applies is `accepted`, so a deliverer that decides
    // the outcome itself says nothing — only the open case is declared.
    const { payload } = stubEmailPayload()

    const outcome = await DELIVERERS.contact({
      req: { payload } as never,
      submission: {
        id: 4,
        type: 'contact',
        senderEmail: 'aria@example.com',
        submissionData: [{ field: 'message', value: 'Hello' }],
      } as unknown as UserSubmission,
    })

    expect(outcome).toMatchObject({ ok: true })
    expect(outcome).not.toHaveProperty('nextStatus')
  })
})
