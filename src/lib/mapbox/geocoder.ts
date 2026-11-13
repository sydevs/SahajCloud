/**
 * Server-side Mapbox forward-geocoder for the Atlas Regions import (#479).
 *
 * `Regions.mapboxId` is required on every node and Atlas's `osm_id` does not map
 * to a Mapbox id, so the importer resolves each node to a real `mapbox_id`. The
 * `types` filter per level mirrors `Regions.mapboxId`'s `searchTypesByValue`.
 *
 * ⚠ **Every lookup here is Geocoding v6 asked for as permanent, because every
 * answer is stored.** The Search Box API publishes no `permanent` parameter at
 * all — its answers are temporary-use only short of an account-level agreement
 * with Mapbox — so a column written from one may not be kept (#893).
 *
 * Resolution order (`resolveRegionLocation`):
 *  1. Typed forward search (proximity-biased when legacy coords exist) → real id.
 *     A `venue` has no layer of its own in v6 and is placed by its postal
 *     address instead (`geocodeVenue`).
 *  2. Miss + legacy coords (cities from areas, venues from venues) → the
 *     `manual` sentinel + those coords (venues default a radius — they carry
 *     none), matching what "Enter manually" stores in the admin.
 *  3. Miss + no coords (countries/regions have none) → a looser, untyped search
 *     for a centroid → `manual` + that centroid + a wide radius.
 *  4. Total miss → `manual` with null coords; the caller warns and leaves it for
 *     manual cleanup.
 *
 * Every non-clean resolution carries a `warning` for the caller to log.
 */

import pRetry from 'p-retry'

import { isRecord } from '@/lib/utilities/isRecord'
import type { Region } from '@/payload-types'

import type { MapboxContextLayer, MapboxFeature } from './feature'

/**
 * Geocoding v6, which every lookup in this file runs against.
 *
 * ⚠ **Not Search Box, because Search Box is a type-ahead.** Handed one line —
 * `Hansaring 22, Köln, NRW, 50670` — it put Köln in Kiel, Hannover in Berne and
 * Offenbach in Bad Vilbel: the right street name in the wrong town. v6 takes the
 * street, postcode, town and state as separate fields and grades each match, so
 * a row whose address Mapbox does not hold is caught rather than placed on a
 * namesake street. `AddressSearchField` reads the same id-space, so a region
 * the import matches or creates is one the admin picker can land on too.
 */
const GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/forward'

/** Sentinel `mapboxId` for a hand-entered location — matches `AddressSearchField`. */
export const MANUAL_LOCATION = 'manual'

/** Default radius (m) for a venue/region with no legacy radius. */
const DEFAULT_VENUE_RADIUS_METERS = 500
const DEFAULT_REGION_RADIUS_METERS = 50_000

/**
 * ⚠ **Three attempts of 8 s bound one row at about 25 s.** The bulk import
 * geocodes four rows at a time inside one job, so a slow lookup holds that
 * job's worker for as long as it takes.
 */
const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 8_000
const BASE_BACKOFF_MS = 500

/** Local shorthand — this file names the level in several places. */
type RegionLevel = Region['level']

/** A level v6 holds a layer for. `venue` does not — see `geocodeVenue`. */
type GeocodableLevel = Exclude<RegionLevel, 'venue'>

/**
 * Geocoding v6 `types` per level — mirrors `Regions.mapboxId`'s
 * `searchTypesByValue` so a resolved id round-trips in `AddressSearchField`.
 */
const TYPES_BY_LEVEL: Record<GeocodableLevel, string> = {
  country: 'country',
  region: 'region',
  city: 'place,locality',
}

/** Looser `types` for the coordless fallback (step 3) — just enough for a centroid. */
const FALLBACK_TYPES = 'country,region,district,place,locality'

export interface GeocodeRegionArgs {
  name: string
  level: GeocodableLevel
  latitude?: number | null
  longitude?: number | null
  /** ISO 3166-1 alpha-2 country code — restricts the search to that country so
   *  same-named places in different countries resolve distinctly (e.g. Liverpool
   *  GB vs Liverpool, Nova Scotia CA). */
  countryCode?: string | null
}

/**
 * What one `/forward` lookup came to, after its retries.
 *
 * ⚠ **"Mapbox answered" and "we could not ask" are a different fact about the
 * world, and only the caller knows whether that matters.** "No such place" is
 * final; "we could not ask" is not, and a caller that writes a permanent
 * refusal on the second one turns one outage into rows nobody can re-place.
 * `refused` sits with the first: a 4xx other than 429 is Mapbox rejecting this
 * query, and the same query is rejected however often it is retried — so a
 * caller that waits on it waits forever. `unauthorized` is neither: it is the
 * token, and says nothing about any row. `geocodeRegion` collapses all but an
 * answer to null because its caller is a seed run a maintainer re-runs anyway.
 */
type ForwardAnswer =
  | { kind: 'answered'; feature: MapboxFeature | null }
  | { kind: 'refused'; httpStatus: number }
  | { kind: 'unauthorized'; httpStatus: number }
  | { kind: 'unavailable' }

/** The one rejection `fetchForwardFeature` retries: Mapbox may answer differently. */
class ForwardUnavailable extends Error {}

/** GET the first feature, retrying what may answer differently next time. */
async function fetchForwardFeature(url: string): Promise<ForwardAnswer> {
  try {
    return await pRetry(
      async () => {
        const answer = await attemptForward(url)
        if (!answer) throw new ForwardUnavailable()
        return answer
      },
      {
        // `MAX_ATTEMPTS` counts attempts; `retries` counts the ones after the first.
        retries: MAX_ATTEMPTS - 1,
        minTimeout: BASE_BACKOFF_MS,
        shouldRetry: ({ error }) => error instanceof ForwardUnavailable,
      },
    )
  } catch {
    return { kind: 'unavailable' }
  }
}

/** One request, or null when it is worth asking again. */
async function attemptForward(url: string): Promise<ForwardAnswer | null> {
  let res: Response
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (res.status === 401 || res.status === 403) {
    return { kind: 'unauthorized', httpStatus: res.status }
  }
  if (res.status === 408 || res.status === 429 || res.status >= 500) return null
  if (!res.ok) return { kind: 'refused', httpStatus: res.status }

  // ⚠ A body that did not arrive whole is not an empty result. The timeout
  // still runs while it streams, so an abort lands here as easily as at the
  // fetch — and reading it as "no features" is a permanent miss for a row
  // Mapbox never got to answer.
  const data: unknown = await res.json().catch(() => null)
  if (!isRecord(data) || !Array.isArray(data.features)) return null
  return { kind: 'answered', feature: (data.features[0] as MapboxFeature | undefined) ?? null }
}

interface ForwardQuery {
  q: string
  types: string
  countryCode?: string | null
  latitude?: number | null
  longitude?: number | null
}

function accessToken(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || null
}

/**
 * What every lookup in this file sends, whatever shape its query takes.
 *
 * ⚠ **`permanent` belongs here and nowhere else.** Both builders below target
 * the same endpoint, so a lookup assembled without this one is a lookup whose
 * answer may not be stored — and every answer here is (#893).
 */
function baseParams(
  types: string,
  countryCode: string | null | undefined,
  token: string,
): URLSearchParams {
  const params = new URLSearchParams({
    types,
    limit: '1',
    language: 'en',
    permanent: 'true',
    access_token: token,
  })
  // Restrict to the country so same-named places elsewhere don't win.
  if (countryCode) params.set('country', countryCode.toLowerCase())
  return params
}

/** The `/forward` URL for a free-text query. */
function forwardUrl(query: ForwardQuery, token: string): string {
  const params = baseParams(query.types, query.countryCode, token)
  params.set('q', query.q)
  // Bias toward the coordinates when the caller has them.
  if (query.latitude != null && query.longitude != null) {
    params.set('proximity', `${query.longitude},${query.latitude}`)
  }
  return `${GEOCODE_URL}?${params.toString()}`
}

/** Run a `/forward` query; null when no token / query / match. */
async function forwardFeature(query: ForwardQuery): Promise<MapboxFeature | null> {
  const token = accessToken()
  if (!token || !query.q?.trim()) return null
  const answer = await fetchForwardFeature(forwardUrl(query, token))
  return answer.kind === 'answered' ? answer.feature : null
}

/** Forward-geocode a region node to a `mapbox_id`, or null on a miss. */
export async function geocodeRegion(args: GeocodeRegionArgs): Promise<string | null> {
  const feature = await forwardFeature({
    ...args,
    q: args.name,
    types: TYPES_BY_LEVEL[args.level],
  })
  return feature?.properties?.mapbox_id ?? null
}

/** A geocoded id, or the manual sentinel with the coordinates Regions requires. */
export type RegionLocation =
  | { mapboxId: string; manual: false }
  | {
      mapboxId: typeof MANUAL_LOCATION
      manual: true
      latitude: number | null
      longitude: number | null
      radius: number | null
    }

export interface ResolveRegionLocationResult {
  location: RegionLocation
  /** Set when a fallback was used (caller logs it); null on a clean geocode. */
  warning: string | null
}

export interface ResolveRegionLocationArgs {
  name: string
  level: RegionLevel
  latitude?: number | null
  longitude?: number | null
  /** ISO 3166-1 alpha-2 country code — narrows geocoding to that country. */
  countryCode?: string | null
  /** Legacy radius (areas carry one; venues/regions/countries don't). */
  radius?: number | null
  /** A `venue`'s postal address, which is the only way v6 places one. */
  address?: Omit<GeocodeVenueArgs, 'countryCode'>
}

/**
 * Resolve a region node's full location, applying the fallback chain above.
 * Returns the patch to write onto the Regions doc (`mapboxId` + manual coords)
 * plus an optional warning for the importer to log.
 */
export async function resolveRegionLocation(
  args: ResolveRegionLocationArgs,
): Promise<ResolveRegionLocationResult> {
  // 1. Typed forward geocode → real, round-trippable id.
  const id =
    args.level === 'venue'
      ? await geocodeVenue({ ...args.address, countryCode: args.countryCode })
      : await geocodeRegion({ ...args, level: args.level })
  if (id) return { location: { mapboxId: id, manual: false }, warning: null }

  // 2. Miss but we have legacy coords (cities, venues) → manual + those coords.
  if (args.latitude != null && args.longitude != null) {
    const radius =
      args.radius ??
      (args.level === 'venue' ? DEFAULT_VENUE_RADIUS_METERS : DEFAULT_REGION_RADIUS_METERS)
    return {
      location: {
        mapboxId: MANUAL_LOCATION,
        manual: true,
        latitude: args.latitude,
        longitude: args.longitude,
        radius,
      },
      warning: `No Mapbox ${args.level} match for "${args.name}"; using legacy coordinates (manual).`,
    }
  }

  // 3. Miss + no coords (countries/regions) → looser search for a centroid.
  const feature = await forwardFeature({ ...args, q: args.name, types: FALLBACK_TYPES })
  const coords = feature?.geometry?.coordinates
  if (coords) {
    return {
      location: {
        mapboxId: MANUAL_LOCATION,
        manual: true,
        longitude: coords[0],
        latitude: coords[1],
        radius: DEFAULT_REGION_RADIUS_METERS,
      },
      warning: `No Mapbox ${args.level} match for "${args.name}"; approximated centroid (manual) — verify.`,
    }
  }

  // 4. Unresolvable — manual with null coords; caller warns + leaves for cleanup.
  return {
    location: {
      mapboxId: MANUAL_LOCATION,
      manual: true,
      latitude: null,
      longitude: null,
      radius: null,
    },
    warning: `Could not resolve a location for ${args.level} "${args.name}" — left for manual cleanup.`,
  }
}

/**
 * One geocoded address or city: the point, the matched feature, and the town
 * it sits in. The region importer wants only an id (`geocodeRegion`); the bulk
 * event import wants the point and the town, because the town is what picks the
 * city region a class is filed under. Same endpoint, same retry, different answer.
 */
export interface GeocodedLocation {
  /** The matched feature's own id, for a later `retrieve` or an address's `mapboxId`. */
  mapboxId: string | null
  /** Mapbox's `feature_type`: `address`, `street`, `postcode`, `place`, `locality`… */
  featureType: string | null
  latitude: number
  longitude: number
  /** The `place` layer — the town or city, as Mapbox names it. */
  placeName: string | null
  /** The `place` layer's own id, which a city region's `mapboxId` holds. */
  placeId: string | null
}

/** Whichever key this Mapbox response spelled a context layer's id with. */
function contextLayerId(entry: MapboxContextLayer | undefined): string | null {
  return entry?.mapbox_id ?? entry?.id ?? null
}

/** The `feature_type`s that are a town, which a place lookup is answered with. */
const TOWN_FEATURE_TYPES = new Set(['place', 'locality'])

/**
 * One lookup, field by field: an address placed by its street, postcode and
 * town, or a town alone (an online class has no hall).
 */
export interface GeocodeLocationArgs {
  kind: 'address' | 'place'
  /** The street and number, for an address lookup. */
  address?: string | null
  postcode?: string | null
  city: string
  /** The state or province as the row wrote it — a name or a code. */
  region?: string | null
  /** ISO alpha-2 to restrict the search to. */
  countryCode: string
}

/**
 * The layers each lookup may answer with. An address lookup still reaches a
 * street or a town when the street number is unknown, which the caller reads
 * as an approximate answer rather than a miss.
 */
const LOOKUP_TYPES: Record<GeocodeLocationArgs['kind'], string> = {
  address: 'address,street,postcode,place,locality',
  place: 'place,locality',
}

/** The v6 structured query for one lookup. */
function lookupUrl(args: GeocodeLocationArgs, token: string): string {
  const params = baseParams(LOOKUP_TYPES[args.kind], args.countryCode, token)
  const fields: [string, null | string | undefined][] = [
    ['address_line1', args.kind === 'address' ? args.address : null],
    ['postcode', args.kind === 'address' ? args.postcode : null],
    ['place', args.city],
    ['region', args.region],
  ]
  for (const [key, value] of fields) if (value?.trim()) params.set(key, value.trim())
  return `${GEOCODE_URL}?${params.toString()}`
}

/**
 * ⚠ **Only `missed` and `refused` are about the row, and the caller must not
 * collapse the rest into them.** A miss is a fact about the query — the row
 * names a place Mapbox does not hold — and a refusal is Mapbox rejecting the
 * query itself (`httpStatus` says how), which asking again cannot change; both
 * are final. `unavailable` is a fact about us — the retries ran out — and
 * `unconfigured` about this deployment: no token (`httpStatus` null), or one
 * Mapbox rejects (401/403). A caller that writes a row error on either turns a
 * few minutes of trouble, or one missing variable, into rows a volunteer can
 * only fix by re-uploading the file.
 */
export type GeocodeOutcome =
  | { status: 'found'; location: GeocodedLocation }
  | { status: 'missed' }
  | { status: 'refused'; httpStatus: number }
  | { status: 'unavailable' }
  | { status: 'unconfigured'; httpStatus: number | null }

/** Forward-geocode one query to a point and its context. */
export async function geocodeLocation(args: GeocodeLocationArgs): Promise<GeocodeOutcome> {
  const token = accessToken()
  if (!token) return { status: 'unconfigured', httpStatus: null }
  if (!args.city.trim() && !args.address?.trim()) return { status: 'missed' }

  const answer = await fetchForwardFeature(lookupUrl(args, token))
  if (answer.kind === 'unavailable') return { status: 'unavailable' }
  if (answer.kind === 'unauthorized')
    return { status: 'unconfigured', httpStatus: answer.httpStatus }
  if (answer.kind === 'refused') return { status: 'refused', httpStatus: answer.httpStatus }

  const coordinates = answer.feature?.geometry?.coordinates
  // A feature without a point is a miss rather than an answer: the zone and
  // every duplicate rule read the point, so there is nothing to place.
  if (!coordinates) return { status: 'missed' }

  const properties = answer.feature?.properties
  const context = properties?.context
  const featureType = properties?.feature_type ?? null
  // `locality` carries the town where a country files one below `place`, so it
  // is read as the city wherever `place` is absent rather than left blank. A
  // town that is itself the match has no layer above it naming it, so it
  // stands for its own city.
  const place =
    context?.place ??
    (featureType && TOWN_FEATURE_TYPES.has(featureType)
      ? { mapbox_id: properties?.mapbox_id, name: properties?.name }
      : undefined) ??
    context?.locality

  return {
    status: 'found',
    location: {
      mapboxId: properties?.mapbox_id ?? null,
      featureType,
      longitude: coordinates[0],
      latitude: coordinates[1],
      placeName: place?.name ?? null,
      placeId: contextLayerId(place),
    },
  }
}

/**
 * The id Mapbox matched, but only where it matched an `address` feature — a
 * single street number — and null for every coarser `feature_type`.
 *
 * ⚠ **A feature id names what Mapbox matched, not what was asked for.** A
 * lookup that reaches only the street or the town answers with that street's
 * or town's id, and storing it would put the place at the end of the road.
 * Every caller that writes an address's id reads it through here.
 */
export function addressFeatureMapboxId(location: GeocodedLocation): string | null {
  return location.featureType === 'address' ? location.mapboxId : null
}

/** A venue's postal address — the only thing v6 can place a venue by. */
export interface GeocodeVenueArgs {
  /** The street and number. */
  street?: string | null
  postCode?: string | null
  city?: string | null
  /** ISO 3166-1 alpha-2 to restrict the search to. */
  countryCode?: string | null
}

/**
 * A venue's own `mapbox_id`, from the structured address lookup.
 *
 * ⚠ **v6 carries no POI layer, so a building's name finds nothing** — the query
 * is the venue's postal address. A coarser answer is a miss, so the caller
 * keeps its own coordinates instead.
 */
export async function geocodeVenue(args: GeocodeVenueArgs): Promise<string | null> {
  const city = args.city?.trim()
  const countryCode = args.countryCode?.trim()
  if (!city || !countryCode || !args.street?.trim()) return null

  const outcome = await geocodeLocation({
    kind: 'address',
    address: args.street,
    postcode: args.postCode,
    city,
    countryCode,
  })
  return outcome.status === 'found' ? addressFeatureMapboxId(outcome.location) : null
}
