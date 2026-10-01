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
  latitude: 52.5026,
  longitude: 13.4186,
  countryCode: 'DE',
  subdivisionCode: 'BE',
  placeName: 'Berlin',
  placeId: 'dXJuOm1ieHBsYzpBQ1k',
  ...overrides,
})

function resolved(args: {
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
  return result.resolved
}

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
  it('composes an offline query from the address, city, state and postcode', () => {
    const request = geocodeRequestFor(offlineRow({ state: 'Berlin', postcode: '10999' }), DE)
    expect(request).toEqual({
      kind: 'query',
      query: 'Oranienstraße 25, Berlin, Berlin, 10999',
      types: 'address,poi',
      countryCode: 'DE',
    })
  })

  it('leaves out the parts a row did not fill, rather than their separators', () => {
    expect(geocodeRequestFor(offlineRow(), DE)).toMatchObject({
      query: 'Oranienstraße 25, Berlin',
    })
  })

  it('asks for a place, not an address, for an online row', () => {
    const request = geocodeRequestFor({ eventType: 'online', country: 'DE', city: 'Berlin' }, DE)
    expect(request).toEqual({
      kind: 'query',
      query: 'Berlin',
      types: 'place,locality',
      countryCode: 'DE',
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
    // Honolulu, nowhere near the geocoded point — so a zone read from the
    // geocode instead would say Europe/Berlin.
    expect(
      resolved({ values: offlineRow({ latitude: '21.3', longitude: '-157.8' }) }).timezone,
    ).toBe('Pacific/Honolulu')
  })

  it("lets the row's timezone column override the lookup", () => {
    expect(resolved({ values: offlineRow({ timezone: 'UTC' }) }).timezone).toBe('UTC')
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
    const row = resolved({ values: offlineRow({ scheduleType: 'inactive' }) })
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
