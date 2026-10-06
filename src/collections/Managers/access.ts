/**
 * What a manager who is neither an admin nor the account holder may see and set
 * on somebody else's `managers` row (#828).
 *
 * The `read` grant is collection-wide because the `Events.manager` and
 * `Regions.managers` pickers list other managers (#821), so it is narrowed here
 * rather than withdrawn. Why that way round is in `docs/rules/access.md`.
 *
 * ⚠ **A one-entry allowlist, swept by `tests/unit/manager-field-locks.spec.ts`**
 * — a field added here, or injected by `loginPlugin`, is locked unless somebody
 * names it public. The opposite polarity to `RESTRICTED_COLLECTIONS`, which that
 * rule calls a holding pattern for failing open on the next entry.
 */

import type { CollectionBeforeChangeHook, Field } from 'payload'

import type { Manager } from '@/payload-types'
import { isAdminManager, selfOrAdminFieldAccess } from '@/plugins/access'

/**
 * The fields a manager reads on every row, their own or not.
 *
 * `name` is what a picker renders (`admin.useAsTitle`). The timestamps are not
 * here because Payload appends them at sanitize time, outside `fields` —
 * the sweep names them separately.
 */
export const MANAGER_PUBLIC_FIELDS: ReadonlySet<string> = new Set(['name'])

/**
 * Lock `read` on every field this collection declares outside
 * {@link MANAGER_PUBLIC_FIELDS}.
 *
 * Descends through the containers that flatten away — tabs, rows, collapsibles
 * — and stops at a field that holds data. Locking an array or a group is enough:
 * the value lives under the parent's own name, which is what
 * `stripLockedFieldsOnSelfRead` walks and what `afterRead` deletes.
 *
 * A field that already declares `access.read` keeps it, so a stricter lock
 * written by hand wins over this one.
 */
export function lockManagerFieldReads(fields: Field[]): Field[] {
  return fields.map((field) => {
    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({
          ...tab,
          fields: lockManagerFieldReads(tab.fields),
        })),
      }
    }

    if (field.type === 'row' || field.type === 'collapsible') {
      return { ...field, fields: lockManagerFieldReads(field.fields) }
    }

    if (field.type === 'ui' || !('name' in field)) return field
    if (MANAGER_PUBLIC_FIELDS.has(field.name)) return field

    // A `join` declares a narrower `access` than the rest of the union, so the
    // shape is widened here rather than branched on per field type.
    const existing = (field as { access?: Record<string, unknown> }).access
    if (existing?.read) return field

    return { ...field, access: { ...existing, read: selfOrAdminFieldAccess } } as Field
  })
}

/**
 * Force `type` and `roles` on a row a non-admin manager creates.
 *
 * ⚠ **The field locks on those two are the boundary, and they do not cover a
 * write that skips access.** The bulk import commits events and managers with
 * `overrideAccess: true` while acting as the uploader (#828), and
 * `beforeValidate` evaluates no field lock under that flag — so this hook is
 * what stops a crafted CSV row from minting an admin.
 *
 * ⚠ **What it covers is `type` and `roles`, on a create by a non-admin user.**
 * Two edges follow, and the commit step owes both. A create with **no** user is
 * left alone, because that is a seed, a migration or a queued job, and the seeds
 * could not build an admin otherwise — so moving the commit onto the queue
 * leaves `req.user` behind and this guard with it. And the machine columns
 * (`_verified`, the invitation queue, `sessions`) are held by their own
 * `create` locks, which `overrideAccess: true` skips: a commit step must write
 * the columns it means to rather than pass a CSV row through.
 */
export const forceManagedTypeAndRoles: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (!req.user || isAdminManager(req.user)) return data
  // ⚠ **The account holder's own settings are theirs to set, not their
  // creator's.** `managers: create` lets a coordinator open an account for
  // somebody else, and a preset `notificationPreferences` (invitations: never)
  // or a contact handle marked `verified` let the creator impersonate the person
  // or squat their address — the invitation silenced, their notifications routed
  // to a channel nobody delivers. So a non-admin's create keeps the name, the
  // address, the language and unverified contact handles, and nothing else of
  // the account holder's.
  const {
    notificationPreferences: _preferences,
    currentProject: _project,
    lastRegistrationDigestSentAt: _digest,
    legacyId: _legacyId,
    legacyData: _legacyData,
    ...kept
  } = data ?? {}
  const contactDetails = Array.isArray(kept.contactDetails)
    ? (kept.contactDetails as Record<string, unknown>[]).map((detail) => ({
        ...detail,
        verified: false,
      }))
    : kept.contactDetails
  // Spelled against the admin rather than for `managers`, so a grant to a
  // second auth collection arrives rewritten rather than exempt.
  return {
    ...kept,
    ...(contactDetails === undefined ? {} : { contactDetails }),
    roles: null,
    type: 'manager' satisfies Manager['type'],
  }
}
