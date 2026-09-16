/**
 * Response shapes for the public Atlas Events endpoints — `GET /api/events/geojson`
 * — plus the registration refusal codes, which outlived the endpoint that
 * minted them. Exported and committed so the AtlasReact frontend can sync them
 * by raw GitHub URL, and kept in step with the OpenAPI schemas in
 * `src/plugins/openapi/customEndpoints.ts` (a tripwire test asserts the runtime
 * shape). Deliberately self-contained — no `@/` imports — so a cross-repo fetch
 * of this single file resolves cleanly.
 *
 * ⚠ **Keep this file at this path.** sydevs/SahajAtlasWeb's `pnpm types:cms`
 * curls this exact raw URL with `curl -fsSL`, so a move or a delete 404s and
 * takes the whole chain down with it — no `payload-types.ts` either.
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

/**
 * Machine-readable reason a registration was refused, so the Atlas widget maps
 * each rejection to its registration-state UI rather than parsing prose.
 *
 * Emitted by the `user-submissions` create gate since the register endpoint was
 * deleted (#800). The codes are unchanged; where they sit in the body is not —
 * see `EventRegistrationError`.
 *
 * - `external_registration` — the event registers off-Atlas, so the widget
 *   links out instead of taking a registration.
 * - `event_ended` — the schedule has fully run out (a one-off past its date, or
 *   a course whose last session is behind us).
 * - `registration_closed` — a limited-run course has already started, so its run
 *   is closed to new registrations.
 * - `event_full` — the registration count has reached the event's limit.
 *
 * Sent on the refusal responses only; the plain not-found 404 carries no `code`.
 */
export type EventRegistrationErrorCode =
  | 'external_registration'
  | 'event_ended'
  | 'registration_closed'
  | 'event_full'

/**
 * Error body for a refused registration.
 *
 * ⚠ **The code moved to `errors[].data.code`.** It is Payload's own `APIError`
 * envelope now, not one an endpoint composed, and Payload puts an error's extra
 * data under `data`. sydevs/SahajAtlasWeb#171 reads both positions, so a client
 * on either side of that change keeps working.
 */
export type EventRegistrationError = {
  errors: { message: string; data?: { code?: EventRegistrationErrorCode } }[]
}
