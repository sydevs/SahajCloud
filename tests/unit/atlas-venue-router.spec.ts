import { describe, expect, it } from 'vitest'

import {
  type AtlasVenue,
  countVenueUsage,
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
