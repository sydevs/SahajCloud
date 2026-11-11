import type { ServerComponentProps } from 'payload'

import { FieldDescription } from '@payloadcms/ui'

import { loadManagerContacts } from './data'
import { ManagerContactsTable } from './ManagerContactsTable'

/**
 * The contact details of the managers a region or an event names, under the
 * description of the picker that names them — one component for both,
 * registered as the `Description` of `Regions.managers` and `Events.manager`
 * (#908). It renders the field's own description first, so the field reads the
 * same as any other to a visitor the table is not for.
 *
 * A server component, so the gate and the rows never reach a visitor the gate
 * refuses: for them, for a row with nobody named, and on the create screen, the
 * table is left out. It shows the saved row, never the picker's unsaved value.
 *
 * ⚠ Both fields also declare an empty `afterInput`, without which Payload
 * renders a `Description` once and keeps it through a save. With it, this runs
 * its reads on every form-state request.
 */
export default async function ManagerContacts({
  collectionSlug,
  data,
  field,
  id,
  path,
  req,
}: Pick<ServerComponentProps, 'collectionSlug' | 'data' | 'field' | 'id' | 'req'> & {
  path?: string
}) {
  const description = (field as { admin?: { description?: unknown } }).admin?.description
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
        <FieldDescription description={description} path={path ?? ''} />
      )}
      {rows?.length ? <ManagerContactsTable rows={rows} /> : null}
    </>
  )
}
