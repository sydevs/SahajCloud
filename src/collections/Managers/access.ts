import type { Field, FieldAccess } from 'payload'

import { isManager, resolveContactableManagerIds, selfOrAdminFieldAccess } from '@/plugins/access'

/**
 * The fields an `atlas-manager` reads on somebody else's manager row.
 *
 * `admin.useAsTitle` is `name`, so this is the whole of what the
 * `Events.manager` and `Regions.managers` pickers render. Payload appends
 * `createdAt` and `updatedAt` outside `fields`, so the locker never reaches
 * them and they need no entry here.
 */
export const MANAGER_PUBLIC_FIELDS = new Set(['name'])

/**
 * The fields a region manager also reads on a manager assigned inside their
 * owned subtree: how to reach them, and nothing about their account. See
 * {@link regionContactFieldAccess}.
 */
export const MANAGER_REGION_CONTACT_FIELDS = new Set(['email', 'contactDetails'])

/**
 * Field-level access: {@link selfOrAdminFieldAccess}, widened to a manager
 * whose owned subtree this row is assigned inside — the manager of an event
 * there, or of a region there, co-managers of their own region included
 * (`resolveContactableManagerIds`). Ardnived, 2026-10-30: region managers
 * "need to be able to contact these users" (#908).
 *
 * ⚠ **The widening answers only with a row in hand.** A `where`, `sort` or
 * `distinct` on these paths, and `/api/access`, evaluate field access with no
 * `doc` — a question about every row. Answering it from the subtree would make
 * `?where[email][like]=a` an oracle for the addresses of managers anywhere, so
 * with no row it stays self-or-admin, exactly as `logField`'s doc-less lock
 * does for #1047. Every read of a row, the admin drawer's permissions
 * included, passes the row as `doc`.
 */
export const regionContactFieldAccess: FieldAccess = async (args) => {
  if (await selfOrAdminFieldAccess(args)) return true
  const { doc, id, req } = args
  if (!isManager(req.user) || !doc) return false
  const rowId = Number(id ?? doc.id)
  if (!Number.isInteger(rowId)) return false
  const contactable = await resolveContactableManagerIds(req, Number(req.user.id))
  return contactable.has(rowId)
}

/**
 * Lock every field on `managers` to the row's own holder and to admins, bar
 * {@link MANAGER_PUBLIC_FIELDS} (#908). {@link MANAGER_REGION_CONTACT_FIELDS}
 * take {@link regionContactFieldAccess} instead, which also admits the
 * reader's region.
 *
 * `atlas-manager` holds a collection-wide `managers: read` so its pickers can
 * list other managers (#821), and a self-scoped `Where` would empty them. This
 * is the narrowing that costs nothing: the list still answers, each row
 * carrying the title alone.
 *
 * A **merge** in both directions: `...field.access` keeps the `update` locks
 * `type` and `roles` declare, and a field that declares its own `read` keeps
 * that one. One expression covers the whole `Field` union rather than a branch
 * per type.
 *
 * ⚠ **Assigning `access` here stands `applyFieldAccessForTranslatableCollections`
 * down**, because that pass acts only `if (!field.access)`
 * (`src/plugins/access/fieldAccess.ts`). Moot while no role grants `translate`
 * on `managers`, and the day one does, that pass would silently cover none of
 * these fields.
 *
 * ⚠ The `collapsible` arm is load-bearing today, not future-proofing:
 * `legacyMigrationFields()` returns a top-level `collapsible` holding
 * `legacyId` and `legacyData` — the imported Atlas row verbatim.
 *
 * Locking an `array` or `group` wholesale is enough: the value sits under the
 * parent's own name, which is what `afterRead` deletes. ⚠ A denied array comes
 * back as `[]` rather than absent — access control deletes the key and the
 * array branch then re-assigns an empty array.
 *
 * ⚠ It reaches only the fields passed to it, so a field appended after this
 * runs carries its own lock. `loginPlugin`'s three machine columns are that
 * case; `email` and `_verified` are declared in `Managers.ts` so the merge has
 * something to attach to. `sessions` needs neither: Payload merges it in at
 * sanitize, carrying its own self-only lock.
 */
export function lockManagerFieldReads(fields: Field[]): Field[] {
  return fields.map((field): Field => {
    if (field.type === 'tabs') {
      return {
        ...field,
        tabs: field.tabs.map((tab) => ({ ...tab, fields: lockManagerFieldReads(tab.fields) })),
      }
    }
    if (field.type === 'row' || field.type === 'collapsible') {
      return { ...field, fields: lockManagerFieldReads(field.fields) }
    }
    if (field.type === 'ui' || !('name' in field) || MANAGER_PUBLIC_FIELDS.has(field.name)) {
      return field
    }
    const lock = MANAGER_REGION_CONTACT_FIELDS.has(field.name)
      ? regionContactFieldAccess
      : selfOrAdminFieldAccess
    // `as Field` because `JoinField` declares `access.create?: never`, which the
    // spread-merged object is not assignable to.
    return { ...field, access: { ...field.access, read: field.access?.read ?? lock } } as Field
  })
}
