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
    cityKey: 'pune',
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

  it('names an unnamed place by the commonest city spelling, not by row order', () => {
    // Mapbox placed all three rows in one place and named none of them, so the
    // fallback decides — and the rows spell the city two ways, which is where
    // reading row one would name the node differently for a reordered file.
    const rows = [
      cityRow({ point: PUNE, placeId: 'place.delhi', placeName: null, cityKey: 'nizamuddin' }),
      cityRow({ point: PUNE, placeId: 'place.delhi', placeName: null, cityKey: 'new delhi' }),
      cityRow({ point: PUNE, placeId: 'place.delhi', placeName: null, cityKey: 'new delhi' }),
    ]

    for (const order of [rows, [...rows].reverse()]) {
      expect(clusterCities(order)[0]!.name).toBe('new delhi')
    }
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
        { key: 'id:place.suburb-24000', name: 'Suburb 24000', lines: [4], subdivisionCode: 'MH' },
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

    it('re-reads the subdivision after a merge, and names what it absorbed', () => {
      // The state layer is built from `subdivisionCode`, so a node has to answer
      // for every class it holds. The survivor's own three rows are in MH, and the
      // two suburbs it takes in put four of its seven classes in GJ — so the
      // majority only flips once the absorbed rows are counted, which is the one
      // shape that tells a recompute apart from carrying the old value over.
      const suburb = (id: string, line: number) =>
        cityRow({
          point: northOf(PUNE, 1_000),
          placeId: id,
          cityKey: id,
          subdivisionCode: 'GJ',
          line,
        })
      const clusters = clusterCities([
        ...[2, 3, 4].map((line) => cityRow({ point: PUNE, subdivisionCode: 'MH', line })),
        suburb('place.east', 5),
        suburb('place.east', 6),
        suburb('place.west', 7),
        suburb('place.west', 8),
      ])

      expect(clusters).toHaveLength(1)
      expect(clusters[0]!.lines).toEqual([2, 3, 4, 5, 6, 7, 8])
      expect(clusters[0]!.subdivisionCode).toBe('GJ')
      expect(clusters[0]!.merged.map((place) => place.subdivisionCode)).toEqual(['GJ', 'GJ'])
    })

    it('folds a village into the nearest eligible place, not the largest', () => {
      // Two places survive the pass, because they are 40 km apart and so neither
      // can absorb the other. The village sits 22 km from the bigger one and 18 km
      // from the smaller, and belongs to the one it is nearer.
      const town = northOf(PUNE, 40_000)
      const village = northOf(PUNE, 22_000)
      const townRow = (line: number) =>
        cityRow({ point: town, placeId: 'place.town', cityKey: 'town', line })
      const clusters = clusterCities([
        ...[2, 3, 4, 5, 6].map((line) => cityRow({ point: PUNE, line })),
        townRow(7),
        townRow(8),
        townRow(9),
        cityRow({ point: village, placeId: 'place.village', cityKey: 'village', line: 10 }),
      ])

      // Both candidates have to be genuinely eligible, or the case proves nothing.
      expect(metersBetween(village, PUNE)).toBeLessThan(METRO_MERGE_METERS)
      expect(metersBetween(village, town)).toBeLessThan(METRO_MERGE_METERS)
      expect(metersBetween(PUNE, town)).toBeGreaterThan(METRO_MERGE_METERS)

      const holder = clusters.find((cluster) => cluster.lines.includes(10))
      expect(holder!.key).toBe('id:place.town')
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
      // The far city is what makes this non-vacuous: it absorbs nothing, so its
      // `lines` are whatever order they arrived in unless the grouping sorts them
      // — and every other cluster here has its lines sorted by a merge.
      const rows = [
        cityRow({ point: PUNE, line: 2 }),
        cityRow({ point: PUNE, line: 3 }),
        suburb(5_000, 4, 'place.east'),
        suburb(6_000, 5, 'place.west'),
        cityRow({ point: MUMBAI, placeId: 'place.mumbai', cityKey: 'mumbai', line: 6 }),
        cityRow({ point: MUMBAI, placeId: 'place.mumbai', cityKey: 'mumbai', line: 7 }),
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
      key: 'pune|12 hall road',
      name: 'Community Hall',
      mapboxId: 'address.hall',
    })
    expect(clusters[0]!.lines).toEqual([2, 3])
  })

  it('leaves a single-use address inline', () => {
    expect(clusterVenues([venueRow({ point: PUNE })])).toEqual([])
    expect(SHARED_VENUE_MIN_ROWS).toBe(2)
  })

  it('groups one address written with different spacing', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, address: '12 Hall Road ', venueName: null }),
      venueRow({ point: PUNE, address: '12  hall  road', venueName: null }),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.key).toBe('pune|12 hall road')
  })

  it('still groups one address when Mapbox answered the two rows differently', () => {
    // One row matched the building, the other a POI inside it. Keying on the id
    // would split the venue into two single-use groups, which the threshold then
    // drops — so the node would be lost, not merely duplicated.
    const clusters = clusterVenues([
      venueRow({ point: PUNE, mapboxId: 'address.hall', line: 2 }),
      venueRow({ point: PUNE, mapboxId: 'poi.hall-cafe', line: 3 }),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.lines).toEqual([2, 3])
  })

  it('keeps one street name in two towns apart', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, cityKey: 'pune', address: '1 High Street' }),
      venueRow({ point: PUNE, cityKey: 'pune', address: '1 High Street' }),
      // Its own feature id, because one Mapbox id names one feature anywhere in
      // the world — two halls sharing one is the fixture's shorthand, not a
      // shape a geocode produces, and halls that DO share an id are one hall.
      venueRow({ point: MUMBAI, cityKey: 'mumbai', address: '1 High Street', mapboxId: 'address.other' }),
      venueRow({ point: MUMBAI, cityKey: 'mumbai', address: '1 High Street', mapboxId: 'address.other' }),
    ])

    expect(clusters.map((cluster) => cluster.key)).toEqual([
      'pune|1 high street',
      'mumbai|1 high street',
    ])
  })

  it('names a venue after the address, tidied, when no row named the hall', () => {
    const clusters = clusterVenues([
      venueRow({ point: PUNE, address: '  12  Hall   Road ', venueName: null }),
      venueRow({ point: PUNE, address: '12 Hall Road', venueName: null }),
    ])

    expect(clusters[0]!.name).toBe('12 Hall Road')
  })

  it('ignores a row that names no address', () => {
    expect(
      clusterVenues([
        venueRow({ point: PUNE, address: null }),
        venueRow({ point: PUNE, address: '   ' }),
      ]),
    ).toEqual([])
  })
})
