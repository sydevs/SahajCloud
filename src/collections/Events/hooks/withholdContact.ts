import { type CollectionBeforeChangeHook, type FieldHook, ValidationError } from 'payload'

import { hasContactRoute } from '@/lib/events/contactRoute'
import { virtualFieldInputs } from '@/plugins/virtualFields'

/**
 * What a public contact field owes: `null` on every read while the box is off.
 *
 * ⚠ **A hidden field keeps its value.** `admin.condition` stops the three
 * fields rendering, not the columns holding what was typed before, and an API
 * caller can name a phone without naming the box at all. The Atlas widget
 * reads `contactPhone` with no gate of its own, so the box has to govern the
 * read.
 *
 * The declaration is what keeps the gate honest. `select: { contactPhone:
 * true }` — what the widget sends — strips `allowContact`, so without it the
 * hook would withhold a contact from every caller entitled to one (#1084).
 */
export function withheldUnlessAllowed() {
  const withhold: FieldHook = ({ siblingData, value }) => (siblingData?.allowContact ? value : null)

  return { custom: virtualFieldInputs('allowContact'), hooks: { afterRead: [withhold] } }
}

/**
 * Empty the three columns on any save where the box is off.
 *
 * ⚠ **A read gate cannot withhold a column from a `where`.** A field
 * `afterRead` hook governs the value returned, never the query, and nothing
 * bounds a client's `where`: `validateClientQueryParamsHook` inspects `select`
 * and the range bounds alone, and returns before any of it for a `count`. So a
 * withheld-but-stored number answers `where[contactPhone][contains]` one
 * character at a time, to any holder of a key — the widget's own is published
 * in every host page. Nothing in the row is the only answer.
 *
 * The **resolved state**, not the transition: a row written with the box
 * already off — an API create, a CSV import — is what a transition-only hook
 * leaves queryable. A caller meaning to offer a contact sends the box with it,
 * which `newEventDefaults`, `updatePatch` and `eventData` all derive.
 */
export const clearWithheldContact: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data.allowContact ?? originalDoc?.allowContact) return data
  return { ...data, contactEmail: null, contactName: null, contactPhone: null }
}

/**
 * Refuse a write that sets a phone or an email but leaves the box out, while
 * the stored box is off — an API `PATCH { contactPhone }` — rather than let the
 * save-time clear drop it without a word.
 *
 * ⚠ **Only a field `beforeValidate` hook can see the box was left out.** Payload
 * fills an omitted field from the stored row right after that field's own
 * hooks run, so every later hook reads `allowContact` as though it was sent.
 * Naming the box `false` is an answer, not an omission: the admin form sends
 * exactly that, with whatever was typed before the box was unticked.
 */
export const refuseContactWithoutBox: FieldHook = ({ previousSiblingDoc, siblingData }) => {
  if (siblingData.allowContact !== undefined || previousSiblingDoc?.allowContact) return
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
