import type { Field } from 'payload'

import { selfOrAdminFieldAccess } from '@/plugins/access'

/**
 * What anyone holding `managers: read` sees on another manager's row: the
 * pickers' `useAsTitle`. Payload's `createdAt` and `updatedAt` sit outside
 * `fields`, out of the locker's reach.
 */
const MANAGER_PUBLIC_FIELDS = new Set(['name'])

/**
 * Lock every field on `managers` but {@link MANAGER_PUBLIC_FIELDS} to the row's
 * holder and to admins (#908). `atlas-region-manager` reads the collection
 * whole so its pickers can list other managers (#821).
 *
 * A field's own `read` wins, and its other access keys are kept. A named
 * `array` or `group` is locked whole. ⚠ A denied `array` reads back as `[]`,
 * not absent.
 *
 * ⚠ The `collapsible` arm is load-bearing: `legacyMigrationFields()` puts the
 * imported Atlas row in one.
 *
 * ⚠ It reaches only the fields passed to it, so a column `loginPlugin`
 * appends later carries its own lock.
 *
 * ⚠ Setting `access` stands `applyFieldAccessForTranslatableCollections` down,
 * which acts only `if (!field.access)` — moot until a role grants `translate`
 * on `managers`.
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
    // `JoinField` declares `access.create?: never`, which the merge is not.
    return {
      ...field,
      access: { ...field.access, read: field.access?.read ?? selfOrAdminFieldAccess },
    } as Field
  })
}
