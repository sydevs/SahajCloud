/**
 * What a manager who is neither an admin nor the account holder may see and set
 * on somebody else's `managers` row (#828).
 *
 * `atlas-manager` holds a collection-wide `read` grant, because the
 * `Events.manager` and `Regions.managers` pickers list other managers (#821).
 * A picker needs one field. Everything else on the row — the address, the
 * contact handles, what the person was granted, the raw imported record — is
 * personal data a region volunteer has no business reading, so the grant is
 * narrowed field by field rather than withdrawn.
 *
 * ⚠ **Spelled as a one-entry allowlist, swept by
 * `tests/unit/manager-field-locks.spec.ts`.** A field added to this collection,
 * or injected into it by `loginPlugin`, is locked unless somebody names it
 * public — the opposite polarity to `RESTRICTED_COLLECTIONS`, which
 * `docs/rules/access.md` calls a holding pattern for failing open on the next
 * entry.
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

/** The type a non-admin creator gets, whatever they asked for. */
const MANAGED: Manager['type'] = 'manager'

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
 * what stops a crafted CSV row from minting an admin. It runs on every path,
 * which is the point.
 *
 * Only a non-admin manager is rewritten. A server-side create with no user —
 * a seed, a job, a migration — is left alone, or the seeds could not build an
 * admin at all.
 */
export const forceManagedTypeAndRoles: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data
  if (!req.user || req.user.collection !== 'managers' || isAdminManager(req.user)) return data
  return { ...data, roles: null, type: MANAGED }
}
