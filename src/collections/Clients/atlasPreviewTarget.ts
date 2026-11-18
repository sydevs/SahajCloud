import type { PayloadRequest, Where } from 'payload'

import { andWhere } from '@/collections/Events/lifecycle/finished'
import { buildRegionWebPath } from '@/collections/Regions/webPath'
import { descendantRegionIds, getRegionTree } from '@/lib/atlas/regionTree'
import { drawnOnMapWhere } from '@/lib/events/mapVisibility'
import type { LivePreviewUnavailableReason } from '@/lib/livePreview/unavailable'
import { relationId } from '@/lib/utilities/relationId'

import { isAtlasClient } from './access'

/**
 * The atlas page a service's Live Preview panel opens on, or the explanation
 * that stands in for it.
 *
 * Two refusals are the service's own state rather than one tab's: no atlas
 * role, and a region with nothing published in it. The second is answered here
 * and not by the widget, because which classes are published is this CMS's own
 * fact — asking the atlas for it would mean a message the widget does not send
 * and a release to make it send one.
 */
export async function atlasPreviewTarget(opts: {
  data: { region?: unknown; roles?: unknown }
  req: PayloadRequest
}): Promise<{ path: null | string; reason?: LivePreviewUnavailableReason }> {
  if (!isAtlasClient(opts.data)) return { path: null, reason: 'no-atlas-role' }

  // Worldwide, or a region with no path of its own, is the atlas root — and
  // the root draws every region, so what the panel will open decides which
  // emptiness to ask about. Both reads share one memoised region tree.
  const regionId = relationId(opts.data.region)
  const path = await buildRegionWebPath({ data: { id: regionId }, req: opts.req })
  const opensOn = path === null ? null : regionId

  if (!(await hasVisibleClasses(opensOn, opts.req))) return { path: null, reason: 'no-classes' }

  return { path: path ?? '' }
}

/**
 * Whether the region a service's map opens on holds a class the map will draw.
 *
 * ⚠ **The feed's own predicate, never a copy of it.** A clause here that the
 * map does not apply tells a manager their region is empty beside a map with a
 * pin on it. A class attaches to a city **or** to a venue beneath it, so the
 * whole subtree counts, and Worldwide asks the same question with no region
 * clause at all.
 *
 * `overrideAccess: true` because the question is what a visitor sees, not what
 * the manager looking at this tab may read. `limit: 1` with `pagination: false`
 * is an existence test: Payload runs no `COUNT(DISTINCT id)` there, so Postgres
 * stops at the first matching row rather than aggregating a whole country — and
 * this resolves on every render and every save of the document, panel open or
 * not, since `livePreview.url` cannot see whether anyone is looking.
 */
async function hasVisibleClasses(regionId: null | number, req: PayloadRequest): Promise<boolean> {
  let subtree: undefined | Where

  if (regionId !== null) {
    const { chainById } = await getRegionTree(req)
    subtree = { region: { in: descendantRegionIds(chainById, regionId) } }
  }

  const { docs } = await req.payload.find({
    collection: 'events',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    // The narrowest column, so no field's `afterRead` runs: the value is
    // unused, and the row's own `id` survives any select.
    select: { inactive: true },
    where: andWhere(subtree, drawnOnMapWhere(new Date())),
  })

  return docs.length > 0
}
