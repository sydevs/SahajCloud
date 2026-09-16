import type { PayloadRequest } from 'payload'

import { getRegionWebPaths } from '@/lib/atlas/regionTree'
// The `documentManagers` copy, not `@/lib/utilities/relationId`. The two are
// not equivalent: this one also resolves a *string* id, and Events.ts has
// always used it. Importing the other would silently change which events
// resolve a path.
import { relationId } from '@/plugins/access/documentManagers'

/**
 * The one place an event's public path is composed — `<regionPath>/<id>`.
 *
 * Shared by `publicUrlFields` (which publishes it as `webPath` / `webUrl`) and
 * `admin.livePreview.url` (which points the preview panel at it), so the two
 * cannot drift. See `Pages/webPath.ts` for why that matters.
 *
 * ⚠ **This reads the whole region tree.** `getRegionWebPaths` is memoised per
 * request, so a save costs one read rather than one per call — but Payload's
 * own docs warn against expensive work in `livePreview.url`, which re-resolves
 * on every save. Events has no autosave, so that is one read per deliberate
 * save. Do not copy this shape onto a collection that autosaves.
 */
export async function buildEventWebPath(opts: {
  data: { id?: unknown; region?: unknown } | null | undefined
  req: PayloadRequest
}): Promise<string | null> {
  const regionId = relationId(opts.data?.region)
  const id = opts.data?.id
  if (regionId == null || typeof id !== 'number') return null

  const regionPath = (await getRegionWebPaths(opts.req)).get(regionId)

  return regionPath != null ? `${regionPath}/${id}` : null
}
