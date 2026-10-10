import { describe, expect, it } from 'vitest'

import { clusterVenues, type VenueRow } from '@/collections/EventImports/propose/cluster'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import {
  buildProposedTree,
  type ProposableRow,
  type ProposedNode,
} from '@/collections/EventImports/propose/tree'

const INDIA = { id: 1, level: 'country' as const, name: 'India' }

function row(line: number, place: string, overrides: Partial<ProposableRow> = {}): ProposableRow {
  return {
    line,
    point: { latitude: 18.5, longitude: 73.85 },
    cityKey: place.toLowerCase(),
    placeId: `place.${place}`,
    placeName: place,
    subdivisionCode: 'MH',
    mapboxId: null,
    address: null,
    venueName: null,
    ...overrides,
  }
}

/**
 * Five rows for one town, where only `withId` of them came back with a `place`
 * id.
 *
 * ⚠ **This is the shape the metro merge repairs, and the one the match layer
 * used to go blind on.** The id-less rows key on the city name, the rest on the
 * id, so they arrive as two clusters at the same point — and when the name-keyed
 * group is the larger, it is the survivor, whose own rows carry no id.
 */
function townWithPartialIds(withId: readonly number[]): ProposableRow[] {
  return [2, 3, 4, 5, 6].map((line) =>
    row(line, 'Pune', { placeId: withId.includes(line) ? 'place.Pune' : null }),
  )
}

function city(overrides: Partial<ExistingRegion> & { id: number }): ExistingRegion {
  return {
    level: 'city',
    name: 'Pune',
    slug: 'pune',
    mapboxId: 'place.Pune',
    parentId: INDIA.id,
    inTarget: true,
    ...overrides,
  }
}

/** Eight cities across two states, the shape that earns a state layer. */
function eightCities(): ProposableRow[] {
  const at = (name: string, line: number, latitude: number, code: string) =>
    row(line, name, { point: { latitude, longitude: 73.85 }, subdivisionCode: code })
  return [
    at('Pune', 2, 18, 'MH'),
    at('Nashik', 3, 20, 'MH'),
    at('Nagpur', 4, 22, 'MH'),
    at('Thane', 5, 24, 'MH'),
    at('Surat', 6, 26, 'GJ'),
    at('Rajkot', 7, 28, 'GJ'),
    at('Vadodara', 8, 30, 'GJ'),
    at('Bhuj', 9, 32, 'GJ'),
  ]
}

function nodeKeyed(nodes: readonly ProposedNode[], key: string): ProposedNode | undefined {
  return nodes.find((node) => node.key === key)
}

describe('a town split by a missing place id keeps its Mapbox id', () => {
  it('still refuses a feature managed elsewhere when the id came from a minority of rows', () => {
    const elsewhere = [city({ id: 60, parentId: 999, inTarget: false })]

    // The control: most rows carry the id, so the surviving cluster is id-keyed.
    const majority = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows: townWithPartialIds([3, 4, 5, 6]),
      existing: elsewhere,
      takenSlugs: ['pune'],
    })
    expect(majority.rowErrors.map((error) => error.line)).toEqual([2, 3, 4, 5, 6])

    // The defect: two of five carry it, so the name-keyed group survives — and
    // the refusal must still fire, or all five rows are imported into a second
    // Pune inside the uploader's own subtree.
    const minority = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows: townWithPartialIds([5, 6]),
      existing: elsewhere,
      takenSlugs: ['pune'],
    })

    expect(minority.nodes[0]!.match).toMatchObject({ kind: 'elsewhere', regionId: 60 })
    expect(minority.rowErrors.map((error) => error.line)).toEqual([2, 3, 4, 5, 6])
  })

  it('still matches the existing region, rather than creating a second city beside it', () => {
    const { nodes } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows: townWithPartialIds([5, 6]),
      existing: [city({ id: 70, name: 'Poona', slug: 'poona' })],
      takenSlugs: [],
    })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.match).toMatchObject({ kind: 'existing', regionId: 70, name: 'Poona' })
    expect(nodes[0]!.slug).toBeNull()
    expect(nodes[0]!.location).toBeNull()
  })
})

describe('two spellings of one hall do not become two regions', () => {
  const hall = (line: number, address: string): VenueRow => ({
    line,
    point: { latitude: 18.5, longitude: 73.85 },
    cityKey: 'pune',
    mapboxId: 'address.1',
    address,
    venueName: 'Sahaj Centre',
  })

  it('merges halls that geocoded to one feature', () => {
    // `Regions.mapboxId` is unique collection-wide, so two created nodes sharing
    // one would fail the constraint on commit — and they are one hall anyway.
    const clusters = clusterVenues([
      hall(2, '12 Main Road'),
      hall(3, '12 Main Road'),
      hall(4, '12 Main Road, Pune'),
      hall(5, '12 Main Road, Pune'),
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.lines).toEqual([2, 3, 4, 5])
    expect(clusters[0]!.mapboxId).toBe('address.1')
  })

  it('keeps two halls apart when neither shares a feature', () => {
    const clusters = clusterVenues([
      hall(2, '12 Main Road'),
      hall(3, '12 Main Road'),
      { ...hall(4, '9 Other Road'), mapboxId: 'address.2' },
      { ...hall(5, '9 Other Road'), mapboxId: 'address.2' },
    ])

    expect(clusters).toHaveLength(2)
  })

  it('leaves an id-less hall keyed on its address', () => {
    const clusters = clusterVenues([
      { ...hall(2, '12 Main Road'), mapboxId: null },
      { ...hall(3, '12 Main Road'), mapboxId: null },
      { ...hall(4, '9 Other Road'), mapboxId: null },
      { ...hall(5, '9 Other Road'), mapboxId: null },
    ])

    expect(clusters).toHaveLength(2)
  })

  it('proposes no second region for one hall through the whole tree', () => {
    const { nodes } = buildProposedTree({
      target: { id: 2, level: 'city', name: 'Pune' },
      countryCode: 'IN',
      rows: [
        { ...row(2, 'Pune'), address: '12 Main Road', mapboxId: 'address.1' },
        { ...row(3, 'Pune'), address: '12 Main Road', mapboxId: 'address.1' },
        { ...row(4, 'Pune'), address: '12 Main Road, Pune', mapboxId: 'address.1' },
        { ...row(5, 'Pune'), address: '12 Main Road, Pune', mapboxId: 'address.1' },
      ],
      existing: [],
      takenSlugs: [],
    })

    const created = nodes.filter((node) => node.match.kind === 'create')
    const ids = created.map((node) =>
      node.location?.kind === 'mapbox' ? node.location.mapboxId : null,
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(created).toHaveLength(1)
  })
})

describe('a state is proposed only when something will hang under it', () => {
  /** Every city in the batch already exists, directly under the country. */
  function allCitiesExist(): ExistingRegion[] {
    return eightCities().map((r, index) =>
      city({
        id: 100 + index,
        name: r.placeName!,
        slug: r.placeName!.toLowerCase(),
        mapboxId: r.placeId,
      }),
    )
  }

  it('proposes no state whose every city was matched', () => {
    const { nodes } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows: eightCities(),
      existing: allCitiesExist(),
      takenSlugs: [],
    })

    // An unparented Maharashtra, located and sized from four cities that stay
    // under India, is a region nothing is ever a child of.
    expect(nodeKeyed(nodes, 'state:MH')).toBeUndefined()
    expect(nodeKeyed(nodes, 'state:GJ')).toBeUndefined()
    expect(nodes.every((node) => node.match.kind === 'existing')).toBe(true)
  })

  /**
   * Eight new cities plus a ninth, Kolhapur, that the Atlas already holds
   * straight under India.
   *
   * ⚠ **Eight new, because the layer counts only what it would group.** A
   * matched city keeps the parent it has (`decideStateLayer`), so a batch whose
   * Maharashtra cities mostly exist earns no layer at all.
   */
  function eightNewAndOneHeld(): { rows: ProposableRow[]; existing: ExistingRegion[] } {
    const kolhapur = row(10, 'Kolhapur', { point: { latitude: 34, longitude: 73.85 } })
    return {
      rows: [...eightCities(), kolhapur],
      existing: [city({ id: 120, name: 'Kolhapur', slug: 'kolhapur', mapboxId: 'place.Kolhapur' })],
    }
  }

  it('still proposes the layer, from the cities it would create', () => {
    const { rows, existing } = eightNewAndOneHeld()

    const { nodes } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows,
      existing,
      takenSlugs: [],
    })

    expect(nodeKeyed(nodes, 'state:MH')?.match).toEqual({ kind: 'create' })
    expect(nodeKeyed(nodes, 'city:id:place.Nagpur')?.parentKey).toBe('state:MH')
    // The state's lines are its new cities' alone: Kolhapur's classes file
    // into Kolhapur, wherever the Atlas has it.
    expect(nodeKeyed(nodes, 'state:MH')?.lines).toEqual([2, 3, 4, 5])
  })

  it('does not re-parent a city it matched', () => {
    const { rows, existing } = eightNewAndOneHeld()

    const { nodes } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows,
      existing,
      takenSlugs: [],
    })

    // Kolhapur already hangs off India. Moving a node is out of scope, so the
    // proposal leaves it where it is rather than listing it under a new state.
    const kolhapur = nodeKeyed(nodes, 'city:id:place.Kolhapur')
    expect(kolhapur?.match).toMatchObject({ kind: 'existing', regionId: 120 })
    expect(kolhapur?.parentKey).toBeNull()
  })

  it('proposes no layer when most of a state’s cities already exist', () => {
    const existing = allCitiesExist().filter((region) => region.name !== 'Nagpur')

    const { nodes, stateLayer } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows: eightCities(),
      existing,
      takenSlugs: [],
    })

    // One new city is a list of one, which no layer shortens.
    expect(stateLayer.proposed).toBe(false)
    expect(nodeKeyed(nodes, 'city:id:place.Nagpur')?.parentKey).toBeNull()
  })
})

describe('the target disambiguates a top-level slug', () => {
  it('qualifies a city on the target it is proposed under', () => {
    const { nodes } = buildProposedTree({
      target: { id: 5, level: 'region', name: 'Maharashtra' },
      countryCode: 'IN',
      rows: [row(2, 'Pune'), row(3, 'Nashik', { point: { latitude: 20, longitude: 73.85 } })],
      existing: [],
      takenSlugs: ['pune'],
    })

    // Not `pune-2`: `slugs.ts` mirrors the Atlas seed's `name-parent` rule, and
    // the parent of a top-level node is the target.
    expect(nodeKeyed(nodes, 'city:id:place.Pune')?.slug).toBe('pune-maharashtra')
  })

  it('qualifies a proposed state on its country, the worked example in slugs.ts', () => {
    // `getRegionOptions` yields ISO 3166-2 SHORT codes (`CA` for California),
    // so a state node keys on `GA`, never `US-GA`.
    const at = (name: string, line: number, latitude: number, code: string) =>
      row(line, name, { point: { latitude, longitude: -84 }, subdivisionCode: code })

    const { nodes } = buildProposedTree({
      target: { id: 1, level: 'country', name: 'United States' },
      countryCode: 'US',
      rows: [
        at('Atlanta', 2, 33, 'GA'),
        at('Augusta', 3, 34, 'GA'),
        at('Macon', 4, 35, 'GA'),
        at('Savannah', 5, 36, 'GA'),
        at('Austin', 6, 30, 'TX'),
        at('Dallas', 7, 32, 'TX'),
        at('Houston', 8, 29, 'TX'),
        at('Waco', 9, 31, 'TX'),
      ],
      existing: [],
      takenSlugs: ['georgia', 'texas'],
    })

    expect(nodeKeyed(nodes, 'state:GA')?.slug).toBe('georgia-united-states')
    expect(nodeKeyed(nodes, 'state:TX')?.slug).toBe('texas-united-states')
  })
})

describe('a hand-located node is floored by what it stands for', () => {
  it('gives a one-city state a state-sized radius, not a town-sized one', () => {
    // Seven cities in Gujarat and one in Maharashtra: MH's extent is a single
    // city seat, so its measured reach is 0.
    const rows = eightCities().map((r) =>
      r.placeName === 'Pune' || r.subdivisionCode === 'GJ'
        ? r
        : { ...r, subdivisionCode: 'GJ' as string | null },
    )

    const { nodes } = buildProposedTree({
      target: INDIA,
      countryCode: 'IN',
      rows,
      existing: [],
      takenSlugs: [],
    })

    const mh = nodeKeyed(nodes, 'state:MH')
    expect(mh?.location?.kind).toBe('manual')
    if (mh?.location?.kind !== 'manual') return
    // A 1 km Maharashtra beside a 600 km Gujarat is map geometry nobody meant.
    expect(mh.location.radius).toBeGreaterThanOrEqual(50_000)
  })

  it('floors a hand-located venue at a building, not a town', () => {
    const { nodes } = buildProposedTree({
      target: { id: 2, level: 'city', name: 'Pune' },
      countryCode: 'IN',
      rows: [
        { ...row(2, 'Pune'), address: '12 Main Road', mapboxId: null, venueName: 'Hall' },
        { ...row(3, 'Pune'), address: '12 Main Road', mapboxId: null, venueName: 'Hall' },
      ],
      existing: [],
      takenSlugs: [],
    })

    expect(nodes[0]!.location).toMatchObject({ kind: 'manual', radius: 500 })
  })
})
