import { describe, expect, it } from 'vitest'

import {
  type AtlasVenue,
  countVenueUsage,
  isRedundantVenueName,
  multiUseVenueIds,
  venueDisplayName,
  venueParentAreaId,
  venueToEventAddress,
} from '../../seeds/atlas/helpers/venueRouter'

const events = [
  { venueId: 1, areaId: 10 },
  { venueId: 1, areaId: 10 },
  { venueId: 1, areaId: 20 },
  { venueId: 2, areaId: 30 },
  { venueId: null, areaId: 40 },
]

const venue: AtlasVenue = {
  legacyId: 3,
  placeId: 'abc',
  name: 'Main Sahaja Centre',
  street: ' 27 Lake Road, Northcote',
  city: 'Auckland',
  countryCode: 'NZ',
  postCode: '0627',
  regionCode: null,
  latitude: -36.8,
  longitude: 174.74,
  timeZone: 'Pacific/Auckland',
}

describe('countVenueUsage', () => {
  it('counts events per venue, ignoring venue-less events', () => {
    const counts = countVenueUsage(events)
    expect(counts.get(1)).toBe(3)
    expect(counts.get(2)).toBe(1)
    expect(counts.has(null as unknown as number)).toBe(false)
  })
})

describe('multiUseVenueIds', () => {
  it('returns only venues referenced by more than one event', () => {
    const ids = multiUseVenueIds(events)
    expect(ids.has(1)).toBe(true)
    expect(ids.has(2)).toBe(false)
  })
})

describe('venueParentAreaId', () => {
  it('picks the most common areaId among the venue’s events', () => {
    expect(venueParentAreaId(1, events)).toBe(10)
    expect(venueParentAreaId(2, events)).toBe(30)
  })

  it('returns null when no referencing event has an area', () => {
    expect(venueParentAreaId(99, events)).toBeNull()
  })
})

describe('venueDisplayName', () => {
  it('uses the venue name when present', () => {
    expect(venueDisplayName(venue)).toBe('Main Sahaja Centre')
  })

  it('falls back to street + city when the name is blank', () => {
    expect(venueDisplayName({ ...venue, name: '' })).toBe('27 Lake Road, Northcote, Auckland')
  })

  it('falls back to the legacy id when name + address are blank', () => {
    expect(venueDisplayName({ ...venue, name: null, street: null, city: null })).toBe('Venue 3')
  })
})

describe('venueToEventAddress', () => {
  it('maps and trims venue fields, omitting empties', () => {
    const address = venueToEventAddress(venue, 'mbx-id')
    expect(address).toEqual({
      mapboxId: 'mbx-id',
      venueName: 'Main Sahaja Centre',
      street: '27 Lake Road, Northcote',
      city: 'Auckland',
      country: 'NZ',
      postCode: '0627',
      latitude: -36.8,
      longitude: 174.74,
    })
    expect(address).not.toHaveProperty('region')
  })

  it('includes the region shortCode when present', () => {
    expect(venueToEventAddress({ ...venue, regionCode: 'AUK' }, 'manual').region).toBe('AUK')
  })
})

describe('venueName on the inline address', () => {
  it("carries the building's own name", () => {
    // Previously discarded, which left a blank-titled listing auto-filling to
    // "Meditation at 27 Lake Road" instead of naming the centre.
    expect(venueToEventAddress(venue, 'mbx-id').venueName).toBe('Main Sahaja Centre')
  })

  it('strips a trailing separator', () => {
    const messy = { ...venue, name: 'Browns Bay Community Centre,' }
    expect(venueToEventAddress(messy, 'mbx-id').venueName).toBe('Browns Bay Community Centre')
  })

  it('drops a name that only repeats the street', () => {
    // Atlas names many venues after their own address, with the house number
    // on the other end — "22 Manenburgstraat" for "Manenburgstraat 22".
    const streetNamed = { ...venue, name: 'Manenburgstraat 22', street: '22 Manenburgstraat' }
    expect(venueToEventAddress(streetNamed, 'mbx-id').venueName).toBeUndefined()
  })

  it('drops a name that only repeats the city', () => {
    // Venue 483 is literally named "Воронеж", in Воронеж — worse than the street.
    const cityNamed = { ...venue, name: 'Воронеж', city: 'Воронеж ', street: 'Хользунова' }
    expect(venueToEventAddress(cityNamed, 'mbx-id').venueName).toBeUndefined()
  })

  it('omits it entirely when the venue is unnamed', () => {
    expect(venueToEventAddress({ ...venue, name: null }, 'mbx-id')).not.toHaveProperty('venueName')
  })
})

describe('isRedundantVenueName', () => {
  it('ignores word order, punctuation and case', () => {
    expect(isRedundantVenueName('R. Direita, 165', { ...venue, street: '165 R. Direita' })).toBe(
      true,
    )
  })

  it('keeps a genuinely different name', () => {
    expect(
      isRedundantVenueName('Broadstairs Friends Meeting House', {
        ...venue,
        street: "9 St Peter's Park Rd",
        city: 'Broadstairs',
      }),
    ).toBe(false)
  })
})
