/**
 * Server-side Mapbox forward-geocoder for the bulk event import.
 *
 * One row's postal address, or an online class's town alone, resolves to a
 * point plus the town around it — the town is what picks the city region a
 * class is filed under.
 *
 * ⚠ **Every lookup here is Geocoding v6 asked for as permanent, because every
 * answer is stored.** The Search Box API publishes no `permanent` parameter at
 * all — its answers are temporary-use only short of an account-level agreement
 * with Mapbox — so a column written from one may not be kept (#893).
 */

import type { MapboxContextLayer, MapboxFeature, MapboxMatchCode } from './feature'

import pRetry from 'p-retry'

import { isRecord } from '@/lib/utilities/isRecord'

/**
 * Geocoding v6, which every lookup in this file runs against.
 *
 * ⚠ **Not Search Box, because Search Box is a type-ahead.** Handed one line —
 * `Hansaring 22, Köln, NRW, 50670` — it put Köln in Kiel, Hannover in Berne and
 * Offenbach in Bad Vilbel: the right street name in the wrong town. v6 takes the
 * street, postcode, town and state as separate fields. ⚠ **It grades an
 * `address` answer only** (`matchCode`), so whether any coarser answer is the
 * row's own place is the caller's question (`eventImport/locate.ts`).
 * `AddressSearchField` reads the same id-space, so an id this import stores is
 * one the admin picker can land on too.
 */
const GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/forward'

/**
 * ⚠ **Three attempts of 8 s bound one row at about 25 s.** The bulk import
 * geocodes four rows at a time inside one job, so a slow lookup holds that
 * job's worker for as long as it takes.
 */
const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 8_000
const BASE_BACKOFF_MS = 500

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
 * token, and says nothing about any row.
 */
type ForwardAnswer =
  | { kind: 'answered'; feature: MapboxFeature | null }
  | { kind: 'refused'; httpStatus: number; message: null | string }
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
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : null
    return { kind: 'refused', httpStatus: res.status, message }
  }

  // ⚠ A body that did not arrive whole is not an empty result. The timeout
  // still runs while it streams, so an abort lands here as easily as at the
  // fetch — and reading it as "no features" is a permanent miss for a row
  // Mapbox never got to answer.
  const data: unknown = await res.json().catch(() => null)
  if (!isRecord(data) || !Array.isArray(data.features)) return null
  return { kind: 'answered', feature: (data.features[0] as MapboxFeature | undefined) ?? null }
}

function accessToken(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || null
}

/**
 * What every lookup in this file sends.
 *
 * ⚠ **`permanent` belongs here and nowhere else.** Every `/forward` URL is
 * assembled past this one, so no lookup can reach Mapbox without the flag —
 * and every answer here is stored (#893).
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

/**
 * One geocoded address or city: the point, the matched feature, and the town
 * it sits in. The town is what picks the city region a class is filed under.
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
  /** The postcode the answer lies in: a postcode answer's own name, else its `postcode` layer. */
  postcode: string | null
  /** The `region` layer's id — the state or province, which a region's `mapboxId` holds. */
  stateId: string | null
  /** The `country` layer's id, which a country region's `mapboxId` holds. */
  countryId: string | null
  /** v6's grade of an `address` answer, field by field. Null for every coarser feature. */
  matchCode: MapboxMatchCode | null
  /** What Mapbox matched, in one line — shown to a volunteer whose row it is refused for. */
  fullAddress: string | null
}

/** Whichever key this Mapbox response spelled a context layer's id with. */
function contextLayerId(entry: MapboxContextLayer | undefined): string | null {
  return entry?.mapbox_id ?? entry?.id ?? null
}

/** The `feature_type`s that are a town, which a place lookup is answered with. */
const TOWN_FEATURE_TYPES = new Set(['place', 'locality'])

interface LookupScope {
  /** The state or province as the row wrote it — a name or a code. */
  region?: string | null
  /** ISO alpha-2 to restrict the search to. */
  countryCode: string
}

/**
 * One lookup, field by field: an address placed by its street, postcode and
 * town; a town alone (an online class has no hall); or a postcode alone,
 * which asks where the postcode is and so names no town.
 */
export type GeocodeLocationArgs = LookupScope &
  (
    | { kind: 'address'; address?: string | null; postcode?: string | null; city: string }
    | { kind: 'place'; city: string }
    | { kind: 'postcode'; postcode: string }
  )

/**
 * The layers each lookup may answer with. An address lookup still reaches a
 * street or a town when the street number is unknown, which the caller reads
 * as an approximate answer rather than a miss.
 */
const LOOKUP_TYPES: Record<GeocodeLocationArgs['kind'], string> = {
  address: 'address,street,postcode,place,locality',
  place: 'place,locality',
  postcode: 'postcode',
}

/** The v6 structured query for one lookup. */
function lookupUrl(args: GeocodeLocationArgs, token: string): string {
  const params = baseParams(LOOKUP_TYPES[args.kind], args.countryCode, token)
  for (const [key, value] of Object.entries(queryFields(args))) {
    if (value?.trim()) params.set(key, value.trim())
  }
  return `${GEOCODE_URL}?${params.toString()}`
}

/** The v6 fields a lookup sends, by name. */
function queryFields(args: GeocodeLocationArgs): Record<string, null | string | undefined> {
  switch (args.kind) {
    case 'address':
      return {
        address_line1: args.address,
        postcode: args.postcode,
        place: args.city,
        region: args.region,
      }
    case 'place':
      return { place: args.city, region: args.region }
    case 'postcode':
      return { postcode: args.postcode, region: args.region }
  }
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
  /** `message` is Mapbox's own reason, e.g. `Query too long - 21/20 tokens`. */
  | { status: 'refused'; httpStatus: number; message: null | string }
  | { status: 'unavailable' }
  | { status: 'unconfigured'; httpStatus: number | null }

/** Forward-geocode one query to a point and its context. */
export async function geocodeLocation(args: GeocodeLocationArgs): Promise<GeocodeOutcome> {
  const token = accessToken()
  if (!token) return { status: 'unconfigured', httpStatus: null }
  // An address lookup needs a street or a town; a postcode alone is the postcode lookup's.
  const asked =
    args.kind === 'postcode'
      ? [args.postcode]
      : [args.city, args.kind === 'address' ? args.address : null]
  if (!asked.some((value) => value?.trim())) return { status: 'missed' }

  const answer = await fetchForwardFeature(lookupUrl(args, token))
  if (answer.kind === 'unavailable') return { status: 'unavailable' }
  if (answer.kind === 'unauthorized')
    return { status: 'unconfigured', httpStatus: answer.httpStatus }
  if (answer.kind === 'refused') {
    return { status: 'refused', httpStatus: answer.httpStatus, message: answer.message }
  }

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
      postcode: (featureType === 'postcode' ? properties?.name : context?.postcode?.name) ?? null,
      stateId: contextLayerId(context?.region),
      countryId: contextLayerId(context?.country),
      matchCode: (featureType === 'address' && properties?.match_code) || null,
      fullAddress: properties?.full_address ?? null,
    },
  }
}

/**
 * Whether v6 doubts the address it answered with: the town or postcode it
 * matched is not the one asked for, or its own grade is low.
 */
export function isDoubtfulAddress(matchCode: MapboxMatchCode): boolean {
  return (
    matchCode.place === 'unmatched' ||
    matchCode.postcode === 'unmatched' ||
    matchCode.confidence === 'low'
  )
}

/**
 * The id Mapbox matched, but only where it matched an `address` feature — a
 * single street number — that v6 does not doubt, and null for every coarser
 * `feature_type`.
 *
 * ⚠ **A feature id names what Mapbox matched, not what was asked for.** A
 * lookup that reaches only the street or the town answers with that street's
 * or town's id, and storing it would put the place at the end of the road.
 * Every caller that writes an address's id reads it through here.
 */
export function addressFeatureMapboxId(location: GeocodedLocation): string | null {
  if (location.featureType !== 'address') return null
  return location.matchCode && isDoubtfulAddress(location.matchCode) ? null : location.mapboxId
}
