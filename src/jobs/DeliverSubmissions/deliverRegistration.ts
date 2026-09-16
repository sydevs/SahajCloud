import type { DeliveryContext, DeliveryOutcome } from './types'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import type { LocaleCode } from '@/lib/locales'
import { resolveRegistrationRecipient } from '@/lib/notifications/registrationRecipient'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendRegistrationConfirmation } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendRegistrationNotification } from '@/lib/notifications/sendRegistrationNotification'
import { buildRegistrationAnswers } from '@/lib/registrations/questions'
import { relationId } from '@/lib/utilities/relationId'
import type { Event } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'


/**
 * Deliver a registration: the registrant's confirmation, then the manager's
 * notification.
 *
 * **Both were in-request best-effort before this**, sent by
 * `registerForEvent` inside the 201 and logged-and-swallowed on failure — so a
 * mail hiccup lost a confirmation silently, and the registrant learned nothing.
 * Moving them here is what buys retries and an activity-log entry per attempt.
 * The registration create path itself re-points in Phase 3; until then this
 * runs for rows created directly against `user-submissions`.
 *
 * **The two sends are independent, and the outcome is the confirmation's.** A
 * manager notification that fails must not make the registrant's confirmation
 * arrive twice on retry — so the notification is best-effort and logged, and
 * only the confirmation decides whether the delivery is retried. That
 * asymmetry is deliberate: one of the two emails goes to somebody who is
 * waiting for it.
 */
export async function deliverRegistration({
  req,
  submission,
}: DeliveryContext): Promise<DeliveryOutcome> {
  const email = submission.senderEmail?.trim()
  const eventId = relationId(submission.event)

  if (!email || eventId == null) {
    return {
      ok: false,
      detail: 'A registration needs both an email address and an event.',
      retryable: false,
    }
  }

  const event = (await req.payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })) as Event | null

  if (!event) {
    // The event was deleted between the registration and this run. Nothing to
    // confirm, and no retry will bring it back.
    return { ok: false, detail: `Event ${eventId} no longer exists.`, retryable: false }
  }

  const registrantName = readSubmissionValue(submission.submissionData, 'name') ?? email
  const locale = (readSubmissionValue(submission.submissionData, 'locale') ?? null) as
    | LocaleCode
    | null

  try {
    await sendRegistrationConfirmation({
      payload: req.payload,
      event,
      client: await loadEmailClient(req, relationId(submission.client)),
      registrantName,
      registrantEmail: email,
      locale,
      // The stable id, so a re-send updates the registrant's calendar entry
      // rather than adding a second one.
      registrationUuid: submission.uuid,
      req,
    })
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      retryable: true,
    }
  }

  await notifyManager({ req, submission, event, registrantName, registrantEmail: email })

  return { ok: true, sentTo: email }
}

/**
 * Tell the event's manager — or the per-event override address — that somebody
 * registered. Best-effort, for the reason in this module's docblock.
 *
 * Only the `Immediate` cadence delivers here; a summary cadence belongs to the
 * digest run, and `Never` sends nothing.
 */
async function notifyManager(args: {
  req: DeliveryContext['req']
  submission: DeliveryContext['submission']
  event: Event
  registrantName: string
  registrantEmail: string
}): Promise<void> {
  const { req, submission, event, registrantName, registrantEmail } = args

  try {
    const managerId = relationId(event.manager)
    const manager = managerId
      ? await req.payload
          .findByID({
            collection: 'managers',
            id: managerId,
            depth: 0,
            overrideAccess: true,
            req: asTrustedReq(req),
          })
          .catch(() => null)
      : null

    const recipient = resolveRegistrationRecipient(event, manager)
    if (!recipient || recipient.frequency !== 'Immediate') return

    await sendRegistrationNotification({
      payload: req.payload,
      recipient,
      event,
      registrantName,
      registrantEmail,
      startingAt: submission.startingAt,
      answers: buildRegistrationAnswers(answersFrom(submission.submissionData)),
    })
  } catch (error) {
    req.payload.logger.error({
      msg: 'deliverRegistration: manager notification failed; the confirmation still went out',
      submissionId: submission.id,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * The registrant's answers, as the `{ [name]: value }` map
 * `buildRegistrationAnswers` labels.
 *
 * It reads every pair rather than filtering to the configured question names,
 * because that function already sorts configured answers from extras and labels
 * each appropriately — restating the list here would give it two definitions.
 */
function answersFrom(entries: unknown): Record<string, unknown> {
  if (!Array.isArray(entries)) return {}
  const answers: Record<string, unknown> = {}
  for (const entry of entries as { field?: unknown; value?: unknown }[]) {
    if (typeof entry?.field === 'string') answers[entry.field] = entry.value
  }
  return answers
}

/** The branding fields a registrant email needs; `logo` must be populated. */
async function loadEmailClient(
  req: DeliveryContext['req'],
  clientId: number | null,
): Promise<EmailClient | null> {
  if (clientId == null) return null

  const client = await req.payload.findByID({
    collection: 'clients',
    id: clientId,
    // `depth: 1` so `logo` arrives as an image document rather than an id — the
    // template resolves it to a PNG, and cannot from a bare number.
    depth: 1,
    select: { color1: true, color2: true, logo: true, name: true, supportEmail: true, websiteUrl: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })

  return (client as EmailClient | null) ?? null
}
