import { parseOptIn, readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import type { UserMessageDetail } from '@/emails/UserMessageEmail'
import type { Form } from '@/payload-types'

/**
 * Shape a contact submission's stored answers into the labelled rows the email
 * renders, reading the authored form for the questions rather than one fixed
 * key.
 *
 * **Why the form and not the blob.** Delivery used to build the whole body from
 * the `message` key, so an author who named their textarea anything else got an
 * email with no body while the sender saw a thank-you screen. Nothing on either
 * side ever pinned that name.
 *
 * ⚠ **Every value here is submitter-chosen text that reaches a renderer.**
 * `URL_EXEMPT_KEYS`' docblock records the constraint: a client write is
 * URL-scanned at intake, a manager-written row is not, so the template renders
 * each value as an escaped React child and never as an anchor.
 *
 * Lives beside `submissionContext.ts` rather than in `src/lib/` because
 * delivery is its only consumer today (`tests/unit/lib-boundary.spec.ts`). It
 * moves to `src/lib/submissions/` when the intake's scan classifier consumes
 * the same walk.
 */

type FormField = NonNullable<Form['fields']>[number]

/** The option list a `select` block carries, when it is one. */
function optionsOf(block: FormField): { label?: string | null; value?: string | null }[] {
  const options = (block as { options?: unknown }).options
  return Array.isArray(options) ? options : []
}

/**
 * One block's answer as display text, or `''` to drop the row.
 *
 * Three block types store something other than what a reader should see:
 *
 * - A `select` stores the chosen option's `value`, which is operator-authored
 *   and may be a slug. Resolve its `label`, and fall back to the raw value
 *   where no option matches — an option deleted after the answer was stored.
 * - A `checkbox` arrives as the string `'true'` or `'false'`, never a boolean:
 *   `checkSubmissionData` refuses a non-string value. `No` is rendered rather
 *   than dropped, because an unticked consent box is an answer.
 * - A `message` block is static Lexical prose with no `name` at all, so it can
 *   never match a stored key. The nameless filter in {@link buildFormAnswers}
 *   drops it. A field *named* `message` is an ordinary question.
 */
function formatBlockAnswer(block: FormField, raw: string): string {
  const value = raw.trim()
  if (value === '') return ''

  if (block.blockType === 'select') {
    const match = optionsOf(block).find((option) => option.value === value)
    return typeof match?.label === 'string' && match.label.trim() !== '' ? match.label : value
  }

  if (block.blockType === 'checkbox') return parseOptIn(value) ? 'Yes' : 'No'

  return value
}

/**
 * The submission's answers, in the order the author placed the questions.
 *
 * A row is labelled by the block's `label` — localized by the forms plugin, so
 * the caller's read decides which language the recipient reads — falling back
 * to its `name` where the author left the label empty. An answer that is
 * absent or blank contributes no row.
 */
export function buildFormAnswers(
  fields: Form['fields'],
  submissionData: unknown,
): UserMessageDetail[] {
  if (!Array.isArray(fields)) return []

  const answers: UserMessageDetail[] = []

  for (const block of fields) {
    const name = (block as { name?: unknown }).name
    if (typeof name !== 'string' || name === '') continue

    const raw = readSubmissionValue(submissionData, name)
    if (raw == null) continue

    const value = formatBlockAnswer(block, raw)
    if (value === '') continue

    const label = (block as { label?: unknown }).label
    answers.push({
      label: typeof label === 'string' && label.trim() !== '' ? label : name,
      value,
    })
  }

  return answers
}
