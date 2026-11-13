/**
 * What the admin location picker writes when a manager picks a result (#893).
 *
 * Nothing else in the suite reads a v6 feature the way a picked result is read,
 * so a wrong key here would show up only as an address form that silently stops
 * filling itself in.
 */
import { describe, expect, it } from 'vitest'

import { readPickedPlace } from '@/components/admin/AddressSearchField/pickedPlace'
import type { MapboxFeature } from '@/lib/mapbox/feature'

/** A v6 address feature, as `/search/geocode/v6/forward` returns one. */
const address: MapboxFeature = {
  geometry: { coordinates: [-123.1207, 49.2827] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjo0Mg',
    name: '350 West Georgia Street',
    context: {
      address: { name: '350 West Georgia Street' },
      place: { name: 'Vancouver' },
      region: { region_code: 'BC', region_code_full: 'CA-BC', name: 'British Columbia' },
      postcode: { name: 'V6B 6B1' },
      country: { country_code: 'CA', name: 'Canada' },
    },
  },
}

describe('readPickedPlace', () => {
  it('fills every address sibling from a picked street number', () => {
    expect(readPickedPlace(address)).toEqual({
      address: {
        street: '350 West Georgia Street',
        city: 'Vancouver',
        region: 'BC',
        country: 'CA',
        postCode: 'V6B 6B1',
        longitude: -123.1207,
        latitude: 49.2827,
      },
      name: '350 West Georgia Street',
      mapboxId: 'dXJuOm1ieGFkcjo0Mg',
    })
  })

  it('takes the street from the address layer, not a property of its own', () => {
    // Search Box answered with `properties.address`; v6 has no such key, so a
    // reader still looking for one would fall through to the feature's name.
    const feature = {
      ...address,
      properties: { ...address.properties, name: 'Vancouver Public Library' },
    }
    expect(readPickedPlace(feature).address.street).toBe('350 West Georgia Street')
  })

  it('stands the feature name in for a match coarser than an address', () => {
    const street: MapboxFeature = {
      geometry: { coordinates: [-123.1, 49.28] },
      properties: {
        mapbox_id: 'mbx-street',
        name: 'West Georgia Street',
        context: { place: { name: 'Vancouver' }, country: { country_code: 'CA' } },
      },
    }
    expect(readPickedPlace(street).address).toMatchObject({
      street: 'West Georgia Street',
      city: 'Vancouver',
      country: 'CA',
    })
  })

  it('writes no coordinates where the feature carries no point', () => {
    const place = readPickedPlace({ properties: { mapbox_id: 'mbx-1', name: 'Nowhere' } })
    expect('latitude' in place.address).toBe(false)
    expect('longitude' in place.address).toBe(false)
  })

  it('reports no id when Mapbox returned none, so the caller can go manual', () => {
    expect(readPickedPlace({ properties: { name: 'Nowhere' } }).mapboxId).toBeUndefined()
  })

  describe('the region code, which Mapbox spells three ways', () => {
    const withRegion = (region: Record<string, string>): MapboxFeature => ({
      properties: { context: { region, country: { country_code: 'CA' } } },
    })

    it('prefers the bare ISO 3166-2 code', () => {
      expect(readPickedPlace(withRegion({ region_code: 'BC' })).address.region).toBe('BC')
    })

    it('strips the country prefix off the full code', () => {
      expect(readPickedPlace(withRegion({ region_code_full: 'CA-BC' })).address.region).toBe('BC')
    })

    it('matches the region name against the country dropdown as a last resort', () => {
      expect(readPickedPlace(withRegion({ name: 'British Columbia' })).address.region).toBe('BC')
    })

    it('leaves it unset when nothing matches', () => {
      expect(readPickedPlace(withRegion({ name: 'Atlantis' })).address.region).toBeUndefined()
    })
  })
})
