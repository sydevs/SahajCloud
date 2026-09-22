import type { CollectionBeforeValidateHook } from 'payload'

import { ValidationError } from 'payload'

import { CLIENT_CONTEXT_KEYS } from '@/collections/UserSubmissions/submissionData'
import type { Form } from '@/payload-types'

/** The plugin's field blocks that can hold an email address a person types. */
const EMAIL_BLOCKS = ['email'] as const

/** The plugin's field blocks that can hold a message body a person types. */
const MESSAGE_BLOCKS = ['textarea', 'text'] as const

/**
 * What each action needs from the authored field list, and from the form's own
 * configuration.
 *
 * The rule is per-action, so it cannot live on a field: `required: true` on
 * `client` would demand one from a contact form too, and no `validate` on the
 * `fields` blocks array can see `actionType`.
 *
 * **Why save time and not submit time.** A subscribe form with no email field
 * collects nothing a subscription can be made from, and a contact form with no
 * message body collects nothing to deliver. Both fail on every submission,
 * one visitor at a time, with the author never seeing it. Refusing the save is
 * the only moment the person who can fix it is present.
 *
 * Note `message` is *not* a message field: the plugin's `message` block is
 * static rich text the author writes, not an input the visitor fills.
 */
export const validateFormAction: CollectionBeforeValidateHook<Form> = ({
  data,
  operation,
  originalDoc,
}) => {
  if (!data) return data

  // ⚠ **On update, `data` is already merged with the stored document**, so it
  // holds the effective value of every field whether the patch named it or not.
  // Two consequences, and both were wrong before:
  //
  // - `data.client ?? originalDoc?.client` is not a merge — it is a second one
  //   on top of Payload's, and it reads an explicitly cleared relationship
  //   (normalised to `null`) as the old value. The one save that breaks the
  //   rule would have passed it. Read `data` alone.
  // - `'fields' in data` cannot tell whether the patch touched the field list,
  //   because the merge puts it there either way. Compare against
  //   `originalDoc` instead.
  const actionType = data.actionType
  const fields = data.fields
  const client = data.client

  // ⚠ **Only a save that changes what this rule governs is judged by it.**
  // Every form predating `actionType` back-fills to `contact` through the
  // column default, and a legacy one may hold no message field — so judging
  // every save would refuse a coordinator renaming such a form, citing a field
  // list they never touched, and leave the row unsaveable in the admin for
  // good.
  if (operation === 'update' && originalDoc) {
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    if (
      same(actionType, originalDoc.actionType) &&
      same(fields, originalDoc.fields) &&
      same(client, originalDoc.client)
    ) {
      return data
    }
  }

  if (!actionType) return data

  // Which blocks the author placed, as a set — the only thing this rule reads
  // off the field list.
  const present = new Set<string>(Array.isArray(fields) ? fields.map((block) => block.blockType) : [])
  const errors: { message: string; path: string }[] = []

  const hasEmail = EMAIL_BLOCKS.some((type) => present.has(type))
  const hasMessage = MESSAGE_BLOCKS.some((type) => present.has(type))

  const missing: string[] = []
  if (!hasEmail) missing.push('an Email field')
  if (actionType === 'contact' && !hasMessage) missing.push('a Text or Textarea field')

  if (missing.length > 0) {
    errors.push({
      path: 'fields',
      message:
        `A ${actionType} form needs ${missing.join(' and ')}. ` +
        'The Message block is static text an author writes, not an input a visitor fills.',
    })
  }

  // A submission carries the client's own context — which page, which locale —
  // in the same flat pairs as the answers, appended after them. So a field
  // sharing one of those names has its visitor's answer silently replaced, and
  // the author is the only person who can see it. Refused here for the same
  // reason as the missing fields above: this is the one moment they are present.
  //
  // ⚠ Not every `BASE_SUBMISSION_KEYS` entry. `name` and `subject` are real
  // questions the production Contact Form asks, and the intake *reads* those
  // answers rather than overwriting them.
  const reserved = new Set<string>(CLIENT_CONTEXT_KEYS)
  const colliding = (Array.isArray(fields) ? fields : [])
    .map((block) => (block as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string' && reserved.has(name))

  if (colliding.length > 0) {
    errors.push({
      path: 'fields',
      message:
        `${colliding.map((name) => `\`${name}\``).join(', ')} ` +
        `${colliding.length > 1 ? 'are names' : 'is a name'} the submitting client writes for ` +
        'itself, so an answer stored under it would be overwritten. Rename the field.',
    })
  }

  if (actionType === 'subscribe' && !client) {
    errors.push({
      path: 'client',
      message: 'A subscribe form needs a client, whose mailing list the subscriber joins.',
    })
  }

  if (errors.length > 0) {
    throw new ValidationError({ collection: 'forms', errors })
  }

  return data
}
