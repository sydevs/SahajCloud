import type { DeliveryContext, DeliveryOutcome } from './types'

import * as Sentry from '@sentry/nextjs'

import { submissionRoutingRegionId } from '@/collections/UserSubmissions/lifecycle/mergeProposal'
import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { notificationFrequency } from '@/components/admin/NotificationPreferences/config'
import { CONTACT_EMAIL } from '@/lib/contact'
import { findManagerForRegion } from '@/lib/notifications/recipients'
import { sendSubmissionReview } from '@/lib/notifications/sendSubmissionReview'
import { adminDocUrl } from '@/lib/utilities/adminUrl'
import { relationId } from '@/lib/utilities/relationId'

/**
 * Deliver a proposal: email the responsible manager that there is something to
 * review.
 *
 * **Routing is the target event's manager, then its region chain, then the
 * system contact.** An update proposal names an event, so its owner is the
 * person to ask; a managerless (unverified) target escalates up the region
 * chain.
 *
 * A brand-new-event proposal routes up the chain of the region intake placed
 * it in (`resolveProposalRegion`, #1021): its city, else the state or country
 * when the city is not on the atlas yet. Only a proposal placed nowhere falls
 * to the system contact.
 */
export async function deliverProposal({
  req,
  submission,
}: DeliveryContext): Promise<DeliveryOutcome> {
  const eventId = relationId(submission.event)
  const target = eventId != null ? await loadTarget(req, eventId) : null
  const recipient = target
    ? await routeTo(req, target)
    : await managerUpChain(req, submissionRoutingRegionId(submission))

  if (!recipient) {
    // Not a note on the row: who received the email is our problem, and the
    // person reading the row is by definition the person reviewing it.
    Sentry.captureMessage('deliverProposal: no manager to notify', {
      extra: { submissionId: submission.id, eventId },
    })
  }

  const to = recipient?.email ?? CONTACT_EMAIL

  // The recipient's own pace decides whether this one sends now. Anything but
  // Immediate means the morning digest carries it instead — so routing stays
  // exactly as it was, and only the moment of delivery moves.
  if (recipient && !isImmediate(recipient.pace)) {
    req.payload.logger.info({
      msg: 'deliverProposal: deferred to the digest',
      pace: recipient.pace,
      submissionId: submission.id,
      to,
    })
    return { ok: true, sentTo: `${to} (in their ${recipient.pace.toLowerCase()} digest)` }
  }

  try {
    await sendSubmissionReview({
      payload: req.payload,
      to,
      recipientName: recipient?.name ?? null,
      kind: eventId != null ? 'event-update' : 'new-event',
      eventTitle: target?.title ?? null,
      submitterName: readSubmissionValue(submission.submissionData, 'name') ?? 'A visitor',
      submitterNote: readSubmissionValue(submission.submissionData, 'note'),
      details: proposalDetails(submission.proposed),
      reviewUrl: adminDocUrl('user-submissions', submission.id),
    })
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      retryable: true,
    }
  }

  return { ok: true, sentTo: to }
}

/** The target event's own fields, at the depth the routing needs. */
async function loadTarget(
  req: DeliveryContext['req'],
  eventId: number,
): Promise<{
  title: string | null
  managerEmail: string | null
  managerName: string | null
  managerPace: string
  regionId: number | null
} | null> {
  const event = await req.payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 1,
    select: { title: true, manager: true, region: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })

  if (!event) return null

  const manager = typeof event.manager === 'object' ? event.manager : null

  return {
    title: typeof event.title === 'string' ? event.title : null,
    managerEmail: typeof manager?.email === 'string' ? manager.email : null,
    managerName: manager?.name ?? null,
    managerPace: notificationFrequency(manager?.notificationPreferences, PROPOSAL_KEY),
    regionId: relationId(event.region),
  }
}

/** The preference row that decides when a proposal reaches its reviewer. */
const PROPOSAL_KEY = 'new_proposals'

/**
 * Whether a pace sends at once.
 *
 * ⚠ **Only `Immediate` does.** Every other pace — including one nothing
 * declares any more — means the morning digest carries it, which is a delay
 * rather than a drop, so there is no pace that loses a proposal.
 */
function isImmediate(pace: string): boolean {
  return pace === 'Immediate'
}

/** The event's own manager, or the nearest one up its region chain. */
async function routeTo(
  req: DeliveryContext['req'],
  target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>,
): Promise<ProposalRecipient | null> {
  if (target.managerEmail) {
    return { email: target.managerEmail, name: target.managerName, pace: target.managerPace }
  }

  return managerUpChain(req, target.regionId)
}

/** The nearest manager from `regionId` up to its country. */
async function managerUpChain(
  req: DeliveryContext['req'],
  regionId: number | null,
): Promise<ProposalRecipient | null> {
  if (regionId == null) return null

  const found = await findManagerForRegion(req.payload, regionId, { req })
  if (!found?.manager.email) return null

  return {
    email: found.manager.email,
    name: found.manager.name ?? null,
    pace: notificationFrequency(found.manager.notificationPreferences, PROPOSAL_KEY),
  }
}

/** Who to tell, and how soon they want telling. */
interface ProposalRecipient {
  email: string
  name: string | null
  pace: string
}

/**
 * The proposed patch as summary rows for the review email.
 *
 * ⚠ **Keys are rendered raw, not resolved to Events field labels.** The admin
 * diff labels them through `labelForPath`, which this job could now import —
 * the collection that once owned it is gone. A key like `address.city` is
 * legible on its own, and the review link goes to the document, which renders
 * the patch properly, so the labels buy wording in one email and a second
 * consumer for a formatter tied to the live Events config.
 */
function proposalDetails(proposed: unknown): { label: string; value: string }[] {
  if (typeof proposed !== 'object' || proposed === null || Array.isArray(proposed)) return []

  return Object.entries(proposed)
    .map(([label, value]) => ({ label, value: formatValue(value) }))
    .filter((row): row is { label: string; value: string } => row.value !== '')
}

/** One proposed value as a line. Objects are JSON, since a group has no prose form. */
function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}
