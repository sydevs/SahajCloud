import type { FieldPaths, RelationshipField, ServerComponentProps } from 'payload'

import { FieldDescription } from '@payloadcms/ui'

import { loadManagerContacts } from './data'
import { ManagerContactsTable } from './ManagerContactsTable'

/**
 * The `Description` of `Regions.managers` and `Events.manager`: the field's own
 * description, then the contacts table for the callers `loadManagerContacts`
 * admits (#908). It shows the saved row, never the picker's unsaved value.
 *
 * ⚠ The `Description` slot, not `afterInput`, because the table goes under the
 * description, and `Relationship/Input` renders `afterInput` above it.
 *
 * ⚠ Both fields also declare an empty `afterInput`, or Payload renders a
 * `Description` once and keeps it through a save (`renderField`'s
 * `hasBeforeOrAfterInput`). The cost: these reads run on every form-state
 * request.
 */
export default async function ManagerContacts({
  collectionSlug,
  data,
  field,
  id,
  path,
  req,
}: Pick<FieldPaths, 'path'> &
  Pick<ServerComponentProps, 'collectionSlug' | 'data' | 'id' | 'req'> & {
    // Narrowed: `row` and `tabs` in the `Field` union carry no description.
    field: RelationshipField
  }) {
  const description = field.admin?.description
  const rows =
    collectionSlug === 'regions' || collectionSlug === 'events'
      ? await loadManagerContacts(
          req,
          collectionSlug,
          id ?? (data as { id?: number | string } | undefined)?.id,
        )
      : null

  return (
    <>
      {typeof description === 'string' && (
        <FieldDescription description={description} path={path} />
      )}
      {rows?.length ? <ManagerContactsTable rows={rows} /> : null}
    </>
  )
}
