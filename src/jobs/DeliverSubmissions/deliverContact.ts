import type { DeliveryContext, DeliveryOutcome } from './types'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import type { UserMessageDetail } from '@/emails/UserMessageEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { DEFAULT_LOCALE, isValidLocale, type LocaleCode } from '@/lib/locales'
import { sendUserMessage } from '@/lib/notifications/sendUserMessage'
import { relationId } from '@/lib/utilities/relationId'

import { buildFormAnswers } from './formAnswers'
import { clientNameFor, contextFromSubmissionData } from './submissionContext'

/**
 * Deliver a contact submission: email it to whoever the form names.
 *
 * Throws nothing. A transport failure comes back as a retryable outcome, which
 * is what earns the task its retry and the row its `failed` status.
 */
export async function deliverContact({ req, submission }: DeliveryContext): Promise<DeliveryOutcome> {
  const { to, answers } = await formDelivery(req, submission)
  const clientName = await clientNameFor(req, relationId(submission.client))

  try {
    await sendUserMessage({
      payload: req.payload,
      clientName,
      answers,
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
 * Which language the recipient reads the questions in.
 *
 * The forms plugin localizes a field's `label` and a select option's `label`
 * (`forms_blocks_*_locales`), so the form read has to choose one. The
 * submission's own locale means the manager reads the question as the visitor
 * was asked it, and the resolved option label means what the visitor clicked.
 *
 * ⚠ **Gated through `isValidLocale`, not optionally.** The pair is
 * submitter-chosen text, exempt from the URL scan, and it reaches the database
 * layer as a query parameter.
 */
function submissionLocale(submissionData: unknown): LocaleCode {
  const locale = readSubmissionValue(submissionData, 'locale')?.trim()
  return locale != null && isValidLocale(locale) ? locale : DEFAULT_LOCALE
}

/**
 * The two things the named form decides: who reads the message, and what it
 * asked.
 *
 * One read, not two — the recipient and the field list come off the same
 * document. It drops `req`, because a form is committed state and a nested read
 * joining the caller's transaction takes the whole operation down with it when
 * it goes wrong (`src/collections/AGENTS.md`), and it degrades to the fallbacks
 * rather than throwing, because a manager who has since been deleted must not
 * strand the message.
 *
 * ⚠ **The one-row `Message` body covers a form deleted after the row was
 * written**, which `disableErrors` turns into `null` — nothing else. A `contact`
 * row is required to name a form (`UserSubmissions/fields.ts`, `needsForm`), and
 * the other three types never reach this file (`deliverers.ts`). Built here
 * rather than branched on in the template, so the email has one body shape.
 */
async function formDelivery(
  req: DeliveryContext['req'],
  submission: DeliveryContext['submission'],
): Promise<{ to: string; answers: UserMessageDetail[] }> {
  const messageOnly = [
    { label: 'Message', value: readSubmissionValue(submission.submissionData, 'message') ?? '' },
  ]

  const formId = relationId(submission.form)
  if (formId == null) return { to: CONTACT_EMAIL, answers: messageOnly }

  const form = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 1,
    // `fields: true` is wider than the four keys used — it pulls all nine
    // form-builder block tables and their `_locales` siblings. Narrowing it is
    // not worth it: a blocks `select` is keyed per block *slug*, so the narrow
    // form enumerates all nine, and a block type added upstream would be
    // dropped silently — losing its answers, the failure this file exists to fix.
    select: { recipient: true, fields: true },
    locale: submissionLocale(submission.submissionData),
    overrideAccess: true,
    disableErrors: true,
  })

  if (form == null) return { to: CONTACT_EMAIL, answers: messageOnly }

  const email = typeof form.recipient === 'object' && form.recipient !== null
    ? form.recipient.email
    : null

  return {
    to: typeof email === 'string' && email.trim() !== '' ? email : CONTACT_EMAIL,
    answers: buildFormAnswers(form.fields, submission.submissionData),
  }
}
