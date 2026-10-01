import { describe, expect, it } from 'vitest'

import { METRO_MERGE_METERS, SHARED_VENUE_MIN_ROWS } from '@/collections/EventImports/constants'
import {
  clusterCities,
  clusterVenues,
  type ClusterableRow,
  type VenueRow,
} from '@/collections/EventImports/propose/cluster'
import { metersBetween } from '@/collections/EventImports/resolve/distance'

const PUNE = { latitude: 18.5204, longitude: 73.8567 }
const MUMBAI = { latitude: 19.076, longitude: 72.8777 }

/** Metres per degree of latitude, so a spec can place a point a stated distance away. */
const METERS_PER_DEGREE_LATITUDE = 111_195.08

function northOf(point: typeof PUNE, meters: number) {
  return { ...point, latitude: point.latitude + meters / METERS_PER_DEGREE_LATITUDE }
}

let nextLine = 2

function cityRow(overrides: Partial<ClusterableRow> & { point: ClusterableRow['point'] }) {
  return {
    line: nextLine++,
    cityKey: 'pune',
    placeId: 'place.pune',
    placeName: 'Pune',
    subdivisionCode: 'MH',
    ...overrides,
  } satisfies ClusterableRow
}

function venueRow(overrides: Partial<VenueRow> & { point: VenueRow['point'] }) {
  return {
    line: nextLine++,
    mapboxId: 'address.hall',
    address: '12 Hall Road',
    venueName: 'Community Hall',
    ...overrides,
  } satisfies VenueRow
}

describe('clusterCities', () => {
  it('groups the rows sharing a place id into one city, named as Mapbox named it', () => {
    const clusters = clusterCities([
      cityRow({ point: PUNE, line: 2 }),
      cityRow({ point: northOf(PUNE, 400), line: 3 }),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ key: 'id:place.pune', name: 'Pune', placeId: 'place.pune' })
    expect(clusters[0]!.lines).toEqual([2, 3])
    expect(clusters[0]!.merged).toEqual([])
  })

  it('keeps two same-named places apart, because the place id is the key', () => {
    const clusters = clusterCities([
      cityRow({ point: PUNE, placeId: 'place.a', placeName: 'Springfield', cityKey: 'springfield' }),
      cityRow({
        point: MUMBAI,
        placeId: 'place.b',
        placeName: 'Springfield',
        cityKey: 'springfield',
      }),
    ])

    expect(clusters).toHaveLength(2)
  })

  it('names a cluster after the commonest spelling, not the first row', () => {
    const clusters = clusterCities([
      cityRow({ point: PUNE, placeName: 'Kothrud' }),
      cityRow({ point: PUNE, placeName: 'Pune' }),
      cityRow({ point: PUNE, placeName: 'Pune' }),
    ])

    expect(clusters[0]!.name).toBe('Pune')
  })

  it('falls back to the city key when no row carried a place name', () => {
    const clusters = clusterCities([
      cityRow({ point: PUNE, placeId: null, placeName: null, cityKey: 'pimpri' }),
    ])

    expect(clusters[0]).toMatchObject({ key: 'name:pimpri', name: 'pimpri', placeId: null })
  })

  it('reports the subdivision the majority of a cluster geocoded into', () => {
    const clusters = clusterCities([
      cityRow({ point: PUNE, subdivisionCode: null }),
      cityRow({ point: PUNE, subdivisionCode: 'MH' }),
      cityRow({ point: PUNE, subdivisionCode: 'MH' }),
    ])

    expect(clusters[0]!.subdivisionCode).toBe('MH')
  })

  describe('the metro merge', () => {
    /** A suburb cluster of one row, `meters` north of Pune. */
    const suburb = (meters: number, line: number, key = `place.suburb-${meters}`) =>
      cityRow({
        line,
        point: northOf(PUNE, meters),
        placeId: key,
        placeName: `Suburb ${meters}`,
        cityKey: `suburb-${meters}`,
      })

    it('folds a smaller place inside the radius into the larger one', () => {
      const clusters = clusterCities([
        cityRow({ point: PUNE, line: 2 }),
        cityRow({ point: PUNE, line: 3 }),
        suburb(METRO_MERGE_METERS - 1_000, 4),
      ])

      expect(clusters).toHaveLength(1)
      expect(clusters[0]!.key).toBe('id:place.pune')
      expect(clusters[0]!.lines).toEqual([2, 3, 4])
      expect(clusters[0]!.merged).toEqual([
        { key: 'id:place.suburb-24000', name: 'Suburb 24000', lines: [4] },
      ])
    })

    it('leaves a place beyond the radius as its own city', () => {
      const clusters = clusterCities([
        cityRow({ point: PUNE }),
        cityRow({ point: PUNE }),
        suburb(METRO_MERGE_METERS + 1_000, 4),
      ])

      expect(clusters).toHaveLength(2)
      expect(clusters.map((cluster) => cluster.merged)).toEqual([[], []])
    })

    it('refuses to merge when one of the smaller place’s own rows sits outside', () => {
      // The two rows average to a point just inside the radius, which is exactly
      // the case a centroid-only test gets wrong.
      const inside = northOf(PUNE, METRO_MERGE_METERS - 12_000)
      const outside = northOf(PUNE, METRO_MERGE_METERS + 10_000)
      // Pune has to be strictly the larger place, or no merge is eligible at all
      // and the case passes without ever reaching the radius test.
      const clusters = clusterCities([
        cityRow({ point: PUNE }),
        cityRow({ point: PUNE }),
        cityRow({ point: PUNE }),
        cityRow({ point: inside, placeId: 'place.ring', placeName: 'Ring', cityKey: 'ring' }),
        cityRow({ point: outside, placeId: 'place.ring', placeName: 'Ring', cityKey: 'ring' }),
      ])

      const ring = clusters.find((cluster) => cluster.key === 'id:place.ring')
      expect(metersBetween(ring!.centroid, PUNE)).toBeLessThan(METRO_MERGE_METERS)
      expect(clusters).toHaveLength(2)
      expect(ring!.lines).toHaveLength(2)
    })

    it('leaves two equal-sized neighbours alone', () => {
      const clusters = clusterCities([
        cityRow({ point: PUNE, line: 2 }),
        suburb(1_000, 3),
      ])

      expect(clusters).toHaveLength(2)
    })

    it('merges a town split by a missing place id back together', () => {
      const clusters = clusterCities([
        cityRow({ point: PUNE }),
        cityRow({ point: PUNE }),
        cityRow({ point: northOf(PUNE, 300), placeId: null, cityKey: 'pune' }),
      ])

      expect(clusters).toHaveLength(1)
      expect(clusters[0]!.key).toBe('id:place.pune')
    })

    it('never chains a merge through a place that is itself absorbed', () => {
      // Near is inside Pune's radius; Far is inside Near's but not Pune's, so a
      // chain would move Far's class 30 km from the city it was filed under.
      const near = northOf(PUNE, METRO_MERGE_METERS - 5_000)
      const far = northOf(PUNE, METRO_MERGE_METERS + 5_000)
      const clusters = clusterCities([
        cityRow({ point: PUNE, line: 2 }),
        cityRow({ point: PUNE, line: 3 }),
        cityRow({ point: PUNE, line: 4 }),
        cityRow({ point: near, placeId: 'place.near', placeName: 'Near', cityKey: 'near', line: 5 }),
        cityRow({ point: near, placeId: 'place.near', placeName: 'Near', cityKey: 'near', line: 6 }),
        cityRow({ point: far, placeId: 'place.far', placeName: 'Far', cityKey: 'far', line: 7 }),
      ])

      expect(metersBetween(far, near)).toBeLessThan(METRO_MERGE_METERS)
      const keys = clusters.map((cluster) => cluster.key)
      expect(keys).toEqual(['id:place.pune', 'id:place.far'])
      expect(clusters[0]!.lines).toEqual([2, 3, 4, 5, 6])
    })

    it('does not move the surviving city onto the suburb it absorbed', () => {
      const clusters = clusterCities([
        cityRow({ point: PUNE, line: 2 }),
        cityRow({ point: PUNE, line: 3 }),
        suburb(METRO_MERGE_METERS - 1_000, 4),
      ])

      expect(clusters[0]!.centroid).toEqual(PUNE)
    })

    it('settles a tie between two equal neighbours by key, not by row order', () => {
      // Both cities can take the village, and they are the same size, so only the
      // tie-break decides. The answer must not move when the file is reordered.
      const east = northOf(PUNE, 2_000)
      const village = northOf(PUNE, 3_000)
      const rows = [
        cityRow({ point: PUNE, placeId: 'place.b-town', cityKey: 'b-town', line: 2 }),
        cityRow({ point: PUNE, placeId: 'place.b-town', cityKey: 'b-town', line: 3 }),
        cityRow({ point: east, placeId: 'place.a-town', cityKey: 'a-town', line: 4 }),
        cityRow({ point: east, placeId: 'place.a-town', cityKey: 'a-town', line: 5 }),
        cityRow({ point: village, placeId: 'place.village', cityKey: 'village', line: 6 }),
      ]

      for (const order of [rows, [...rows].reverse()]) {
        const clusters = clusterCities(order)
        const holder = clusters.find((cluster) => cluster.lines.includes(6))
        expect(holder!.key).toBe('id:place.a-town')
      }
    })

    it('gives the same answer whichever order the rows arrive in', () => {
      const rows = [
        cityRow({ point: PUNE, line: 2 }),
        cityRow({ point: PUNE, line: 3 }),
        suburb(5_000, 4, 'place.east'),
        suburb(6_000, 5, 'place.west'),
      ]
      const forward = clusterCities(rows)
      const reversed = clusterCities([...rows].reverse())

      expect(reversed.map((cluster) => ({ key: cluster.key, lines: cluster.lines }))).toEqual(
        forward.map((cluster) => ({ key: cluster.key, lines: cluster.lines })),
      )
    })
  })
})

describe('clusterVenues', () => {
  it('proposes a node for an address two rows share', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, line: 2 }),
      venueRow({ point: PUNE, line: 3 }),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({
      key: 'id:address.hall',
      name: 'Community Hall',
      mapboxId: 'address.hall',
    })
    expect(clusters[0]!.lines).toEqual([2, 3])
  })

  it('leaves a single-use address inline', () => {
    expect(clusterVenues([venueRow({ point: PUNE })])).toEqual([])
    expect(SHARED_VENUE_MIN_ROWS).toBe(2)
  })

  it('keys on the address text when the rows carried no id', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, mapboxId: null, address: '12 Hall Road ', venueName: null }),
      venueRow({ point: PUNE, mapboxId: null, address: '12  hall road', venueName: null }),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ key: 'address:12 hall road', mapboxId: null })
  })

  it('names a venue after the address when no row named the hall', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, venueName: null }),
      venueRow({ point: PUNE, venueName: null }),
    ])

    expect(clusters[0]!.name).toBe('12 Hall Road')
  })

  it('keeps two halls at the same spot apart, because the address is the identity', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, mapboxId: 'address.one' }),
      venueRow({ point: PUNE, mapboxId: 'address.one' }),
      venueRow({ point: northOf(PUNE, 20), mapboxId: 'address.two' }),
      venueRow({ point: northOf(PUNE, 20), mapboxId: 'address.two' }),
    ])

    expect(clusters.map((cluster) => cluster.key)).toEqual(['id:address.one', 'id:address.two'])
  })

  it('ignores a row that names neither an id nor an address', () => {
    expect(
      clusterVenues([
        venueRow({ point: PUNE, mapboxId: null, address: null }),
        venueRow({ point: PUNE, mapboxId: null, address: '   ' }),
      ]),
    ).toEqual([])
  })
})
