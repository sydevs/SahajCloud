import type { CollectionBeforeValidateHook, FlattenedField } from 'payload'

import { APIError } from 'payload'

/**
 * Gate the `proposed` patch at intake.
 *
 * `proposed` is applied verbatim to Events on Accept, so an ungated public POST
 * would be a write to Events with a manager's authority behind it. Two rules,
 * both derived from the live Events config rather than a restated allowlist:
 *
 * 1. **every key must be a real Events field** — a typo'd key would otherwise
 *    sit in the column looking meaningful and silently do nothing on Accept;
 * 2. **no key may be system-managed or privileged** — a submission that could
 *    set `verificationStage: 'verified'` or `manager` would let an anonymous
 *    visitor mint a verified, adopted listing.
 *
 * Rule 2 is mostly *derived*: a field Events marks `admin.readOnly` is
 * system-written by definition. `PRIVILEGED_FIELDS` covers the few that are
 * legitimately manager-editable but must never come from the public — they
 * can't be spotted from the field config alone.
 *
 * Deliberately structural only. Per-value validation (formats, required,
 * conditionals) is left to `payload.create/update` on Events at Accept, where
 * it runs with full sibling context and surfaces as a `ValidationError` to the
 * reviewing manager. Reproducing a partial copy of it here would reject
 * legitimate submissions that Events itself would accept — the exact
 * two-sources-of-truth problem this collection is being reshaped to remove.
 */

/**
 * Manager-editable on an Event, but never proposable by the public.
 *
 * These cannot be spotted from the field config — they carry no `readOnly`,
 * because a manager edits them freely. What they have in common is that they
 * decide something *about* an event rather than describing it, and a submitter
 * is only ever describing one.
 *
 * - **Ownership and lifecycle** — `manager`, `_status`, `id`, `deletedAt`, and
 *   the `createdAt` / `updatedAt` stamps, which would otherwise let a
 *   submitter forge a listing's history. `region` is a column on the
 *   submission itself (screening resolves it, the reviewer may correct it), so
 *   it is not part of the patch either.
 * - **The whole registration cluster.** Registration is the event's
 *   data-collection surface, and every field in it is a redirect waiting to
 *   happen: `registrationMode: 'external'` + `externalRegistrationUrl` sends
 *   every would-be registrant to a site of the submitter's choosing, and
 *   `registrationNotificationEmail` forwards registrant names, emails and
 *   answers to an inbox of their choosing — silently, from the moment a
 *   manager accepts.
 * - **`images`** — an upload relationship to a shared collection, so a
 *   submitter could dress their listing in another event's photographs.
 *   Attachments are a separate ticket (#627); until then the answer is no.
 *
 * A new privileged Events field must be added here. `proposableEventFields` is
 * pinned by an integration test against the real config, so adding one to
 * Events fails that test until this decision is made explicitly.
 */
const PRIVILEGED_FIELDS = new Set([
  'manager',
  'region',
  '_status',
  'id',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'registrationMode',
  'externalRegistrationUrl',
  'registrationLimit',
  'registrationNotificationEmail',
  'registrationNotificationFrequency',
  'registrationQuestions',
  'images',
])

/** Field names a submission may legitimately propose, from the Events config. */
export function proposableEventFields(fields: FlattenedField[]): Set<string> {
  const names = new Set<string>()
  for (const field of fields) {
    if (!('name' in field) || typeof field.name !== 'string') continue
    if (PRIVILEGED_FIELDS.has(field.name)) continue
    // A join has no column of its own — it is a view onto another collection,
    // so there is nothing here for a patch to write.
    if (field.type === 'join') continue
    // System-written: Events already declares these read-only in the admin.
    if (field.admin?.readOnly) continue
    names.add(field.name)
  }
  return names
}

export const validateProposal: CollectionBeforeValidateHook = ({ data, req }) => {
  const proposed = data?.proposed
  if (proposed == null) return data

  if (typeof proposed !== 'object' || Array.isArray(proposed)) {
    throw new APIError('`proposed` must be an object of Events fields.', 400, undefined, true)
  }

  const eventFields = req.payload.collections?.events?.config?.flattenedFields
  // No Events config to check against (a bare test harness) — let Accept be the
  // gate rather than refusing every submission.
  if (!eventFields) return data

  const allowed = proposableEventFields(eventFields)
  const rejected = Object.keys(proposed as Record<string, unknown>).filter(
    (key) => !allowed.has(key),
  )

  if (rejected.length > 0) {
    throw new APIError(
      `Not a proposable event field: ${rejected.sort().join(', ')}.`,
      400,
      { code: 'proposed_field_invalid', fields: rejected },
      true,
    )
  }

  return data
}
