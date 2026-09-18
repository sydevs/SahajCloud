import type { DeliveryContext, DeliveryOutcome } from './types'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { CONTACT_EMAIL } from '@/lib/contact'
import { sendUserMessage } from '@/lib/notifications/sendUserMessage'
import { relationId } from '@/lib/utilities/relationId'

import { clientNameFor, contextFromSubmissionData } from './submissionContext'

/**
 * Deliver a contact submission: email it to whoever the form names.
 *
 * **The recipient falls back to `CONTACT_EMAIL`, and that fallback is load-
 * bearing rather than defensive.** `Forms.recipient` is nullable, so a contact
 * form whose author never named one is a legitimate form — and without the
 * fallback its messages would have nowhere to go.
 *
 * Throws nothing. A transport failure comes back as a retryable outcome, which
 * is what earns the task its retry and the row its `failed` status.
 */
export async function deliverContact({ req, submission }: DeliveryContext): Promise<DeliveryOutcome> {
  const to = await recipientFor(req, submission.form)

  try {
    await sendUserMessage({
      payload: req.payload,
      clientName: await clientNameFor(req, relationId(submission.client)),
      message: readSubmissionValue(submission.submissionData, 'message') ?? '',
      subject: submission.subject || 'Message',
      senderEmail: submission.senderEmail ?? undefined,
      context: contextFromSubmissionData(submission.submissionData),
      receivedAt: submission.createdAt,
      to,
    })
  } catch (error) {
    // Every transport failure is retryable: the mail server being unavailable
    // is the failure this whole queue exists to survive, and there is no 4xx
    // equivalent from `payload.sendEmail` to tell a permanent refusal apart.
    //
    // ⚠ **A throw is the only signal there is, and Resend does not raise one.**
    // `payload.sendEmail` resolves to `unknown`, so under the nodemailer/Mailpit
    // adapter a dead transport throws and lands here, while in production
    // `resendAdapter` logs, captures to Sentry and returns normally by design
    // (`@/plugins/email/resendAdapter.ts:93`, `docs/rules/email.md`) — so a
    // dropped message reads as delivered. Narrowing that is a change to the
    // adapter's contract, not to this file; `DeliveryOutcome` is already the
    // shape that would carry the answer.
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      retryable: true,
    }
  }

  return { ok: true, sentTo: to }
}

/**
 * Who reads this message.
 *
 * The form's `recipient` when it names one, the system contact otherwise. The
 * read drops `req` — a form is committed state, and a nested read joining the
 * caller's transaction takes the whole operation down with it when it goes
 * wrong (`src/collections/AGENTS.md`) — and degrades to the fallback rather
 * than throwing, because a manager who has since been deleted must not strand
 * the message.
 */
async function recipientFor(
  req: DeliveryContext['req'],
  form: unknown,
): Promise<string> {
  const formId = relationId(form)
  if (formId == null) return CONTACT_EMAIL

  const doc = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 1,
    select: { recipient: true },
    overrideAccess: true,
    disableErrors: true,
  })

  const recipient = (doc as { recipient?: { email?: unknown } | number | null } | null)?.recipient
  const email = typeof recipient === 'object' && recipient !== null ? recipient.email : null

  return typeof email === 'string' && email.trim() !== '' ? email : CONTACT_EMAIL
}
