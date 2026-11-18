import type { PayloadRequest, Where } from 'payload'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'
import { buildRegionWebPath } from '@/collections/Regions/webPath'
import { descendantRegionIds, getRegionTree } from '@/lib/atlas/regionTree'
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

  const regionId = relationId(opts.data.region)
  if (!(await hasVisibleClasses(regionId, opts.req))) return { path: null, reason: 'no-classes' }

  // Worldwide, or a region with no path of its own, is the atlas root.
  return { path: (await buildRegionWebPath({ data: { id: regionId }, req: opts.req })) ?? '' }
}

/**
 * Whether the region a service's map opens on holds a class a visitor can see.
 *
 * Three things make this the map's own question rather than a plain count. A
 * class attaches to a city **or** to a venue beneath it, so the whole subtree
 * counts. A finished class stays published and drops off every public feed, so
 * `notFinishedWhere` — the feed's own predicate — answers for it here too. And
 * the read is `overrideAccess: true` because what matters is what a visitor
 * would see, not what the manager looking at this tab may read.
 *
 * Worldwide is every region, so it asks the same question with no region
 * clause: an atlas with nothing published anywhere has nothing to draw either.
 */
async function hasVisibleClasses(regionId: null | number, req: PayloadRequest): Promise<boolean> {
  const scope: Where[] = [{ _status: { equals: 'published' } }, notFinishedWhere(new Date())]

  if (regionId !== null) {
    const { chainById } = await getRegionTree(req)
    scope.push({ region: { in: descendantRegionIds(chainById, regionId) } })
  }

  const { totalDocs } = await req.payload.count({
    collection: 'events',
    overrideAccess: true,
    req,
    where: { and: scope },
  })

  return totalDocs > 0
}
