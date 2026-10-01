/**
 * Server-side Mapbox forward-geocoder for the Atlas Regions import (#479).
 *
 * `Regions.mapboxId` is required on every node and Atlas's `osm_id` does not map
 * to a Mapbox id, so the importer resolves each node to a real Search Box
 * `mapbox_id`. We use the Search Box **`/forward`** endpoint (not the classic
 * Geocoding API) because that's the id-space the admin `AddressSearchField`
 * (`@mapbox/search-js-react`) produces and consumes — so a stored id round-trips
 * in the UI. The `types` filter per level mirrors `Regions.mapboxId`'s
 * `searchTypesByValue`.
 *
 * Resolution order (`resolveRegionLocation`):
 *  1. Typed forward search (proximity-biased when legacy coords exist) → real id.
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

import { resolveSubdivisionCode } from '@/lib/geography'
import type { Region } from '@/payload-types'

const FORWARD_URL = 'https://api.mapbox.com/search/searchbox/v1/forward'

/** Sentinel `mapboxId` for a hand-entered location — matches `AddressSearchField`. */
export const MANUAL_LOCATION = 'manual'

/** Default radius (m) for a venue/region with no legacy radius. */
const DEFAULT_VENUE_RADIUS_METERS = 500
const DEFAULT_REGION_RADIUS_METERS = 50_000

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

/** Local shorthand — this file names the level four times. */
type RegionLevel = Region['level']

/**
 * Mapbox Search Box `types` per level — mirrors `Regions.mapboxId`'s
 * `searchTypesByValue` so a resolved id round-trips in `AddressSearchField`.
 */
const TYPES_BY_LEVEL: Record<RegionLevel, string> = {
  country: 'country',
  region: 'region',
  city: 'place,locality',
  venue: 'poi,address',
}

/** Looser `types` for the coordless fallback (step 3) — just enough for a centroid. */
const FALLBACK_TYPES = 'country,region,district,place,locality'

export interface GeocodeRegionArgs {
  name: string
  level: RegionLevel
  latitude?: number | null
  longitude?: number | null
  /** ISO 3166-1 alpha-2 country code — restricts the search to that country so
   *  same-named places in different countries resolve distinctly (e.g. Liverpool
   *  GB vs Liverpool, Nova Scotia CA). */
  countryCode?: string | null
  /** Override the Mapbox `types` filter (the untyped fallback uses this). */
  types?: string
}

/**
 * ⚠ **A context layer's id arrives under one of two keys.**
 * `@mapbox/search-js-core`'s own types call it `id`
 * (`dist/searchbox/types.d.ts`, `ContextEntry`) while the Search Box API
 * reference calls it `mapbox_id`. Reading both is the only way to be right
 * either way, and `geocodedPlaceId` is where that choice lives.
 */
interface ForwardContextEntry {
  id?: string
  mapbox_id?: string
  name?: string
}

interface ForwardFeature {
  properties?: {
    mapbox_id?: string
    name?: string
    address?: string
    context?: {
      country?: ForwardContextEntry & { country_code?: string }
      region?: ForwardContextEntry & { region_code?: string; region_code_full?: string }
      place?: ForwardContextEntry
      locality?: ForwardContextEntry
      address?: ForwardContextEntry
    }
  }
  geometry?: { coordinates?: [number, number] }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Mapbox answered, or it did not.
 *
 * ⚠ **The two are a different fact about the world, and only the caller knows
 * whether that matters.** "No such place" is final; "we could not ask" is not,
 * and a caller that writes a permanent refusal on the second one turns one
 * outage into rows nobody can re-place. `geocodeRegion` collapses both to null
 * because its caller is a seed run a maintainer re-runs anyway.
 */
type ForwardAnswer = { answered: true; feature: ForwardFeature | null } | { answered: false }

/** GET the first `/forward` feature, retrying on 429 with exponential backoff. */
async function fetchForwardFeature(params: URLSearchParams): Promise<ForwardAnswer> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      // Fresh timeout per attempt so each retry gets its own 15s budget.
      res = await fetch(`${FORWARD_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      if (attempt < MAX_RETRIES) {
        await delay(BASE_BACKOFF_MS * 2 ** attempt)
        continue
      }
      return { answered: false }
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await delay(BASE_BACKOFF_MS * 2 ** attempt)
      continue
    }
    if (!res.ok) return { answered: false }
    const data = (await res.json().catch(() => null)) as { features?: ForwardFeature[] } | null
    return { answered: true, feature: data?.features?.[0] ?? null }
  }
}

interface ForwardQuery {
  q: string
  types: string
  countryCode?: string | null
  latitude?: number | null
  longitude?: number | null
}

/** The `/forward` query string, or null when there is no token or nothing to search for. */
function forwardParams(query: ForwardQuery): URLSearchParams | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!token || !query.q.trim()) return null
  const params = new URLSearchParams({
    q: query.q,
    types: query.types,
    limit: '1',
    language: 'en',
    access_token: token,
  })
  // Bias toward the coordinates when the caller has them.
  if (query.latitude != null && query.longitude != null) {
    params.set('proximity', `${query.longitude},${query.latitude}`)
  }
  // Restrict to the country so same-named places elsewhere don't win.
  if (query.countryCode) params.set('country', query.countryCode.toLowerCase())
  return params
}

/** Run a `/forward` query for one region node; null when no token / name / match. */
async function forwardFeature(args: GeocodeRegionArgs): Promise<ForwardFeature | null> {
  const params = forwardParams({
    q: args.name ?? '',
    types: args.types ?? TYPES_BY_LEVEL[args.level],
    countryCode: args.countryCode,
    latitude: args.latitude,
    longitude: args.longitude,
  })
  if (!params) return null
  const answer = await fetchForwardFeature(params)
  return answer.answered ? answer.feature : null
}

/** Forward-geocode a region node to a Search Box `mapbox_id`, or null on a miss. */
export async function geocodeRegion(args: GeocodeRegionArgs): Promise<string | null> {
  const feature = await forwardFeature(args)
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
  const id = await geocodeRegion(args)
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
  const feature = await forwardFeature({ ...args, types: FALLBACK_TYPES })
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
 * One geocoded address or city, with the administrative context around it.
 *
 * The region importer wants only an id (`geocodeRegion`); the bulk event import
 * wants the point *and* its country, subdivision and city, because it has to
 * decide whether the row landed inside the batch's target region and which city
 * the row groups under. Same endpoint, same retry, different answer.
 */
export interface GeocodedLocation {
  /** The matched feature's own id, for a later `retrieve` or a region's `mapboxId`. */
  mapboxId: string | null
  latitude: number
  longitude: number
  /** ISO alpha-2 of the country the result sits in. */
  countryCode: string | null
  /** ISO 3166-2 subdivision code, resolved from whichever spelling Mapbox sent. */
  subdivisionCode: string | null
  /** The `place` layer — the town or city, as Mapbox names it. */
  placeName: string | null
  /** The `place` layer's own id, which a region node can be matched on. */
  placeId: string | null
}

/** Whichever key this Mapbox response spelled a context layer's id with. */
function geocodedPlaceId(entry: ForwardContextEntry | undefined): string | null {
  return entry?.mapbox_id ?? entry?.id ?? null
}

export interface GeocodeLocationArgs {
  /** The whole query on one line — `"Oranienstraße 25, Berlin, DE"`. */
  query: string
  /** Mapbox `types` filter. An address lookup and a city lookup want different ones. */
  types: string
  /** ISO alpha-2 to restrict the search to. */
  countryCode?: string | null
}

/**
 * ⚠ **`missed` and `unavailable` must not be collapsed by the caller.** A miss
 * is a fact about the query — the row names a place Mapbox does not hold, and
 * saying so is final. `unavailable` is a fact about us: no token, or the retries
 * ran out. A caller that writes a row error on the second one turns a few
 * minutes of Mapbox trouble into rows a volunteer can only fix by re-uploading
 * the file.
 */
export type GeocodeOutcome =
  | { status: 'found'; location: GeocodedLocation }
  | { status: 'missed' }
  | { status: 'unavailable' }

/** Forward-geocode one query to a point and its context. */
export async function geocodeLocation(args: GeocodeLocationArgs): Promise<GeocodeOutcome> {
  const params = forwardParams({
    q: args.query,
    types: args.types,
    countryCode: args.countryCode,
  })
  if (!params) return { status: 'unavailable' }

  const answer = await fetchForwardFeature(params)
  if (!answer.answered) return { status: 'unavailable' }

  const coordinates = answer.feature?.geometry?.coordinates
  // A feature without a point is a miss rather than an answer: the zone and
  // every duplicate rule read the point, so there is nothing to place.
  if (!coordinates) return { status: 'missed' }

  const context = answer.feature?.properties?.context
  const countryCode = context?.country?.country_code ?? null
  // `locality` carries the town where a country files one below `place`, so it
  // is read as the city wherever `place` is absent rather than left blank.
  const place = context?.place ?? context?.locality

  return {
    status: 'found',
    location: {
      mapboxId: answer.feature?.properties?.mapbox_id ?? null,
      longitude: coordinates[0],
      latitude: coordinates[1],
      countryCode,
      subdivisionCode: resolveSubdivisionCode(context?.region, countryCode),
      placeName: place?.name ?? null,
      placeId: geocodedPlaceId(place),
    },
  }
}
