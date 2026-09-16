import type { PayloadRequest } from 'payload'

import { getRegionWebPaths } from '@/lib/atlas/regionTree'

/**
 * The one place a region's public path is composed — its ordered ancestor slug
 * chain, `/belgium/flanders/antwerp`.
 *
 * Shared by `publicUrlFields` (which publishes it as `webPath` / `webUrl`) and
 * `admin.livePreview.url` (which points the preview panel at it), so the two
 * cannot drift. See `Pages/webPath.ts` for why that matters.
 *
 * Returns `null` when the chain cannot be resolved — a region whose ancestry
 * includes an empty slug has no addressable path, and the panel shows the
 * "unavailable" page rather than a URL that 404s.
 */
export async function buildRegionWebPath(opts: {
  data: { id?: unknown } | null | undefined
  req: PayloadRequest
}): Promise<string | null> {
  const id = opts.data?.id
  if (typeof id !== 'number') return null

  return (await getRegionWebPaths(opts.req)).get(id) ?? null
}
