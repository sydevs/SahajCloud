import type { DeliveryContext, DeliveryOutcome } from './types'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { CONTACT_EMAIL } from '@/lib/contact'
import { DEFAULT_LOCALE, isValidLocale, type LocaleCode } from '@/lib/locales'
import { sendUserMessage } from '@/lib/notifications/sendUserMessage'
import { relationId } from '@/lib/utilities/relationId'
import type { Form } from '@/payload-types'

import { buildFormAnswers } from './formAnswers'
import { clientNameFor, contextFromSubmissionData } from './submissionContext'

/**
 * Deliver a contact submission: email it to whoever the form names.
 *
 * Throws nothing. A transport failure comes back as a retryable outcome, which
 * is what earns the task its retry and the row its `failed` status.
 */
export async function deliverContact({ req, submission }: DeliveryContext): Promise<DeliveryOutcome> {
  const { to, fields } = await formDelivery(
    req,
    submission.form,
    submissionLocale(submission.submissionData),
  )

  try {
    await sendUserMessage({
      payload: req.payload,
      clientName: await clientNameFor(req, relationId(submission.client)),
      answers: answersFor(fields, submission.submissionData),
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
 * The email's body rows: the form's own questions and their answers.
 *
 * ⚠ **The one-row fallback covers a form deleted after the row was written**,
 * which `disableErrors` turns into `null` — nothing else. A `contact` row is
 * required to name a form (`UserSubmissions/fields.ts`, `needsForm`), and the
 * registration, subscribe and proposal paths never reach this file
 * (`deliverers.ts`). Synthesized here rather than branched on in the template,
 * so the email has one body shape.
 */
function answersFor(fields: Form['fields'] | undefined, submissionData: unknown) {
  if (fields !== undefined) return buildFormAnswers(fields, submissionData)
  return [{ label: 'Message', value: readSubmissionValue(submissionData, 'message') ?? '' }]
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
 * The two things the named form decides: who reads the message, and which
 * questions it asked.
 *
 * One read, not two — the recipient and the field list come off the same
 * document. The read drops `req` — a form is committed state, and a nested read
 * joining the caller's transaction takes the whole operation down with it when
 * it goes wrong (`src/collections/AGENTS.md`) — and degrades to the fallback
 * rather than throwing, because a manager who has since been deleted must not
 * strand the message.
 *
 * `fields` comes back `undefined` only where there is no form to read, which is
 * the one case {@link answersFor} falls back for.
 */
async function formDelivery(
  req: DeliveryContext['req'],
  form: unknown,
  locale: LocaleCode,
): Promise<{ to: string; fields: Form['fields'] | undefined }> {
  const formId = relationId(form)
  if (formId == null) return { to: CONTACT_EMAIL, fields: undefined }

  const doc = (await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 1,
    select: { recipient: true, fields: true },
    locale,
    overrideAccess: true,
    disableErrors: true,
  })) as { recipient?: { email?: unknown } | number | null; fields?: Form['fields'] } | null

  const recipient = doc?.recipient
  const email = typeof recipient === 'object' && recipient !== null ? recipient.email : null

  return {
    to: typeof email === 'string' && email.trim() !== '' ? email : CONTACT_EMAIL,
    fields: doc == null ? undefined : (doc.fields ?? []),
  }
}
