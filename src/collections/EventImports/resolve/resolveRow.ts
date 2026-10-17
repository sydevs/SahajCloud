/**
 * Everything one row's resolve step decides, with the network call lifted out.
 *
 * Two pure functions bracket the one thing that is not: `geocodeRequestFor`
 * says what to ask Mapbox about a row (and refuses the rows not worth asking
 * about), and `resolveRow` turns the answer into either the row's errors or the
 * facts the commit step needs. The endpoint owns the `await` between them.
 *
 * ⚠ **This step validates only what the location gates.** The country, the
 * point, the zone, the schedule and the languages are checked here because each
 * one either needs the geocode or decides it, and a volunteer must see all of
 * them before committing. Everything else a row can get wrong — a malformed
 * `onlineUrl`, a `registrationLimit` that is not a number — is refused at
 * upload, by the Events collection's own validators (`csv/fieldChecks.ts`).
 */

import type { TargetScope } from './targetScope'
import type { RawImportRow } from '../csv/columns'
import type { Temporal } from '@js-temporal/polyfill'

import { subdivisionCodeFor } from '@/lib/geography'
import { getLanguageOptions } from '@/lib/locales'
import type { GeocodedLocation, GeocodeLocationArgs } from '@/lib/mapbox/geocoder'
import type { SupportedTimezones } from '@/payload-types'

import { metersBetween, type Point } from './distance'
import { cityKeyFor } from './duplicates'
import { scheduleKey, type ScheduleKey } from './schedule'
import { deriveImportTimezone } from './timezone'
import { mapCsvSchedule, scheduleArgsFor } from '../csv/schedule'

/** The `feature_type`s that are a door rather than the area around one. */
const PRECISE_FEATURE_TYPES = new Set(['address', 'poi'])

/** The grades at which a matched address is the one the row named. */
const SURE_CONFIDENCES = new Set(['exact', 'high'])

/**
 * How far a row's own coordinates may sit from its geocode.
 *
 * Generous on purpose: what these catch is a pair swapped or sign-flipped,
 * which lands hundreds of kilometres out, not a pin dropped down the road. A
 * town-level geocode is the town's centre, so the bound widens to a metro area.
 */
const EXPLICIT_POINT_BOUND_METERS = 25_000
const EXPLICIT_POINT_TOWN_BOUND_METERS = 100_000

export type GeocodeRequest =
  | { kind: 'query'; query: GeocodeLocationArgs }
  /** The row is already wrong in a way no geocode can fix, so none is spent on it. */
  | { kind: 'error'; errors: string[] }

/**
 * What to ask Mapbox about this row, or why it is not worth asking.
 *
 * The country is checked against the target **before** the call: a file holding
 * another country's classes would otherwise spend one geocode per row to learn
 * what its own `country` column already said. A territory's row may declare
 * either code (`MQ` or `FR`), and is searched for under the territory's.
 */
export function geocodeRequestFor(values: RawImportRow, scope: TargetScope): GeocodeRequest {
  const declared = values.country?.trim().toUpperCase() ?? ''
  if (declared !== scope.countryCode && declared !== scope.parentCountryCode) {
    const target = scope.parentCountryCode
      ? `${scope.countryCode} or ${scope.parentCountryCode}`
      : scope.countryCode
    return {
      kind: 'error',
      errors: [`country "${values.country ?? ''}" is outside the target (${target})`],
    }
  }

  const city = values.city?.trim()
  const state = values.state?.trim()

  if (values.eventType === 'online') {
    // An online class still lands in a region and still needs a zone to write
    // its recurrences against, and its town is the only thing in the row that
    // answers either. `columns.ts` asks for `city` on offline rows alone
    // because the parse step validates structure, not placement.
    if (!city) {
      return {
        kind: 'error',
        errors: ['city is required to place an online class — it sets the region and the timezone'],
      }
    }
    return {
      kind: 'query',
      query: { kind: 'place', city, region: state, countryCode: scope.countryCode },
    }
  }

  // The parse step already refused an offline row missing either, so a blank
  // here cannot occur — the filter is what keeps the query well-formed rather
  // than a check.
  //
  // ⚠ **Field by field, never one line.** Joined into one string, the state and
  // the postcode trailing the town were enough for Mapbox to pick the same street
  // in another town — Köln's Hansaring was placed in Kiel.
  return {
    kind: 'query',
    query: {
      kind: 'address',
      address: values.address?.trim(),
      postcode: values.postcode?.trim(),
      city: city ?? '',
      region: state,
      countryCode: scope.countryCode,
    },
  }
}

/**
 * The facts a resolved row carries forward, and what each later phase reads.
 *
 * ⚠ **The schedule itself is deliberately absent.** The commit re-derives it
 * from `anchorDate` and `timezone`, which is why both are stored: `mapCsvSchedule`
 * is pure, so the same two inputs give the same recurrence, and a second
 * declaration of its shape here would be a hand-written copy of `firstDate_tz`,
 * `weekdays` and `weekNumber` — the exact drift that imported events the CMS
 * then rejected at write (#671).
 *
 * What is stored instead is the schedule's comparison key, because that is the
 * one thing re-derivation cannot give back cheaply: the duplicate check runs
 * across chunks, so a row resolved an hour ago has to stay comparable without
 * re-running the mapper over the whole batch.
 */
export interface ResolvedRow extends ScheduleKey {
  latitude: number
  longitude: number
  timezone: SupportedTimezones
  /** The city both the proposal step and the duplicate check group on. */
  cityKey: string
  /** Mapbox's own name for that city, which is what a proposed region is named after. */
  placeName: string | null
  /** The `place` layer's Mapbox id, for matching an existing region in phase 5. */
  placeId: string | null
  /** The matched feature's id, which an offline row stores as its `address.mapboxId`. */
  mapboxId: string | null
  /**
   * ISO 3166-2 subdivision, for the state layer the proposal may add — the
   * code `getRegionOptions` lists wherever Mapbox's answer maps to one.
   */
  subdivisionCode: string | null
  /**
   * The `region` layer's Mapbox id, for matching a proposed state to an
   * existing region. Optional, like `approximate`, because the stored rows
   * this type reads back may predate both.
   */
  regionMapboxId?: string | null
  /** The geocode reached only the street or the town, so the point is not a hall. */
  approximate?: boolean
  /** Resolved languages, the row's own column or the batch default. */
  languages: string[]
  /** True for a dormant class, which carries no schedule at all. */
  inactive: boolean
  /**
   * Today in the row's own zone, as the schedule mapper saw it.
   *
   * Stored because "the next matching day" is relative to it, so a commit run
   * after midnight would otherwise build a different first date than the one
   * the reviewer approved.
   */
  anchorDate: string
}

export type ResolveRowResult =
  /** `warnings` are for the reviewer and do not stop the row. */
  { ok: true; resolved: ResolvedRow; warnings: string[] } | { ok: false; errors: string[] }

export interface ResolveRowArgs {
  values: RawImportRow
  scope: TargetScope
  /** Mapbox's answer, or null for a miss. */
  location: GeocodedLocation | null
  /** Languages for a row whose own column is blank. */
  defaultLanguages: string[]
  /** Today in the resolved zone — injected so a spec can name the day it picked. */
  todayIn: (timezone: SupportedTimezones) => Temporal.PlainDate
}

export function resolveRow({
  values,
  scope,
  location,
  defaultLanguages,
  todayIn,
}: ResolveRowArgs): ResolveRowResult {
  if (!location) {
    return {
      ok: false,
      errors: ['could not find this location — check the address, city and country'],
    }
  }

  const errors: string[] = []
  const warnings: string[] = []

  // ⚠ Checked even though the query was restricted to the row's own country:
  // Mapbox honours `country` as a filter, not a guarantee, and this is the last
  // place a result from somewhere else can be stopped before a region is created
  // for it.
  if (location.countryCode && location.countryCode.toUpperCase() !== scope.countryCode) {
    errors.push(
      `this address geocoded to ${location.countryCode.toUpperCase()}, outside the target (${scope.countryCode})`,
    )
  }

  // Read back through the dataset's own codes, which is where the target's
  // code came from — Mapbox's can follow another scheme (Spain's communities,
  // where the dataset lists provinces). One the dataset lacks stays as sent.
  const listed = subdivisionCodeFor(scope.countryCode, location.subdivisionCode)
  const landed = listed ?? location.subdivisionCode?.toUpperCase() ?? null
  if (scope.subdivisionCode) {
    // A null subdivision fails rather than passes: the target is one state, and
    // "Mapbox did not say which" is not evidence the row is inside it.
    if (landed !== scope.subdivisionCode.toUpperCase()) {
      errors.push(
        `this address is in ${landed ?? 'an unknown subdivision'}, outside the target (${scope.subdivisionCode})`,
      )
    }
  } else {
    // A whole-country target has no state to confine to, so the row's own
    // `state` column is the only check on which Springfield Mapbox picked. It
    // is applied only where both sides are codes the dataset lists: GB's
    // councils never equal Mapbox's England, and that is no evidence of a
    // wrong match.
    const declared = subdivisionCodeFor(scope.countryCode, values.state)
    if (declared && listed && declared !== listed) {
      errors.push(
        `this address geocoded to ${listed}, but the row's state says ${declared} — check the address and the state`,
      )
    }
  }

  // ⚠ **A low-graded match is a different address, not this one placed
  // roughly** — and so is a medium one in another town. For `99999 Nowhere
  // Lane, Xyzzyville` Mapbox offers a street in Los Angeles, and for
  // `2 Fremont Street, Visalia` one in Monterey; placing either class there
  // publishes it somewhere the volunteer never named. Any other medium match,
  // or one whose street did not match, is kept but approximate — the town is
  // right and the door is not certain. A town alone unmatched is not enough:
  // Köln comes back as Cologne, graded high.
  if (
    location.confidence === 'low' ||
    (location.confidence === 'medium' && location.placeMatched === false)
  ) {
    errors.push(
      `could not find this address — the closest Mapbox has is "${location.matchedAddress ?? 'another address'}". Check the address, city and postcode`,
    )
  }
  const sure =
    (location.confidence === null || SURE_CONFIDENCES.has(location.confidence)) &&
    location.streetMatched !== false
  const precise = sure && (!location.featureType || PRECISE_FEATURE_TYPES.has(location.featureType))
  const explicit = explicitPoint(values)
  const coordinateError =
    explicitPointError(values) ??
    (explicit &&
      explicitPointConflict(
        explicit,
        location,
        precise ? EXPLICIT_POINT_BOUND_METERS : EXPLICIT_POINT_TOWN_BOUND_METERS,
      ))
  if (coordinateError) errors.push(coordinateError)
  // A refused pair is not used even to read the zone, so the row's other
  // errors are judged against the geocode rather than against a point at sea.
  const point = explicit && !coordinateError ? explicit : location

  // An online row asked for a town, so a town is its exact answer; and a row
  // that gave its own coordinates has its point from them, not the geocode.
  const approximate = values.eventType !== 'online' && !precise && point === location
  if (approximate) {
    const area =
      location.featureType === 'address'
        ? `a nearby address ("${location.matchedAddress ?? 'unnamed'}")`
        : location.featureType === 'street' || location.featureType === 'postcode'
          ? `the ${location.featureType}`
          : 'the town'
    warnings.push(
      `Mapbox only found ${area}, not this address — check it, or add latitude and longitude`,
    )
  }

  const cityKey = cityKeyFor(location.placeName) ?? cityKeyFor(values.city)
  if (!cityKey) {
    errors.push('could not determine a city for this row — add a city column value')
  }

  const timezone = deriveImportTimezone({
    latitude: point.latitude,
    longitude: point.longitude,
    override: values.timezone,
  })
  if (!timezone.ok) errors.push(timezone.error)

  const languages = resolveLanguages(values.languages, defaultLanguages)
  if (!languages.ok) errors.push(languages.error)

  // The schedule is mapped only once the zone is known: every recurrence is
  // written against it, and mapping on a guessed zone is what puts a class
  // hours out with nothing on the row to say so.
  if (!timezone.ok) return { ok: false, errors }

  const anchorDate = todayIn(timezone.timezone)
  const schedule = mapCsvSchedule(scheduleArgsFor(values, timezone.timezone, anchorDate))
  if (!schedule.ok) errors.push(...schedule.errors)

  if (errors.length || !schedule.ok || !languages.ok || !cityKey) return { ok: false, errors }

  // An inactive class names no weekday, so its mask is empty and it matches
  // nothing — the same answer `DuplicateCandidate.schedule` gives a dormant
  // listing the CMS already holds.
  const key: ScheduleKey = schedule.inactive
    ? { weekdayMask: 0, startMinutes: null }
    : scheduleKey(schedule.schedule)

  return {
    ok: true,
    resolved: {
      ...key,
      latitude: point.latitude,
      longitude: point.longitude,
      timezone: timezone.timezone,
      cityKey,
      placeName: location.placeName,
      placeId: location.placeId,
      mapboxId: location.mapboxId,
      subdivisionCode: landed,
      regionMapboxId: location.regionMapboxId,
      approximate,
      languages: languages.languages,
      inactive: schedule.inactive,
      anchorDate: anchorDate.toString(),
    },
    warnings,
  }
}

/**
 * The row's own coordinates, when it gave a usable pair.
 *
 * ⚠ **They override the geocode as the point, but never replace it.** The
 * result is still what says which country, subdivision and city the row is in,
 * so a row with coordinates is geocoded all the same.
 */
function explicitPoint(values: RawImportRow): { latitude: number; longitude: number } | null {
  const latitude = finiteNumber(values.latitude)
  const longitude = finiteNumber(values.longitude)
  if (latitude === null || longitude === null) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

/**
 * Why the row's coordinates were ignored, when it meant to give some.
 *
 * Reported rather than dropped: a volunteer who typed a longitude of 520 gave
 * the wrong point, and silently geocoding instead publishes a class somewhere
 * they did not choose.
 */
function explicitPointError(values: RawImportRow): string | null {
  const latitude = values.latitude?.trim()
  const longitude = values.longitude?.trim()
  if (!latitude && !longitude) return null
  if (!latitude || !longitude) return 'latitude and longitude must be given together'
  return explicitPoint(values) ? null : 'latitude and longitude must be decimal degrees in range'
}

/**
 * Why a well-formed pair still cannot be the row's point, when it cannot.
 *
 * ⚠ **A pair in range is not a pair that was meant.** Berlin's swapped is a
 * point in Yemen, and `0, 0` is what an empty spreadsheet cell exports as —
 * both pass the range check, and either would override the geocode and set the
 * zone, publishing the class in `Asia/Aden` or `Etc/GMT` with nothing on the
 * row to say so.
 */
function explicitPointConflict(point: Point, geocoded: Point, boundMeters: number): string | null {
  if (point.latitude === 0 && point.longitude === 0) {
    return 'latitude and longitude of 0, 0 is not a real location — leave both blank to place the class by its address'
  }
  const meters = metersBetween(point, geocoded)
  if (meters <= boundMeters) return null
  return `latitude and longitude are ${Math.round(meters / 1000)} km from where the address geocoded — ${misreadingOf(point, geocoded, boundMeters)}`
}

/** The likely slip behind a far-off pair, named when one of them fits. */
function misreadingOf(point: Point, geocoded: Point, boundMeters: number): string {
  const fits = (candidate: Point) => metersBetween(candidate, geocoded) <= boundMeters
  const { latitude, longitude } = point
  if (Math.abs(longitude) <= 90 && fits({ latitude: longitude, longitude: latitude })) {
    return 'they look swapped; latitude comes first'
  }
  const flipped: Point[] = [
    { latitude: -latitude, longitude },
    { latitude, longitude: -longitude },
    { latitude: -latitude, longitude: -longitude },
  ]
  if (flipped.some(fits)) return 'a sign looks flipped (south and west are negative)'
  return 'check whether they are swapped or a sign is flipped, or leave both blank to use the address'
}

function finiteNumber(value: string | undefined): number | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

type ResolveLanguagesResult =
  | { ok: true; languages: string[] }
  | { ok: false; error: string; languages?: undefined }

/** The row's languages, or the one bad code that stopped them. */
function resolveLanguages(column: string | undefined, defaults: string[]): ResolveLanguagesResult {
  const codes = (column ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  if (!codes.length) return { ok: true, languages: [...defaults] }

  const known = new Set(getLanguageOptions().map((option) => option.value))
  const unknown = codes.filter((code) => !known.has(code))
  if (unknown.length) {
    return {
      ok: false,
      error: `languages must be two-letter codes like "de,en" (unknown: ${unknown.join(', ')})`,
    }
  }
  return { ok: true, languages: [...new Set(codes)] }
}
