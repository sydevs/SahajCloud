/**
 * Where a row's class is: Mapbox's answer to its address, kept only when it
 * agrees with the row's own postcode or town.
 *
 * ⚠ **Mapbox's first answer is not evidence of anything.** Asked for an Indian
 * address it holds no street for, v6 answered with a `street` of the same name
 * in another town — Bidar's class in Bengaluru, 550 km off — and grades only an
 * `address` answer, so nothing in the answer itself says so. Where the answer
 * cannot vouch for itself, the row's postcode stands in for the address,
 * pinned at its centre, and only if it lies in the row's town.
 *
 * ⚠ **Only a miss or a refusal is about the row.** The geocoder being down or
 * unconfigured throws, which fails the whole import with that sentence; a row
 * error there would send the volunteer fixing addresses that are fine.
 */

import type { RawImportRow } from './csv/columns'
import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import type { GeocodedLocation, GeocodeLocationArgs, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import { geocodeLocation, isDoubtfulAddress } from '@/lib/mapbox/geocoder'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

export type Geocode = (args: GeocodeLocationArgs) => Promise<GeocodeOutcome>

export type LocateResult = { ok: true; location: GeocodedLocation } | { ok: false; error: string }

/** `Query too long - 21/20 tokens`, which v6 answers a long address with as a 422. */
const TOO_LONG_RE = /too long\D+(\d+)\s*\/\s*(\d+)/i

/**
 * One request per distinct lookup for a whole run: every row of a town asks
 * for the same town, and rows of one street often for the same postcode.
 */
export function memoiseGeocode(req: PayloadRequest, geocode: Geocode = geocodeLocation): Geocode {
  return (args) => memoizeOnRequest(req, `geocode:${JSON.stringify(args)}`, () => geocode(args))
}

/** Find a row's place, or the one sentence saying why it cannot be placed. */
export async function locateRow(
  values: RawImportRow,
  geocode: Geocode = geocodeLocation,
): Promise<LocateResult> {
  const scope = { region: values.state, countryCode: values.country ?? '' }
  const city = values.city ?? ''
  const townOf = () => geocode({ kind: 'place', city, ...scope })

  // An online class is placed by its town alone, which is the answer itself.
  if (values.eventType === 'online') return settle(await townOf())

  const primary = await geocode({
    kind: 'address',
    address: values.address,
    postcode: values.postcode,
    city,
    ...scope,
  })
  if (primary.status !== 'found') return settle(primary)
  const answer = primary.location
  const postcode = values.postcode?.trim()
  if (vouches(answer, postcode)) return { ok: true, location: answer }

  const [town, fallback] = await Promise.all([
    townOf(),
    postcode ? geocode({ kind: 'postcode', postcode, ...scope }) : null,
  ])
  if (town.status !== 'found') {
    return settle(town, `the city "${city}" could not be found — check the city and country`)
  }
  const townId = town.location.placeId

  // With no postcode to compare, the town decides. A doubtful address in the
  // right town is kept, and `addressFeatureMapboxId` stores it as approximate.
  if (!fallback) {
    if (townId && answer.placeId === townId) return { ok: true, location: answer }
    return {
      ok: false,
      error: `Mapbox found this address only in ${answer.placeName ?? 'another town'}, not ${city} (${supplied(['address', answer])}) — check the address, or add the postcode`,
    }
  }

  if (fallback.status !== 'found') {
    return settle(
      fallback,
      `the address could not be found in ${city}, and neither could postcode ${postcode} (${supplied(['address', answer])}) — check the address, city and postcode`,
    )
  }
  if (townId && fallback.location.placeId === townId) {
    return { ok: true, location: fallback.location }
  }
  return {
    ok: false,
    error: `postcode ${postcode} is in ${fallback.location.placeName ?? 'another town'}, not ${city} (${supplied(['address', answer], ['postcode', fallback.location])}) — check the city and postcode`,
  }
}

/**
 * Whether an answer is the row's own place on its own word: an address v6
 * graded and does not doubt, or any answer in the row's own postcode.
 *
 * ⚠ **A town answer to a row with a postcode does not vouch**, on purpose: the
 * postcode pins the class closer than the town centre does.
 */
export function vouches(answer: GeocodedLocation, postcode: string | undefined): boolean {
  if (answer.matchCode) return !isDoubtfulAddress(answer.matchCode)
  return Boolean(postcode) && samePostcode(answer.postcode, postcode!)
}

/** A lookup's outcome as the row reads it, throwing for the two that are not about the row. */
function settle(
  outcome: GeocodeOutcome,
  missed = 'the address could not be found — check the address, city and country',
): LocateResult {
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
      return { ok: false, error: missed }
  }
}

export function refusalMessage(httpStatus: number, message: null | string): string {
  const tooLong = message ? TOO_LONG_RE.exec(message) : null
  if (tooLong) {
    return `the address is too long to look up: Mapbox counts ${tooLong[1]} words across address, postcode, city and state, and takes ${tooLong[2]} — keep the address to the street and area, and move the venue name and landmarks to venueName or description`
  }
  return `Mapbox could not look up this location (HTTP ${httpStatus}) — simplify the address and city`
}

/**
 * What Mapbox answered, quoted for the volunteer: only Mapbox's own line shows
 * whether Mapbox or the row is wrong — a neighbouring taluk's postcode, or a
 * street of the same name 550 km off.
 */
function supplied(...answers: [string, GeocodedLocation][]): string {
  const quoted = answers.map(([lookup, { fullAddress, placeName }]) => {
    const line = fullAddress ?? placeName ?? 'no address'
    return `${lookup} "${line.length > 90 ? `${line.slice(0, 87)}…` : line}"`
  })
  return `Mapbox gave ${quoted.join(', ')}`
}

function samePostcode(answer: null | string, row: string): boolean {
  const bare = (code: string) => code.replace(/[\s-]/g, '').toUpperCase()
  return answer !== null && bare(answer) === bare(row)
}
