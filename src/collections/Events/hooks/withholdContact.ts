import { type FieldHook, ValidationError } from 'payload'

import { hasContactRoute } from '@/lib/events/contactRoute'
import { virtualFieldInputs } from '@/plugins/virtualFields'

/**
 * Put a public contact field behind the `allowContact` box: `null` on every
 * read while it is off, and emptied on every save where it is off. Why it takes
 * both: `src/collections/Events/AGENTS.md`.
 *
 * ⚠ **A hidden field keeps its value.** `admin.condition` stops a field
 * rendering, never a write, and the Atlas widget reads `contactPhone` with no
 * gate of its own.
 *
 * ⚠ **A read gate cannot withhold a column from a `where`.** Only an empty
 * column keeps a withheld number out of one. The clear reads the resolved box,
 * never a change to it: a row written with the box already off never
 * transitions.
 *
 * The declaration keeps the read gate honest: `select: { contactPhone: true }`,
 * what the widget sends, strips `allowContact` (#1084).
 */
export function withheldUnlessAllowed() {
  const withhold: FieldHook = ({ siblingData, value }) => (siblingData?.allowContact ? value : null)
  // An omitted box has been filled from the stored row by `beforeChange`.
  const clear: FieldHook = ({ siblingData }) => (siblingData?.allowContact ? undefined : null)

  return {
    custom: virtualFieldInputs('allowContact'),
    hooks: { afterRead: [withhold], beforeChange: [clear] },
  }
}

/**
 * Refuse a phone or an email sent without the box while it is off — an API
 * `PATCH { contactPhone }` — rather than let the save empty it without a word.
 *
 * ⚠ **Only a field `beforeValidate` hook on the box can see it was left out.**
 * Payload fills an omitted field from the stored row right after that field's
 * own hooks. Naming the box `false` is an answer: the admin form sends that,
 * with whatever was typed before the box was unticked.
 */
export const refuseContactWithoutBox: FieldHook = ({ previousSiblingDoc, siblingData }) => {
  if (siblingData.allowContact !== undefined || previousSiblingDoc?.allowContact) return
  // A stored value sent back is not being set, so a write re-sending the row is never refused.
  const sent = (key: 'contactEmail' | 'contactPhone') =>
    siblingData[key] === previousSiblingDoc?.[key] ? undefined : siblingData[key]
  if (!hasContactRoute({ contactEmail: sent('contactEmail'), contactPhone: sent('contactPhone') }))
    return
  throw new ValidationError({
    collection: 'events',
    errors: [
      {
        path: 'allowContact',
        message:
          'Switch this on to set a phone number or an email address. While it is off, the contact fields are emptied on save.',
      },
    ],
  })
}
