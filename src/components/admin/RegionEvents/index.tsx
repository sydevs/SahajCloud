import type { JoinFieldServerComponent } from 'payload'

import { descendantRegionIds, getRegionTree } from '@/lib/atlas/regionTree'

import { RegionEventsTable } from './RegionEventsTable'
import { readAsRequestUser } from '../helpers/readAsRequestUser'

/**
 * The Regions "Events" tab's table: every class in this region's **subtree**,
 * not only the ones stored against the node itself.
 *
 * A join resolves one reverse lookup, and `events.region` admits a city or a
 * venue only, so the native `on: 'region'` table is empty on a country and a
 * region — the absence #1145 answered by hiding the tab. The child-level tabs
 * reach their descendants through `breadcrumbs.doc`; events carry no
 * breadcrumbs, so the same trick is unavailable and the subtree is resolved
 * here instead, as `region: { in: … }` — the predicate the home's "Total
 * events" tile already counts by.
 *
 * ⚠ The stored `events` join still answers `on: 'region'` for every API reader.
 * This widening is the admin table's alone.
 */
export const RegionEvents: JoinFieldServerComponent = async ({ clientField, id, path, req }) => {
  const regionId = Number(id)
  if (!Number.isInteger(regionId)) return null

  // ⚠ The gate, not a convenience read: a `form-state` request names its own
  // id and carries its own `data` past nothing but `canAccessAdmin` (#1126,
  // `docs/rules/admin-ui.md`). `level` decides the Add New button below, so it
  // comes from the stored row rather than the form.
  const stored = await readAsRequestUser(req, 'regions', regionId, { level: true })
  if (!stored) return null

  const { chainById } = await getRegionTree(req)

  return (
    <RegionEventsTable
      // A class attaches to a city or a venue, so only those two levels can
      // hold one directly — and only there does seeding `region` produce a
      // document the picker's own `filterOptions` would accept.
      allowCreate={stored.level === 'city' || stored.level === 'venue'}
      // Payload leaves `type` optional on a server component's `clientField`;
      // `RelationshipTable` reads it as required.
      field={{ ...clientField, type: 'join' }}
      path={path}
      regionId={regionId}
      regionIds={descendantRegionIds(chainById, regionId)}
    />
  )
}

export default RegionEvents
