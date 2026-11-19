import type { CollectionBeforeChangeHook, FieldHook } from 'payload'

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
