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
 *  2. Miss + legacy coords (cities from areas, centers from venues) → the
 *     `manual` sentinel + those coords (centers default a radius — venues carry
 *     none), matching what "Enter manually" stores in the admin.
 *  3. Miss + no coords (countries/regions have none) → a looser, untyped search
 *     for a centroid → `manual` + that centroid + a wide radius.
 *  4. Total miss → `manual` with null coords; the caller warns and leaves it for
 *     manual cleanup.
 *
 * Every non-clean resolution carries a `warning` for the caller to log.
 */

const FORWARD_URL = 'https://api.mapbox.com/search/searchbox/v1/forward'

/** Sentinel `mapboxId` for a hand-entered location — matches `AddressSearchField`. */
export const MANUAL_LOCATION = 'manual'

/** Default radius (m) for a center/region with no legacy radius. */
const DEFAULT_CENTER_RADIUS_METERS = 500
const DEFAULT_REGION_RADIUS_METERS = 50_000

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

/** The Atlas geo levels, in Payload terms (`area` → `city`). */
export type RegionLevel = 'country' | 'region' | 'city' | 'center'

/**
 * Mapbox Search Box `types` per level — mirrors `Regions.mapboxId`'s
 * `searchTypesByValue` so a resolved id round-trips in `AddressSearchField`.
 */
const TYPES_BY_LEVEL: Record<RegionLevel, string> = {
  country: 'country',
  region: 'region',
  city: 'place,locality',
  center: 'poi,address',
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

interface ForwardFeature {
  properties?: { mapbox_id?: string }
  geometry?: { coordinates?: [number, number] }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** GET the first `/forward` feature, retrying on 429 with exponential backoff. */
async function fetchForwardFeature(params: URLSearchParams): Promise<ForwardFeature | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${FORWARD_URL}?${params.toString()}`)
    } catch {
      if (attempt < MAX_RETRIES) {
        await delay(BASE_BACKOFF_MS * 2 ** attempt)
        continue
      }
      return null
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await delay(BASE_BACKOFF_MS * 2 ** attempt)
      continue
    }
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { features?: ForwardFeature[] } | null
    return data?.features?.[0] ?? null
  }
}

/** Run a `/forward` query for one region node; null when no token / name / match. */
async function forwardFeature(args: GeocodeRegionArgs): Promise<ForwardFeature | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!token || !args.name?.trim()) return null
  const params = new URLSearchParams({
    q: args.name,
    types: args.types ?? TYPES_BY_LEVEL[args.level],
    limit: '1',
    language: 'en',
    access_token: token,
  })
  // Bias toward the legacy coordinates when we have them.
  if (args.latitude != null && args.longitude != null) {
    params.set('proximity', `${args.longitude},${args.latitude}`)
  }
  // Restrict to the region's country so same-named places elsewhere don't win.
  if (args.countryCode) {
    params.set('country', args.countryCode.toLowerCase())
  }
  return fetchForwardFeature(params)
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

  // 2. Miss but we have legacy coords (cities, centers) → manual + those coords.
  if (args.latitude != null && args.longitude != null) {
    const radius =
      args.radius ??
      (args.level === 'center' ? DEFAULT_CENTER_RADIUS_METERS : DEFAULT_REGION_RADIUS_METERS)
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
