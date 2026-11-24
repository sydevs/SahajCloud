/**
 * Where a row's class is: Mapbox's answer to its address, kept only when it
 * agrees with the row's own postcode or town.
 *
 * ⚠ **Mapbox's first answer is not evidence of anything.** Asked for an Indian
 * address it holds no street for, v6 answered with a `street` of the same name
 * in another town — Bidar's class in Bengaluru, 550 km off — and grades only an
 * `address` answer, so nothing in the answer itself says so. An answer is kept
 * when v6 graded it a match, or when its postcode is the row's; with no
 * postcode, when its town is the town the row names. Otherwise the row's
 * postcode stands in for the address, pinned at its centre, and only if that
 * postcode lies in the row's town.
 *
 * ⚠ **Only a miss or a refusal is about the row.** The geocoder being down or
 * unconfigured throws, which fails the whole import with that sentence; a row
 * error there would send the volunteer fixing addresses that are fine.
 */

import type { RawImportRow } from './csv/columns'

import { APIError } from 'payload'

import type { GeocodedLocation, GeocodeLocationArgs, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import { geocodeLocation } from '@/lib/mapbox/geocoder'

export type Geocode = (args: GeocodeLocationArgs) => Promise<GeocodeOutcome>

export type LocateResult = { ok: true; location: GeocodedLocation } | { ok: false; error: string }

/** Grades v6 gives an address answer that names a different building or none. */
const WEAK_CONFIDENCE = new Set(['low'])

/** `Query too long - 21/20 tokens`, which v6 answers a long address with as a 422. */
const TOO_LONG_RE = /too long\D+(\d+)\s*\/\s*(\d+)/i

export interface LocateArgs {
  values: RawImportRow
  /**
   * One lookup per town for the whole run, since every row of a city asks the
   * same question. Keyed by `townKey`.
   */
  towns: Map<string, Promise<GeocodeOutcome>>
  geocode?: Geocode
}

/** Find a row's place, or the one sentence saying why it cannot be placed. */
export async function locateRow({
  values,
  towns,
  geocode = geocodeLocation,
}: LocateArgs): Promise<LocateResult> {
  const common = {
    city: values.city ?? '',
    region: values.state,
    countryCode: values.country ?? '',
  }
  const townOf = () => {
    const key = townKey(values)
    let lookup = towns.get(key)
    if (!lookup) {
      lookup = geocode({ kind: 'place', ...common })
      towns.set(key, lookup)
    }
    return lookup
  }

  // An online class is placed by its town alone, which is the answer itself.
  if (values.eventType === 'online') return settle(await townOf())

  const primary = await geocode({
    kind: 'address',
    address: values.address,
    postcode: values.postcode,
    ...common,
  })
  if (primary.status !== 'found') return settle(primary)
  const answer = primary.location
  const postcode = values.postcode?.trim()

  const agreement = agrees(answer, postcode)
  if (agreement === 'yes') return { ok: true, location: answer }

  const town = await townOf()
  if (town.status !== 'found') {
    return town.status === 'missed'
      ? {
          ok: false,
          error: `the city "${values.city}" could not be found — check the city and country`,
        }
      : settle(town)
  }
  const townId = town.location.placeId

  if (!postcode) {
    // A weak address grade still names the right town: kept, but as the
    // approximate pin it is, so the class is checked before it is published.
    if (townId && answer.placeId === townId) {
      return { ok: true, location: agreement === 'no' ? { ...answer, mapboxId: null } : answer }
    }
    return {
      ok: false,
      error: `Mapbox found this address only in ${answer.placeName ?? 'another town'}, not ${values.city} (${supplied(['address', answer])}) — check the address, or add the postcode`,
    }
  }

  const fallback = await geocode({ kind: 'postcode', postcode, ...common })
  if (fallback.status !== 'found') {
    return fallback.status === 'missed'
      ? {
          ok: false,
          error: `the address could not be found in ${values.city}, and neither could postcode ${postcode} (${supplied(['address', answer])}) — check the address, city and postcode`,
        }
      : settle(fallback)
  }
  if (townId && fallback.location.placeId === townId)
    return { ok: true, location: fallback.location }
  return {
    ok: false,
    error: `postcode ${postcode} is in ${fallback.location.placeName ?? 'another town'}, not ${values.city} (${supplied(['address', answer], ['postcode', fallback.location])}) — check the city and postcode`,
  }
}

/**
 * What Mapbox answered, quoted for the volunteer: a refusal names the town it
 * disagrees with, and only Mapbox's own line shows whether Mapbox or the row is
 * wrong — a neighbouring taluk's postcode, or a street of the same name 500 km off.
 */
function supplied(...answers: [string, GeocodedLocation][]): string {
  const quoted = answers.map(([lookup, { fullAddress, placeName }]) => {
    const line = fullAddress ?? placeName ?? 'no address'
    return `${lookup} "${line.length > 90 ? `${line.slice(0, 87)}…` : line}"`
  })
  return `Mapbox gave ${quoted.join(', ')}`
}

/**
 * Whether an answer is the row's own place: `yes`, `no`, or `ask-town` when
 * the row gives no postcode to compare and only the town can tell.
 *
 * A town answer to an address lookup with a postcode is a `no` on purpose: the
 * postcode pins the class closer than the town centre does.
 */
export function agrees(
  answer: GeocodedLocation,
  postcode: string | undefined,
): 'ask-town' | 'no' | 'yes' {
  const graded = answer.matchCode
  if (answer.featureType === 'address' && graded) {
    if (graded.place === 'unmatched') return 'no'
    if (postcode && graded.postcode === 'unmatched') return 'no'
    if (graded.confidence && WEAK_CONFIDENCE.has(graded.confidence)) return 'no'
    return 'yes'
  }
  if (postcode) return samePostcode(answer.postcode, postcode) ? 'yes' : 'no'
  return 'ask-town'
}

/** A lookup's outcome as the row reads it, throwing for the two that are not about the row. */
function settle(outcome: GeocodeOutcome): LocateResult {
  switch (outcome.status) {
    case 'found':
      return { ok: true, location: outcome.location }
    case 'unconfigured':
      throw new APIError('Address lookup is not configured on this server. Ask an admin.', 500)
    case 'unavailable':
      throw new APIError('The address lookup service did not answer. Try again later.', 503)
    case 'refused':
      return { ok: false, error: refusalMessage(outcome.httpStatus, outcome.message) }
    case 'missed':
      return {
        ok: false,
        error: 'the address could not be found — check the address, city and country',
      }
  }
}

export function refusalMessage(httpStatus: number, message: null | string): string {
  const tooLong = message ? TOO_LONG_RE.exec(message) : null
  if (tooLong) {
    return `the address is too long to look up: Mapbox counts ${tooLong[1]} words across address, postcode, city and state, and takes ${tooLong[2]} — keep the address to the street and area, and move the venue name and landmarks to venueName or description`
  }
  return `Mapbox could not look up this location (HTTP ${httpStatus}) — simplify the address and city`
}

function townKey(values: RawImportRow): string {
  return [values.country, values.state, values.city]
    .map((part) => part?.trim().toLowerCase() ?? '')
    .join('|')
}

function samePostcode(answer: null | string, row: string): boolean {
  const bare = (code: string) => code.replace(/[\s-]/g, '').toUpperCase()
  return answer !== null && bare(answer) === bare(row)
}
