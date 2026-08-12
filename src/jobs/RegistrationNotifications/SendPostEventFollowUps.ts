import type { Payload, PayloadRequest, TaskConfig, Where } from 'payload'

import { createElement } from 'react'

import type { FollowUpSection } from '@/emails/PostEventFollowUpEmail'
import { PostEventFollowUpEmail } from '@/emails/PostEventFollowUpEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { buildFeedbackEmailLink, signFeedbackToken } from '@/lib/registrations/feedbackLinks'
import type { Event, Registration, User } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

const PAGINATION_LIMIT = 200

/**
 * How far back the sweep looks for un-followed-up registrations. Bounds the
 * scan (rows outside the window are never revisited) and keeps the ask timely:
 * a "did it take place?" three months late is noise.
 */
const FOLLOW_UP_WINDOW_DAYS = 30

interface FollowUpResult {
  scanned: number
  sent: number
  failed: number
}

/** The registration's registered-for moment has passed and no follow-up went out. */
function dueWhere(now: Date): Where {
  const windowStart = new Date(now.getTime() - FOLLOW_UP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  return {
    and: [
      { startingAt: { less_than: now.toISOString() } },
      { startingAt: { greater_than: windowStart.toISOString() } },
      { followUpSentAt: { exists: false } },
      { eventFeedback: { exists: false } },
    ],
  }
}

async function sendFollowUp(
  payload: Payload,
  req: PayloadRequest,
  registration: Registration,
  now: Date,
): Promise<boolean> {
  const event = registration.event as Event | number
  const user = registration.user as User | number

  // Depth-1 load below populates both; a bare id means the relation is broken.
  if (typeof event !== 'object' || typeof user !== 'object' || !user.email) return false

  // Today's only follow-up content is the feedback ask, which applies solely
  // to unverified, still-published events. Anything else has no sections →
  // nothing to send; leave the ledger unstamped so future follow-up types can
  // still reach these registrations.
  const sections: FollowUpSection[] = []
  if (event.verificationStage === 'unverified' && event._status === 'published') {
    const token = signFeedbackToken({ registrationId: registration.id }, payload.secret, now)
    sections.push({
      type: 'feedback-ask',
      confirmUrl: buildFeedbackEmailLink(token, 'confirmed'),
      denyUrl: buildFeedbackEmailLink(token, 'denied'),
    })
  }
  if (sections.length === 0) return false

  const brand = getEmailBrand('sahaj-atlas')
  await payload.sendEmail({
    to: user.email,
    from: `${brand.productName} <${CONTACT_EMAIL}>`,
    subject: `Did “${typeof event.title === 'string' ? event.title : 'your class'}” take place?`,
    html: await renderEmail(
      createElement(PostEventFollowUpEmail, {
        brand,
        registrantName: user.name || 'there',
        eventTitle: typeof event.title === 'string' ? event.title : 'your class',
        sections,
      }),
    ),
  })

  await payload.update({
    collection: 'registrations',
    id: registration.id,
    data: { followUpSentAt: now.toISOString() },
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req,
  })
  return true
}

/**
 * Post-event follow-up sweep: emails each registrant whose registered-for
 * occurrence has passed (within the 30-day window) exactly once — the
 * `followUpSentAt` stamp is the ledger, written only after a successful send
 * so a failed transport retries next run. Today's content is the confirm/deny
 * ask for unverified listings; the email's `sections` are the extension point
 * for future follow-ups (feedback forms, event promotion).
 */
export const SendPostEventFollowUps: TaskConfig<'sendPostEventFollowUps'> = {
  slug: 'sendPostEventFollowUps',
  label: 'Send Post-Event Follow-Ups',
  retries: 1,
  concurrency: {
    key: () => 'sendPostEventFollowUps',
    exclusive: true,
  },
  outputSchema: [
    { name: 'scanned', type: 'number', required: true },
    { name: 'sent', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 3 * * *', // daily at 03:00 UTC (after the ExpireEvents sweep)
      queue: 'nightly',
    },
  ],
  handler: async ({ req }) => {
    const payload = req.payload
    // Injectable clock for the window tests (capture AFTER setup — see the
    // window-job testing note in the repo memory/rules).
    const now =
      typeof req.context?.runStart === 'string' ? new Date(req.context.runStart) : new Date()
    const result: FollowUpResult = { scanned: 0, sent: 0, failed: 0 }

    let page = 1
    let hasNextPage = true
    const dueIds: number[] = []
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'registrations',
        where: dueWhere(now),
        depth: 0,
        limit: PAGINATION_LIMIT,
        page,
        overrideAccess: true,
        req,
      })
      dueIds.push(...batch.docs.map((doc) => doc.id))
      hasNextPage = batch.hasNextPage
      page++
    }

    for (const id of dueIds) {
      result.scanned++
      try {
        const registration = (await payload.findByID({
          collection: 'registrations',
          id,
          depth: 1,
          overrideAccess: true,
          req,
        })) as Registration
        if (await sendFollowUp(payload, req, registration, now)) result.sent++
      } catch (error) {
        result.failed++
        req.payload.logger.warn({
          msg: 'SendPostEventFollowUps: per-registration failure — continuing',
          registrationId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    req.payload.logger.info({ msg: 'SendPostEventFollowUps complete', ...result })
    return { output: result }
  },
}
