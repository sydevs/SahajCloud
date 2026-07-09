import type { EventFeature, GeoJsonPoint } from './responseTypes'
import type { Endpoint, PopulateType, SelectType, Sort, Where } from 'payload'

import { APIError } from 'payload'

import { requireActiveClient } from '@/lib/endpoints'
import type { Event } from '@/payload-types'
import { CUSTOM_READS, publicReadCacheHeaders } from '@/plugins/cache'

/** Build a `[lon, lat]` Point from an event's address, or `null` when coordinates are absent. */
function pointGeometry(doc: Event): GeoJsonPoint | null {
  const lat = doc.address?.latitude
  const lng = doc.address?.longitude
  return typeof lat === 'number' && typeof lng === 'number'
    ? { type: 'Point', coordinates: [lng, lat] }
    : null
}

/** qs parses everything as strings; coerce the numeric find params (undefined when absent/invalid). */
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

const toBoolean = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

/**
 * GET /api/events/geojson
 *
 * A thin GeoJSON wrapper over a standard published-events read. It forwards the
 * caller's `where` / `select` / `populate` / `depth` / `sort` / pagination (and
 * `locale`, which rides along on `req`) straight into `payload.find('events')`
 * and returns a `FeatureCollection`. The client `req` is passed through
 * *unwrapped* (no `asTrustedReq`), so the usage plugin's
 * `validateClientQueryParamsHook` runs exactly as it does for `GET /api/events`:
 * `select` is required (400 if missing) and `populate` is required when effective
 * `depth > 1`. `overrideAccess: false` applies the published-only +
 * project-visibility filter, and usage tracking fires identically.
 *
 * Each feature's `geometry` is a Point at `[address.longitude, address.latitude]`;
 * callers that want geometry must `select` those fields (e.g.
 * `select[address][longitude]=true&select[address][latitude]=true`). Events
 * without coordinates (online events, or coords not selected) get
 * `geometry: null` and are still returned. `properties` is the
 * selected/populated event document verbatim — AtlasReact maps the internal
 * field names client-side. Selecting `webPath` / `webUrl` (the canonical Atlas
 * path/URL) additionally pulls in `region` / `_status`, which those computed
 * fields derive from (see the `ensureWebPathDeps` beforeOperation hook on Events).
 *
 * Response: `EventFeatureCollection` (see ./responseTypes).
 */
export const eventsGeoJson: Endpoint = {
  path: '/geojson',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const query = req.query as Record<string, unknown>

    try {
      const { docs, ...page } = await req.payload.find({
        collection: 'events',
        where: query.where as Where | undefined,
        select: query.select as SelectType | undefined,
        populate: query.populate as PopulateType | undefined,
        depth: toNumber(query.depth),
        limit: toNumber(query.limit),
        page: toNumber(query.page),
        sort: query.sort as Sort | undefined,
        pagination: toBoolean(query.pagination),
        overrideAccess: false,
        req,
      })

      const features: EventFeature[] = docs.map((doc) => ({
        type: 'Feature',
        id: doc.id,
        geometry: pointGeometry(doc),
        properties: doc as unknown as Record<string, unknown>,
      }))

      return Response.json(
        { type: 'FeatureCollection', features, ...page },
        {
          headers: publicReadCacheHeaders(req, CUSTOM_READS.eventsGeojson),
        },
      )
    } catch (error) {
      // validateClientQueryParamsHook throws APIError(400) for a missing
      // select / populate-at-depth>1, and validateClientOriginHook throws
      // APIError(403) for a disallowed origin — surface status + message verbatim.
      if (error instanceof APIError) {
        return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
      }
      req.payload.logger.error({
        msg: 'eventsGeoJson: read failed',
        clientId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { errors: [{ message: 'Failed to build the GeoJSON feed.' }] },
        { status: 500 },
      )
    }
  },
}
