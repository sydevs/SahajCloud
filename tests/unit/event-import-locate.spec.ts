/**
 * Which of Mapbox's answers a row keeps (`locateRow`), with the geocoder
 * injected. The towns and postcodes are the Karnataka file's that exposed the
 * rule: v6 answered Bidar's address with a street in Bengaluru.
 */

import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { GeocodedLocation, GeocodeLocationArgs, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import { addressFeatureMapboxId } from '@/lib/mapbox/geocoder'
import { locateRow, memoiseGeocode, refusalMessage, vouches } from '@/plugins/eventImport/locate'

const place = (name: string, overrides: Partial<GeocodedLocation> = {}): GeocodedLocation => ({
  mapboxId: `mbx-${name}`,
  featureType: 'place',
  latitude: 12.97,
  longitude: 77.59,
  placeName: name,
  placeId: `place.${name.toLowerCase()}`,
  postcode: null,
  stateId: 'state.ka',
  countryId: 'country.in',
  matchCode: null,
  fullAddress: `${name}, Karnataka, India`,
  ...overrides,
})

const found = (location: GeocodedLocation): GeocodeOutcome => ({ status: 'found', location })

/** A geocoder answering each lookup kind from the table given. */
function geocoder(answers: Partial<Record<GeocodeLocationArgs['kind'], GeocodeOutcome>>) {
  return vi.fn(
    async (args: GeocodeLocationArgs) => answers[args.kind] ?? { status: 'missed' as const },
  )
}

const row = (values: Record<string, string>) => ({
  eventType: 'offline',
  country: 'IN',
  state: 'Karnataka',
  city: 'Bidar',
  address: 'Near old post office, Shahaganj',
  ...values,
})

const bidar = place('Bidar')
const bengaluruStreet = place('Bengaluru', {
  featureType: 'street',
  mapboxId: 'mbx-old-no',
  postcode: '560040',
  fullAddress: 'Old No., Bengaluru, 560040, India',
})
const graded = (matchCode: GeocodedLocation['matchCode']) =>
  place('Bengaluru', { featureType: 'address', matchCode })

describe('vouches', () => {
  it('takes an address v6 graded a match, and none it doubts', () => {
    expect(
      vouches(graded({ place: 'matched', postcode: 'matched', confidence: 'high' }), '560037'),
    ).toBe(true)
    expect(vouches(graded({ place: 'unmatched', confidence: 'high' }), undefined)).toBe(false)
    expect(vouches(graded({ place: 'matched', postcode: 'unmatched' }), '560037')).toBe(false)
    expect(vouches(graded({ place: 'matched', confidence: 'low' }), undefined)).toBe(false)
  })

  it('takes an ungraded answer only in the row’s own postcode', () => {
    const street = place('Bengaluru', { featureType: 'street', postcode: '560 100' })
    expect(vouches(street, '560100')).toBe(true)
    expect(vouches(bengaluruStreet, '585401')).toBe(false)
    // A town answer, where the row has a postcode that pins it closer.
    expect(vouches(bidar, '585401')).toBe(false)
    expect(vouches(bengaluruStreet, undefined)).toBe(false)
  })
})

describe('locateRow', () => {
  it('keeps an answer in the row’s own postcode, asking nothing more', async () => {
    const geocode = geocoder({ address: found({ ...bengaluruStreet, postcode: '585401' }) })
    const result = await locateRow(row({ postcode: '585401' }), geocode)
    expect(result).toMatchObject({ ok: true, location: { mapboxId: 'mbx-old-no' } })
    expect(geocode).toHaveBeenCalledTimes(1)
  })

  it('pins a wrong-town answer at the row’s postcode, when the postcode is in the row’s town', async () => {
    const pin = place('Bidar', {
      featureType: 'postcode',
      mapboxId: 'mbx-585401',
      postcode: '585401',
    })
    const geocode = geocoder({
      address: found(bengaluruStreet),
      place: found(bidar),
      postcode: found(pin),
    })
    expect(await locateRow(row({ postcode: '585401' }), geocode)).toEqual({
      ok: true,
      location: pin,
    })
  })

  it('skips the row when its postcode lies in another town, quoting what Mapbox gave', async () => {
    const geocode = geocoder({
      address: found(bengaluruStreet),
      place: found(place('Kolar')),
      postcode: found(place('Bangarapete', { featureType: 'postcode', postcode: '563114' })),
    })
    expect(await locateRow(row({ city: 'Kolar', postcode: '563114' }), geocode)).toEqual({
      ok: false,
      error:
        'postcode 563114 is in Bangarapete, not Kolar (Mapbox gave address "Old No., Bengaluru, 560040, India", postcode "Bangarapete, Karnataka, India") — check the city and postcode',
    })
  })

  it('with no postcode, keeps an answer only in the row’s town', async () => {
    const wrongTown = geocoder({ address: found(bengaluruStreet), place: found(bidar) })
    expect(await locateRow(row({}), wrongTown)).toEqual({
      ok: false,
      error:
        'Mapbox found this address only in Bengaluru, not Bidar (Mapbox gave address "Old No., Bengaluru, 560040, India") — check the address, or add the postcode',
    })
    const inTown = { ...bengaluruStreet, placeId: bidar.placeId }
    const sameTown = geocoder({ address: found(inTown), place: found(bidar) })
    expect(await locateRow(row({}), sameTown)).toEqual({ ok: true, location: inTown })
  })

  it('keeps a doubtful address in the right town, which is then stored as approximate', async () => {
    const weak = place('Bidar', {
      featureType: 'address',
      matchCode: { place: 'matched', confidence: 'low' },
    })
    const geocode = geocoder({ address: found(weak), place: found(bidar) })
    expect(await locateRow(row({}), geocode)).toEqual({ ok: true, location: weak })
    expect(addressFeatureMapboxId(weak)).toBeNull()
  })

  it('places an online class by its town alone', async () => {
    const geocode = geocoder({ place: found(bidar) })
    expect(await locateRow(row({ eventType: 'online', address: '' }), geocode)).toEqual({
      ok: true,
      location: bidar,
    })
    expect(geocode).toHaveBeenCalledTimes(1)
  })

  it('throws for an outage, which is not the row’s to fix', async () => {
    const geocode = geocoder({ address: { status: 'unavailable' } })
    await expect(locateRow(row({}), geocode)).rejects.toThrow(/did not answer/)
  })
})

describe('memoiseGeocode', () => {
  it('asks Mapbox once per distinct lookup, however many rows ask it', async () => {
    const inner = geocoder({ address: found(bengaluruStreet), place: found(bidar) })
    const geocode = memoiseGeocode({ context: {} } as PayloadRequest, inner)
    await locateRow(row({}), geocode)
    await locateRow(row({ address: 'Another road' }), geocode)
    const kinds = inner.mock.calls.map(([args]) => args.kind)
    expect(kinds.filter((kind) => kind === 'place')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'address')).toHaveLength(2)
  })
})

describe('refusalMessage', () => {
  it('says an address is too long in words, with Mapbox’s own count', () => {
    expect(refusalMessage(422, 'Query too long - 21/20 tokens')).toMatch(
      /^the address is too long to look up: Mapbox counts 21 words .* takes 20 — keep the address to the street and area/,
    )
  })

  it('names any other refusal by its status', () => {
    expect(refusalMessage(400, null)).toBe(
      'Mapbox could not look up this location (HTTP 400) — simplify the address and city',
    )
  })
})
