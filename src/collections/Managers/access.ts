import type { Field, FieldAccess } from 'payload'

import { selfOrAdminFieldAccess } from '@/plugins/access'

/**
 * The fields an `atlas-manager` reads on somebody else's manager row.
 *
 * `admin.useAsTitle` is `name`, so this is the whole of what the
 * `Events.manager` and `Regions.managers` pickers render. Payload appends
 * `createdAt` and `updatedAt` outside `fields`, so the locker never reaches
 * them and they need no entry here.
 */
export const MANAGER_PUBLIC_FIELDS = new Set(['name'])

type WithAccess = { access?: { read?: FieldAccess } }

/**
 * Lock every field on `managers` to the row's own holder and to admins, bar
 * {@link MANAGER_PUBLIC_FIELDS} (#908).
 *
 * `atlas-manager` holds a collection-wide `managers: read` so its pickers can
 * list other managers (#821), and a self-scoped `Where` would empty them. This
 * is the narrowing that costs nothing: the list still answers, each row
 * carrying the title alone.
 *
 * A **merge**, so a stricter hand-written lock wins — `sessions` keeps
 * Payload's own self-only rule. One expression covers the whole `Field` union
 * rather than a branch per type.
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
 * something to attach to.
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
    const existing = (field as WithAccess).access
    return {
      ...field,
      access: { ...existing, read: existing?.read ?? selfOrAdminFieldAccess },
    } as Field
  })
}
