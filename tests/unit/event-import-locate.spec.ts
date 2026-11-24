/**
 * Which of Mapbox's answers a row keeps (`locateRow`), with the geocoder
 * injected. The towns and postcodes are the Karnataka file's that exposed the
 * rule: v6 answered Bidar's address with a street in Bengaluru.
 */

import { describe, expect, it, vi } from 'vitest'

import type { GeocodedLocation, GeocodeLocationArgs, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import { agrees, locateRow, refusalMessage } from '@/plugins/eventImport/locate'

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

describe('agrees', () => {
  it('trusts an address v6 graded a match, and nothing it graded unmatched or low', () => {
    const graded = (matchCode: GeocodedLocation['matchCode']) =>
      place('Bengaluru', { featureType: 'address', matchCode })
    expect(
      agrees(graded({ place: 'matched', postcode: 'matched', confidence: 'high' }), '560037'),
    ).toBe('yes')
    expect(agrees(graded({ place: 'unmatched', confidence: 'high' }), undefined)).toBe('no')
    expect(agrees(graded({ place: 'matched', postcode: 'unmatched' }), '560037')).toBe('no')
    expect(agrees(graded({ place: 'matched', confidence: 'low' }), undefined)).toBe('no')
  })

  it('trusts an ungraded answer only on the row’s own postcode, and leaves the rest to the town', () => {
    expect(
      agrees(place('Bengaluru', { featureType: 'street', postcode: '560 100' }), '560100'),
    ).toBe('yes')
    expect(agrees(bengaluruStreet, '585401')).toBe('no')
    // A town answer, where the row has a postcode that pins it closer.
    expect(agrees(bidar, '585401')).toBe('no')
    expect(agrees(bengaluruStreet, undefined)).toBe('ask-town')
  })
})

describe('locateRow', () => {
  it('keeps an answer in the row’s own postcode, asking nothing more', async () => {
    const geocode = geocoder({ address: found({ ...bengaluruStreet, postcode: '585401' }) })
    const result = await locateRow({
      values: row({ postcode: '585401' }),
      towns: new Map(),
      geocode,
    })
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
    const result = await locateRow({
      values: row({ postcode: '585401' }),
      towns: new Map(),
      geocode,
    })
    expect(result).toEqual({ ok: true, location: pin })
  })

  it('skips the row when its postcode lies in another town, naming both', async () => {
    const geocode = geocoder({
      address: found(bengaluruStreet),
      place: found(place('Kolar')),
      postcode: found(place('Bangarapete', { featureType: 'postcode', postcode: '563114' })),
    })
    const result = await locateRow({
      values: row({ city: 'Kolar', postcode: '563114' }),
      towns: new Map(),
      geocode,
    })
    expect(result).toEqual({
      ok: false,
      error:
        'postcode 563114 is in Bangarapete, not Kolar (Mapbox gave address "Old No., Bengaluru, 560040, India", postcode "Bangarapete, Karnataka, India") — check the city and postcode',
    })
  })

  it('with no postcode, keeps an answer only in the row’s town', async () => {
    const wrongTown = geocoder({ address: found(bengaluruStreet), place: found(bidar) })
    expect(await locateRow({ values: row({}), towns: new Map(), geocode: wrongTown })).toEqual({
      ok: false,
      error:
        'Mapbox found this address only in Bengaluru, not Bidar (Mapbox gave address "Old No., Bengaluru, 560040, India") — check the address, or add the postcode',
    })
    const sameTown = geocoder({
      address: found({ ...bengaluruStreet, placeId: bidar.placeId }),
      place: found(bidar),
    })
    expect(await locateRow({ values: row({}), towns: new Map(), geocode: sameTown })).toMatchObject(
      {
        ok: true,
      },
    )
  })

  it('keeps a weakly graded address in the right town, but as an approximate pin', async () => {
    const weak = place('Bidar', {
      featureType: 'address',
      matchCode: { place: 'matched', confidence: 'low' },
    })
    const geocode = geocoder({ address: found(weak), place: found(bidar) })
    expect(await locateRow({ values: row({}), towns: new Map(), geocode })).toEqual({
      ok: true,
      location: { ...weak, mapboxId: null },
    })
  })

  it('asks each town once per run, however many rows name it', async () => {
    const geocode = geocoder({ address: found(bengaluruStreet), place: found(bidar) })
    const towns = new Map<string, Promise<GeocodeOutcome>>()
    await locateRow({ values: row({}), towns, geocode })
    await locateRow({ values: row({ address: 'Another road' }), towns, geocode })
    expect(geocode.mock.calls.filter(([args]) => args.kind === 'place')).toHaveLength(1)
  })

  it('places an online class by its town alone', async () => {
    const geocode = geocoder({ place: found(bidar) })
    expect(
      await locateRow({
        values: row({ eventType: 'online', address: '' }),
        towns: new Map(),
        geocode,
      }),
    ).toEqual({ ok: true, location: bidar })
    expect(geocode).toHaveBeenCalledTimes(1)
  })

  it('throws for an outage, which is not the row’s to fix', async () => {
    const geocode = geocoder({ address: { status: 'unavailable' } })
    await expect(locateRow({ values: row({}), towns: new Map(), geocode })).rejects.toThrow(
      /did not answer/,
    )
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
