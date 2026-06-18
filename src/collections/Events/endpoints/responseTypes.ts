/**
 * Response shapes for the public Atlas Events endpoints — `GET /api/events/geojson`
 * and `POST /api/events/register`. Exported and committed so the AtlasReact
 * frontend can sync them by raw GitHub URL, and kept in step with the OpenAPI
 * schemas in `src/plugins/openapi/customEndpoints.ts` (a tripwire test asserts
 * the runtime shape). Deliberately self-contained — no `@/` imports — so a
 * cross-repo fetch of this single file resolves cleanly.
 */

/** GeoJSON Point. Coordinates are `[longitude, latitude]` (GeoJSON's lon-first axis order). */
export type GeoJsonPoint = { type: 'Point'; coordinates: [number, number] }

/**
 * One GeoJSON Feature wrapping a single event. `geometry` is a Point built from
 * the event's `address.longitude` / `address.latitude` when both are present in
 * the caller's `select` (and set on the event), otherwise `null` — online events
 * and events whose coordinates weren't selected are still returned, geometry-less.
 * `properties` is the selected/populated event document verbatim (internal
 * SahajCloud field names); its field set is driven entirely by the request's
 * `select` / `populate` / `depth`, so it's an open record AtlasReact maps itself.
 */
export type EventFeature = {
  type: 'Feature'
  id: number
  geometry: GeoJsonPoint | null
  properties: Record<string, unknown>
}

/**
 * A GeoJSON FeatureCollection of events, plus Payload's pagination metadata as
 * foreign members — the same fields a normal `GET /api/events` read returns
 * alongside `docs`.
 */
export type EventFeatureCollection = {
  type: 'FeatureCollection'
  features: EventFeature[]
  totalDocs: number
  limit: number
  totalPages: number
  page?: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage?: number | null
  nextPage?: number | null
}

/** Confirmation returned by `POST /api/events/register`. */
export type EventRegistrationResponse = {
  ok: true
  registration: { id: number; uuid: string }
}
