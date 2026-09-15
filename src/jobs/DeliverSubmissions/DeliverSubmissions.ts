import type { DeliveryContext, DeliveryOutcome } from './types'
import type { TaskConfig } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import type { UserSubmission } from '@/payload-types'

import { deliverContact } from './deliverContact'
import { deliverProposal } from './deliverProposal'
import { deliverRegistration } from './deliverRegistration'
import { deliverSubscribe } from './deliverSubscribe'

/** How many attempts a retryable failure gets, beyond the first. */
const RETRIES = 3

/** One delivery per type. The dispatch is the whole of this table. */
const DELIVERERS: Record<
  UserSubmission['type'],
  (context: DeliveryContext) => Promise<DeliveryOutcome>
> = {
  contact: deliverContact,
  subscribe: deliverSubscribe,
  registration: deliverRegistration,
  proposal: deliverProposal,
}

/**
 * Deliver one screened submission, and record the attempt whatever it produced.
 *
 * Queued by `ScreenSubmissions` after a clean verdict, never by the intake —
 * which is the ordering the whole pipeline turns on: **a submission failing
 * screening never reaches a recipient, a provider or a manager.** For a
 * subscribe row that also protects a real list's quota and a sender's
 * reputation, which is spent on every address pushed to it.
 *
 * Three things every delivery gets, that the three collections being replaced
 * each had to arrange for themselves:
 *
 * - **an `activityLog` entry per attempt**, success or failure, so "why did
 *   this never arrive" is answerable from the document rather than from a log
 *   aggregator;
 * - **retries** on a failure that could plausibly go differently, and none on
 *   one that could not — see `DeliveryOutcome.retryable`;
 * - **a `failed` status that is not terminal.** It means the decision went fine
 *   and the delivery did not, which is the one state nobody else would notice.
 *
 * ⚠ **The row is marked before the throw**, so an admin sees `failed` *now*
 * while the throw still earns the retry. The job runner hands each task an
 * isolated `transactionID`, so the write commits on its own rather than rolling
 * back with the throw.
 */
export const DeliverSubmissions: TaskConfig<'deliverSubmission'> = {
  slug: 'deliverSubmission',
  label: 'Deliver Submission',
  retries: RETRIES,
  inputSchema: [{ name: 'submissionId', type: 'number', required: true }],
  outputSchema: [{ name: 'status', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const now = new Date()
    const submissionId = Number(input.submissionId)

    const submission = (await payload.findByID({
      collection: 'user-submissions',
      id: submissionId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as UserSubmission

    // `pending` is a first attempt; `failed` is a retry of one. Anything else
    // is settled — a manager decided, or screening refused it — and delivering
    // it now would send an email about a decision already taken.
    if (submission.status !== 'pending' && submission.status !== 'failed') {
      return { output: { status: submission.status } }
    }

    const outcome = await DELIVERERS[submission.type]({ req, submission })

    const entry: Record<string, string> = outcome.ok
      ? {
          activity: outcome.detail ? `Delivered (${outcome.detail})` : 'Delivered',
          sentTo: outcome.sentTo,
        }
      : { activity: `Delivery failed: ${outcome.detail}` }

    await payload.update({
      collection: 'user-submissions',
      id: submissionId,
      data: {
        status: outcome.ok ? ('accepted' as const) : ('failed' as const),
        activityLog: appendLogEntry(asLog(submission.activityLog), {
          at: now.toISOString(),
          type: 'delivery',
          // Every attempt is its own entry, so the key is the timestamp rather
          // than a constant: an exactly-once key here would collapse three
          // retries into one line and hide the two that failed.
          key: now.toISOString(),
          ok: outcome.ok,
          ...(outcome.ok ? {} : { retryable: outcome.retryable }),
          cells: entry,
        }),
      },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })

    if (outcome.ok) return { output: { status: 'accepted' } }

    if (!outcome.retryable) {
      // Terminal. Logged rather than thrown: throwing would spend three more
      // attempts reaching the identical answer, and bury the real cause under
      // two more copies of it.
      payload.logger.error({
        msg: 'DeliverSubmissions: delivery refused, and retrying would not help',
        submissionId,
        type: submission.type,
        detail: outcome.detail,
      })
      return { output: { status: 'failed' } }
    }

    // The row already says `failed`, so the throw costs nothing an admin can
    // see — it buys the retry.
    throw new Error(`Delivery of submission ${submissionId} failed: ${outcome.detail}`)
  },
}
