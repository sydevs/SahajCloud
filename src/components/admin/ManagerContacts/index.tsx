import type { ServerComponentProps } from 'payload'

import { loadManagerContacts } from './data'
import { ManagerContactsTable } from './ManagerContactsTable'

/**
 * The contact details of the managers a region or an event names, under the
 * picker that names them — one component for both, registered as the
 * `afterInput` of `Regions.managers` and `Events.manager` (#908).
 *
 * A server component, so the gate and the rows never reach a visitor the gate
 * refuses: for them, for a row with nobody named, and on the create screen,
 * nothing is rendered. It shows the saved row, never the picker's unsaved
 * value.
 *
 * ⚠ **`afterInput`, never `Description`.** Payload renders a `Description` once
 * and keeps it through a save, while a `beforeInput` or `afterInput` key makes
 * `renderField` re-render the field's components on every form-state request —
 * so the table follows a save. The cost is its three reads per such request.
 */
export default async function ManagerContacts({
  collectionSlug,
  data,
  id,
  req,
}: Pick<ServerComponentProps, 'collectionSlug' | 'data' | 'id' | 'req'>) {
  const rows =
    collectionSlug === 'regions' || collectionSlug === 'events'
      ? await loadManagerContacts(
          req,
          collectionSlug,
          id ?? (data as { id?: number | string } | undefined)?.id,
        )
      : null

  return rows?.length ? <ManagerContactsTable rows={rows} /> : null
}
