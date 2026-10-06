/**
 * One row's resolve step (#828): what is asked of Mapbox, and what the answer
 * decides.
 *
 * The two halves are tested separately because that is how they are built —
 * `geocodeRequestFor` refuses the rows not worth a geocode, and `resolveRow`
 * turns an answer into the row's facts or its errors. Neither touches the
 * network, so the containment rules are asserted rather than demonstrated.
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import { geocodeRequestFor, resolveRow } from '@/collections/EventImports/resolve/resolveRow'
import type { TargetScope } from '@/collections/EventImports/resolve/targetScope'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'

/** Germany, no state layer — the common target. */
const DE: TargetScope = { countryCode: 'DE', subdivisionCode: null }
/** Bavaria, the state target whose rows must all land inside it. */
const DE_BY: TargetScope = { countryCode: 'DE', subdivisionCode: 'BY' }

/** A Tuesday, so a weekly row with no date resolves to a known day. */
const TODAY = Temporal.PlainDate.from('2026-10-06')
const todayIn = () => TODAY

const offlineRow = (overrides: RawImportRow = {}): RawImportRow => ({
  title: 'Tuesday Evening Meditation',
  eventType: 'offline',
  country: 'DE',
  city: 'Berlin',
  address: 'Oranienstraße 25',
  scheduleType: 'weekly',
  weekdays: 'TU',
  startTime: '18:30',
  ...overrides,
})

const berlin = (overrides: Partial<GeocodedLocation> = {}): GeocodedLocation => ({
  mapboxId: 'dXJuOm1ieGFkcjox',
  featureType: 'address',
  latitude: 52.5026,
  longitude: 13.4186,
  countryCode: 'DE',
  subdivisionCode: 'BE',
  regionMapboxId: 'dXJuOm1ieHJlZzpCRQ',
  placeName: 'Berlin',
  placeId: 'dXJuOm1ieHBsYzpBQ1k',
  confidence: 'exact',
  streetMatched: true,
  placeMatched: true,
  matchedAddress: 'Oranienstraße 25, 10999 Berlin, Germany',
  ...overrides,
})

function success(args: {
  values?: RawImportRow
  scope?: TargetScope
  location?: GeocodedLocation | null
  defaultLanguages?: string[]
}) {
  const result = resolveRow({
    values: args.values ?? offlineRow(),
    scope: args.scope ?? DE,
    location: args.location === undefined ? berlin() : args.location,
    defaultLanguages: args.defaultLanguages ?? ['de'],
    todayIn,
  })
  if (!result.ok) throw new Error(`expected a resolved row, got: ${result.errors.join(' / ')}`)
  return result
}

const resolved = (args: Parameters<typeof success>[0]) => success(args).resolved
const warningsOf = (args: Parameters<typeof success>[0]) => success(args).warnings

function errorsOf(args: Parameters<typeof resolved>[0]): string[] {
  const result = resolveRow({
    values: args.values ?? offlineRow(),
    scope: args.scope ?? DE,
    location: args.location === undefined ? berlin() : args.location,
    defaultLanguages: args.defaultLanguages ?? ['de'],
    todayIn,
  })
  if (result.ok) throw new Error('expected errors, got a resolved row')
  return result.errors
}

describe('geocodeRequestFor', () => {
  /**
   * ⚠ **Field by field, never joined.** One line with the state and postcode
   * trailing the town let Mapbox pick the same street in another town — Köln's
   * Hansaring was placed in Kiel.
   */
  it('asks for an offline row’s address field by field', () => {
    const request = geocodeRequestFor(offlineRow({ state: 'Berlin', postcode: '10999' }), DE)
    expect(request).toEqual({
      kind: 'query',
      query: {
        kind: 'address',
        address: 'Oranienstraße 25',
        postcode: '10999',
        city: 'Berlin',
        region: 'Berlin',
        countryCode: 'DE',
      },
    })
  })

  it('asks for a place, not an address, for an online row', () => {
    const request = geocodeRequestFor({ eventType: 'online', country: 'DE', city: 'Berlin' }, DE)
    expect(request).toEqual({
      kind: 'query',
      query: { kind: 'place', city: 'Berlin', region: undefined, countryCode: 'DE' },
    })
  })

  it('refuses a row whose country is not the target, before spending a geocode', () => {
    const request = geocodeRequestFor(offlineRow({ country: 'FR' }), DE)
    expect(request.kind).toBe('error')
    expect(request.kind === 'error' && request.errors[0]).toContain('outside the target (DE)')
  })

  it('accepts a lower-case country column', () => {
    expect(geocodeRequestFor(offlineRow({ country: 'de' }), DE).kind).toBe('query')
  })

  it('refuses an online row with no city, which has nothing to place it by', () => {
    const request = geocodeRequestFor({ eventType: 'online', country: 'DE' }, DE)
    expect(request.kind === 'error' && request.errors[0]).toContain('city is required')
  })
})

describe('resolveRow — placement', () => {
  it('carries the geocoded point, city and ids forward', () => {
    expect(resolved({})).toMatchObject({
      latitude: 52.5026,
      longitude: 13.4186,
      cityKey: 'berlin',
      placeName: 'Berlin',
      placeId: 'dXJuOm1ieHBsYzpBQ1k',
      mapboxId: 'dXJuOm1ieGFkcjox',
      subdivisionCode: 'BE',
    })
  })

  it('reports a row Mapbox could not place at all', () => {
    expect(errorsOf({ location: null })).toEqual([
      'could not find this location — check the address, city and country',
    ])
  })

  it('refuses a result in another country, even though the query named ours', () => {
    // Mapbox honours `country` as a filter rather than a guarantee, so this is
    // the last place a foreign result can be stopped before a region is made
    // for it.
    expect(errorsOf({ location: berlin({ countryCode: 'AT' }) })[0]).toContain(
      'outside the target (DE)',
    )
  })

  it('refuses a result outside a state target', () => {
    expect(errorsOf({ scope: DE_BY, location: berlin() })[0]).toContain('outside the target (BY)')
  })

  it('accepts a result inside a state target', () => {
    expect(resolved({ scope: DE_BY, location: berlin({ subdivisionCode: 'BY' }) }).cityKey).toBe(
      'berlin',
    )
  })

  it('refuses a state target when Mapbox named no subdivision', () => {
    // A null is not evidence the row is inside the state, so it fails closed.
    const errors = errorsOf({ scope: DE_BY, location: berlin({ subdivisionCode: null }) })
    expect(errors[0]).toContain('unknown subdivision')
  })

  it('does not ask for a subdivision when the target is a whole country', () => {
    expect(resolved({ location: berlin({ subdivisionCode: null }) }).subdivisionCode).toBeNull()
  })

  it("prefers Mapbox's name for the city over the row's own spelling", () => {
    // Every row in a batch has to group under one spelling, and only Mapbox's
    // is the same for all of them — a file mixing Cologne and Köln would
    // otherwise propose two cities.
    expect(
      resolved({ values: offlineRow({ city: 'Cologne' }), location: berlin({ placeName: 'Köln' }) })
        .cityKey,
    ).toBe('köln')
  })

  it("falls back to the row's own city when Mapbox named no place", () => {
    expect(
      resolved({
        values: offlineRow({ city: ' Berlin  Mitte ' }),
        location: berlin({ placeName: null }),
      }).cityKey,
    ).toBe('berlin mitte')
  })
})

describe('resolveRow — the point', () => {
  it("prefers the row's own coordinates over the geocoded ones", () => {
    const row = resolved({ values: offlineRow({ latitude: '52.4', longitude: '13.1' }) })
    expect(row).toMatchObject({ latitude: 52.4, longitude: 13.1 })
  })

  it('still reads the context from the geocode when the row gave coordinates', () => {
    expect(
      resolved({ values: offlineRow({ latitude: '52.4', longitude: '13.1' }) }).placeName,
    ).toBe('Berlin')
  })

  it('reports a half-given pair rather than silently geocoding', () => {
    expect(errorsOf({ values: offlineRow({ latitude: '52.4' }) })).toContain(
      'latitude and longitude must be given together',
    )
  })

  it('reports an out-of-range coordinate', () => {
    expect(errorsOf({ values: offlineRow({ latitude: '52.4', longitude: '520' }) })).toContain(
      'latitude and longitude must be decimal degrees in range',
    )
  })

  it('reports a coordinate that is not a number', () => {
    expect(errorsOf({ values: offlineRow({ latitude: 'north', longitude: '13.1' }) })).toContain(
      'latitude and longitude must be decimal degrees in range',
    )
  })
})

describe('resolveRow — the timezone', () => {
  it('derives the zone from the point', () => {
    expect(resolved({}).timezone).toBe('Europe/Berlin')
  })

  it("derives it from the row's own coordinates when it gave some", () => {
    // Zgorzelec, across the Neisse from a Görlitz geocode — so a zone read from
    // the geocode instead would say Europe/Berlin.
    const görlitz = berlin({ latitude: 51.1526, longitude: 14.9872 })
    expect(
      resolved({
        values: offlineRow({ latitude: '51.15', longitude: '15.008' }),
        location: görlitz,
      }).timezone,
    ).toBe('Europe/Warsaw')
  })

  it("lets the row's timezone column rename the zone at the point", () => {
    expect(resolved({ values: offlineRow({ timezone: 'Europe/Prague' }) }).timezone).toBe(
      'Europe/Prague',
    )
  })

  it("refuses a timezone column that moves the point's clock", () => {
    // Accepted before, and published a Berlin class six hours out.
    const errors = errorsOf({ values: offlineRow({ timezone: 'America/New_York' }) })
    expect(errors[0]).toContain('America/New_York')
    expect(errors[0]).toContain('Europe/Berlin')
  })

  it('reports a zone this CMS cannot store', () => {
    expect(errorsOf({ values: offlineRow({ timezone: 'Mars/Olympus' }) })[0]).toContain(
      'not one this CMS stores',
    )
  })

  it('does not map the schedule when the zone is unknown', () => {
    // Every recurrence is written against the zone, so a schedule mapped on a
    // guessed one puts the class hours out with nothing on the row to say so.
    const errors = errorsOf({
      values: offlineRow({ timezone: 'Mars/Olympus', startTime: 'half six' }),
    })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('not one this CMS stores')
  })
})

describe('resolveRow — the schedule key', () => {
  it('reduces a weekly row to its weekday mask and start minute', () => {
    // Tuesday is bit 1, 18:30 is 1110 minutes past midnight.
    expect(resolved({})).toMatchObject({ weekdayMask: 0b10, startMinutes: 1110 })
  })

  it('masks every named weekday', () => {
    expect(resolved({ values: offlineRow({ weekdays: 'MO,TH' }) }).weekdayMask).toBe(0b1001)
  })

  it('leaves an inactive row matching nothing', () => {
    const row = resolved({
      values: offlineRow({ scheduleType: 'inactive', weekdays: '', startTime: '' }),
    })
    expect(row).toMatchObject({ inactive: true, weekdayMask: 0, startMinutes: null })
  })

  it('records the anchor the first date was resolved against', () => {
    expect(resolved({}).anchorDate).toBe('2026-10-06')
  })

  it('reports a schedule the mapper refuses', () => {
    expect(errorsOf({ values: offlineRow({ startTime: '' }) })[0]).toContain(
      'startTime is required',
    )
  })
})

describe('resolveRow — the languages', () => {
  it("takes the batch default when the row's column is blank", () => {
    expect(resolved({ defaultLanguages: ['de', 'en'] }).languages).toEqual(['de', 'en'])
  })

  it("takes the row's own codes over the default", () => {
    expect(
      resolved({ values: offlineRow({ languages: 'fr, RU' }), defaultLanguages: ['de'] }).languages,
    ).toEqual(['fr', 'ru'])
  })

  it('drops a repeated code', () => {
    expect(resolved({ values: offlineRow({ languages: 'de,de' }) }).languages).toEqual(['de'])
  })

  it('reports an unknown code instead of importing without it', () => {
    expect(errorsOf({ values: offlineRow({ languages: 'de,klingon' }) })[0]).toContain('klingon')
  })
})

describe('resolveRow — reporting', () => {
  it('reports every independent problem in one pass', () => {
    // A volunteer fixing a CSV wants both reasons at once, not one per upload.
    const errors = errorsOf({
      scope: DE_BY,
      values: offlineRow({ latitude: '52.4', languages: 'klingon' }),
      location: berlin(),
    })
    expect(errors).toHaveLength(3)
    expect(errors.join(' ')).toContain('outside the target (BY)')
    expect(errors.join(' ')).toContain('given together')
    expect(errors.join(' ')).toContain('klingon')
  })
})

describe('resolveRow — warnings', () => {
  it('names none for a clean address match', () => {
    expect(warningsOf({})).toEqual([])
    expect(resolved({})).toMatchObject({ approximate: false, regionMapboxId: 'dXJuOm1ieHJlZzpCRQ' })
  })

  it.each([
    ['street', 'street'],
    ['postcode', 'postcode'],
    ['place', 'town'],
    ['locality', 'town'],
  ])('marks a %s match approximate, and says so', (featureType, area) => {
    const location = berlin({ featureType, confidence: null, streetMatched: null })
    expect(resolved({ location }).approximate).toBe(true)
    expect(warningsOf({ location })).toEqual([
      `Mapbox only found the ${area}, not this address — check it, or add latitude and longitude`,
    ])
  })

  /**
   * An address Mapbox matched with a different street, or only at medium
   * confidence, is in the right town and maybe not the right door: kept, but
   * kept out of the address rules, and shown to the reviewer.
   */
  it.each([
    ['a medium-confidence match', { confidence: 'medium' as const }],
    ['a match on another street', { streetMatched: false }],
  ])('marks %s approximate, naming the address it found', (_, overrides) => {
    const location = berlin({ ...overrides, matchedAddress: '25 Other Street, Berlin' })
    expect(resolved({ location }).approximate).toBe(true)
    expect(warningsOf({ location })).toEqual([
      'Mapbox only found a nearby address ("25 Other Street, Berlin"), not this address — check it, or add latitude and longitude',
    ])
  })

  /**
   * ⚠ **A low-confidence match is another address, not this one placed
   * roughly.** `99999 Nowhere Lane, Xyzzyville` comes back as a street in Los
   * Angeles, and placing the class there publishes it where nobody named.
   */
  it('refuses a medium match in another town, but not a high one under another name', () => {
    const monterey = berlin({
      confidence: 'medium',
      placeMatched: false,
      matchedAddress: '2 Fremont Street, Monterey',
    })
    expect(errorsOf({ location: monterey })[0]).toContain('"2 Fremont Street, Monterey"')
    // Köln comes back as Cologne: the town reads unmatched, the address is sure.
    expect(warningsOf({ location: berlin({ placeMatched: false }) })).toEqual([])
  })

  it('refuses a low-confidence match, naming the closest address', () => {
    const location = berlin({
      confidence: 'low',
      streetMatched: false,
      matchedAddress: '00000 Alpine Street, Los Angeles',
    })
    expect(errorsOf({ location })[0]).toContain(
      'could not find this address — the closest Mapbox has is "00000 Alpine Street, Los Angeles"',
    )
  })

  it('does not mark an online row approximate for matching the town it asked for', () => {
    const values: RawImportRow = { ...offlineRow(), eventType: 'online', address: '' }
    const location = berlin({ featureType: 'place' })
    expect(resolved({ values, location }).approximate).toBe(false)
    expect(warningsOf({ values, location })).toEqual([])
  })

  it('does not mark a row approximate when its own coordinates are the point', () => {
    const values = offlineRow({ latitude: '52.51', longitude: '13.42' })
    const location = berlin({ featureType: 'place' })
    expect(resolved({ values, location }).approximate).toBe(false)
    expect(warningsOf({ values, location })).toEqual([])
  })
})

describe("resolveRow — the row's own coordinates, checked against the geocode", () => {
  it('refuses 0, 0, which is what an empty cell exports as', () => {
    // It passed the range check, overrode the geocode, and set Etc/GMT.
    expect(errorsOf({ values: offlineRow({ latitude: '0', longitude: '0' }) })).toEqual([
      'latitude and longitude of 0, 0 is not a real location — leave both blank to place the class by its address',
    ])
  })

  it('refuses a swapped pair, and says it looks swapped', () => {
    // Berlin's swapped is a point in Yemen, whose zone is Asia/Aden.
    const errors = errorsOf({ values: offlineRow({ latitude: '13.4186', longitude: '52.5026' }) })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('km from where the address geocoded')
    expect(errors[0]).toContain('look swapped')
  })

  it('refuses a sign-flipped pair, and says a sign looks flipped', () => {
    const errors = errorsOf({ values: offlineRow({ latitude: '52.5026', longitude: '-13.4186' }) })
    expect(errors[0]).toContain('a sign looks flipped')
  })

  it('refuses a pair far from the geocode for no reason it can name', () => {
    const errors = errorsOf({ values: offlineRow({ latitude: '48.137', longitude: '11.575' }) })
    expect(errors[0]).toMatch(/^latitude and longitude are \d+ km from where the address geocoded/)
    expect(errors[0]).toContain('leave both blank')
  })

  it('allows a wider bound when the geocode only reached the town', () => {
    // A town's centre can be tens of kilometres from a hall in its metro area.
    const values = offlineRow({ latitude: '52.4', longitude: '13.9' })
    expect(errorsOf({ values })[0]).toContain('km from where the address geocoded')
    expect(resolved({ values, location: berlin({ featureType: 'place' }) })).toMatchObject({
      latitude: 52.4,
      longitude: 13.9,
    })
  })
})

describe('resolveRow — subdivision schemes', () => {
  const ES_MADRID: TargetScope = { countryCode: 'ES', subdivisionCode: 'M' }
  const madrid = (overrides: Partial<GeocodedLocation> = {}) =>
    berlin({
      latitude: 40.4168,
      longitude: -3.7038,
      countryCode: 'ES',
      subdivisionCode: 'MD',
      placeName: 'Madrid',
      ...overrides,
    })
  const madridRow = offlineRow({ country: 'ES', city: 'Madrid', address: 'Calle Mayor 1' })

  it("accepts Mapbox's community code for the province the target names", () => {
    // Every row of a Madrid batch failed: Mapbox says `MD`, the dataset `M`.
    expect(
      resolved({ scope: ES_MADRID, values: madridRow, location: madrid() }).subdivisionCode,
    ).toBe('M')
  })

  it("accepts India's renamed codes against the dataset's old ones", () => {
    const scope: TargetScope = { countryCode: 'IN', subdivisionCode: 'UT' }
    const dehradun = berlin({
      latitude: 30.3165,
      longitude: 78.0322,
      countryCode: 'IN',
      subdivisionCode: 'UK',
      placeName: 'Dehradun',
    })
    const values = offlineRow({ country: 'IN', city: 'Dehradun', address: 'Rajpur Road 1' })
    expect(resolved({ scope, values, location: dehradun }).subdivisionCode).toBe('UT')
  })

  it('still refuses a community that is not the target', () => {
    const barcelona = madrid({ latitude: 41.3874, longitude: 2.1686, subdivisionCode: 'CT' })
    expect(errorsOf({ scope: ES_MADRID, values: madridRow, location: barcelona })[0]).toContain(
      'outside the target (M)',
    )
  })
})

describe("resolveRow — the row's state, for a whole-country target", () => {
  const US: TargetScope = { countryCode: 'US', subdivisionCode: null }
  const springfield = (subdivisionCode: string | null) =>
    berlin({
      latitude: 39.7817,
      longitude: -89.6501,
      countryCode: 'US',
      subdivisionCode,
      placeName: 'Springfield',
    })
  const row = (state: string) =>
    offlineRow({ country: 'US', city: 'Springfield', address: '1 Main St', state })

  it('refuses a geocode in another state than the row names — the wrong Springfield', () => {
    expect(errorsOf({ scope: US, values: row('IL'), location: springfield('MO') })[0]).toBe(
      "this address geocoded to MO, but the row's state says IL — check the address and the state",
    )
    expect(
      errorsOf({ scope: US, values: row('Illinois'), location: springfield('MO') })[0],
    ).toContain("row's state says IL")
  })

  it('accepts a geocode in the state the row names, by code or by name', () => {
    expect(resolved({ scope: US, values: row('IL'), location: springfield('IL') }).cityKey).toBe(
      'springfield',
    )
    expect(
      resolved({ scope: US, values: row('illinois'), location: springfield('IL') }).cityKey,
    ).toBe('springfield')
  })

  it('does not judge a state either side cannot name in the dataset', () => {
    // GB lists councils, Mapbox answers England — neither is evidence of a
    // wrong match.
    const GB: TargetScope = { countryCode: 'GB', subdivisionCode: null }
    const canterbury = berlin({
      latitude: 51.28,
      longitude: 1.08,
      countryCode: 'GB',
      subdivisionCode: 'ENG',
      placeName: 'Canterbury',
    })
    const values = offlineRow({
      country: 'GB',
      city: 'Canterbury',
      address: '1 High St',
      state: 'Kent',
    })
    expect(resolved({ scope: GB, values, location: canterbury }).cityKey).toBe('canterbury')
    expect(resolved({ scope: US, values: row(''), location: springfield('MO') }).cityKey).toBe(
      'springfield',
    )
    expect(resolved({ scope: US, values: row('IL'), location: springfield(null) }).cityKey).toBe(
      'springfield',
    )
  })
})

describe('a dependent-territory target', () => {
  const MARTINIQUE: TargetScope = {
    countryCode: 'MQ',
    subdivisionCode: null,
    parentCountryCode: 'FR',
  }
  const row = (country: string) =>
    offlineRow({ country, city: 'Fort-de-France', address: 'Rue Victor Hugo 1' })

  it.each(['MQ', 'FR', 'fr'])('accepts a row declaring %s, and searches under MQ', (country) => {
    expect(geocodeRequestFor(row(country), MARTINIQUE)).toMatchObject({
      kind: 'query',
      query: { countryCode: 'MQ' },
    })
  })

  it('refuses another country, naming both it would take', () => {
    const request = geocodeRequestFor(row('DE'), MARTINIQUE)
    expect(request.kind === 'error' && request.errors[0]).toContain('outside the target (MQ or FR)')
  })

  it('places a row Mapbox filed under the territory', () => {
    const fortDeFrance = berlin({
      latitude: 14.6161,
      longitude: -61.0588,
      countryCode: 'MQ',
      subdivisionCode: null,
      placeName: 'Fort-de-France',
    })
    expect(
      resolved({ scope: MARTINIQUE, values: row('FR'), location: fortDeFrance }).timezone,
    ).toBe('America/Martinique')
  })
})
