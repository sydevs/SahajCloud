import type { ManagerContactsCollection } from './data'
import type { UIFieldServerComponent } from 'payload'

import { loadManagerContacts } from './data'
import { ManagerContactsTable } from './ManagerContactsTable'

const DESCRIPTIONS: Record<ManagerContactsCollection, string> = {
  regions: 'Shown only to admins and to the managers of this region and of the regions above it.',
  events:
    'Shown only to admins, to this event’s manager, and to the managers of its region and of the regions above it.',
}

/**
 * The contact details of the managers a region or an event names, for the
 * people who have to follow up with them — one component for both
 * collections, registered by `managerContactsField` (#908).
 *
 * A server component, so the gate and the rows never reach a visitor the gate
 * refuses: for them, and for a row with nobody named, it renders nothing, and
 * the picker above still shows the names.
 */
const ManagerContacts: UIFieldServerComponent = async ({ collectionSlug, data, id, path, req }) => {
  if (collectionSlug !== 'regions' && collectionSlug !== 'events') return null

  const docID = id ?? (data as { id?: number | string } | undefined)?.id
  const rows = await loadManagerContacts(req, collectionSlug, docID)
  if (!rows?.length) return null

  return <ManagerContactsTable description={DESCRIPTIONS[collectionSlug]} path={path} rows={rows} />
}

export default ManagerContacts
