import type { DeliveryContext, DeliveryOutcome } from './types'

import * as Sentry from '@sentry/nextjs'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { CONTACT_EMAIL } from '@/lib/contact'
import { findManagerForRegion } from '@/lib/notifications/recipients'
import { sendSubmissionReview } from '@/lib/notifications/sendSubmissionReview'
import { relationId } from '@/lib/utilities/relationId'
import { getServerUrl } from '@/lib/utilities/serverUrl'


/**
 * Deliver a proposal: email the responsible manager that there is something to
 * review.
 *
 * **Routing is the target event's manager, then its region chain, then the
 * system contact.** An update proposal names an event, so its owner is the
 * person to ask; a managerless (unverified) target escalates up the region
 * chain.
 *
 * ⚠ **A brand-new-event proposal routes to the system contact**, so it reaches
 * a person rather than a dead end. It no longer has to: screening resolves the
 * row's own `region` from its `regionHint`, so the nearest manager up *that*
 * chain is now reachable here — the column gap that forced the last resort is
 * closed. TODO: route an untargeted proposal by `submission.region` before
 * falling back. It changes who is emailed, so it wants its own spec.
 */
export async function deliverProposal({
  req,
  submission,
}: DeliveryContext): Promise<DeliveryOutcome> {
  const eventId = relationId(submission.event)
  const target = eventId != null ? await loadTarget(req, eventId) : null
  const recipient = target ? await routeTo(req, target) : null

  if (!recipient) {
    // Not a note on the row: who received the email is our problem, and the
    // person reading the row is by definition the person reviewing it.
    Sentry.captureMessage('deliverProposal: no manager to notify', {
      extra: { submissionId: submission.id, eventId },
    })
  }

  const to = recipient?.email ?? CONTACT_EMAIL

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
      reviewUrl: `${getServerUrl()}/admin/collections/user-submissions/${submission.id}`,
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
): Promise<{ title: string | null; managerEmail: string | null; managerName: string | null; regionId: number | null } | null> {
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
    regionId: relationId(event.region),
  }
}

/** The event's own manager, or the nearest one up its region chain. */
async function routeTo(
  req: DeliveryContext['req'],
  target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>,
): Promise<{ email: string; name: string | null } | null> {
  if (target.managerEmail) {
    return { email: target.managerEmail, name: target.managerName }
  }

  if (target.regionId == null) return null

  const found = await findManagerForRegion(req.payload, target.regionId, { req })
  if (!found?.manager.email) return null

  return { email: found.manager.email, name: found.manager.name ?? null }
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
