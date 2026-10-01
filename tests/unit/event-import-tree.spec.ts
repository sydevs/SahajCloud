import { describe, expect, it } from 'vitest'

import { MANUAL_RADIUS_MIN_METERS } from '@/collections/EventImports/constants'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import {
  buildProposedTree,
  type ProposableRow,
  type ProposedNode,
} from '@/collections/EventImports/propose/tree'

const TARGET = { id: 1, level: 'country' as const, name: 'India' }

/** A resolved row at a place, close enough to its siblings to stay one city. */
function row(line: number, place: string, overrides: Partial<ProposableRow> = {}): ProposableRow {
  return {
    line,
    point: { latitude: 18.52, longitude: 73.85 },
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
 * Rows for one place.
 *
 * ⚠ **Latitudes are a whole degree apart (~111 km), not a tenth.** Inside
 * `METRO_MERGE_METERS` a place with more rows absorbs its neighbour, so a
 * fixture meaning to be eight cities quietly becomes seven.
 */
function place(
  name: string,
  lines: readonly number[],
  { latitude, subdivisionCode = 'MH' }: { latitude: number; subdivisionCode?: string | null },
): ProposableRow[] {
  return lines.map((line) =>
    row(line, name, { point: { latitude, longitude: 73.85 }, subdivisionCode }),
  )
}

function nodeNamed(nodes: readonly ProposedNode[], name: string): ProposedNode {
  const found = nodes.find((node) => node.name === name)
  if (!found) throw new Error(`no proposed node named ${name}, got ${nodes.map((n) => n.name)}`)
  return found
}

/** Eight cities across two states, the shape that earns a state layer. */
function eightCitiesAcrossTwoStates(): ProposableRow[] {
  return [
    ...place('Pune', [2], { latitude: 18 }),
    ...place('Nashik', [3], { latitude: 20 }),
    ...place('Nagpur', [4], { latitude: 22 }),
    ...place('Thane', [5], { latitude: 24 }),
    ...place('Surat', [6], { latitude: 26, subdivisionCode: 'GJ' }),
    ...place('Rajkot', [7], { latitude: 28, subdivisionCode: 'GJ' }),
    ...place('Vadodara', [8], { latitude: 30, subdivisionCode: 'GJ' }),
    ...place('Bhuj', [9], { latitude: 32, subdivisionCode: 'GJ' }),
  ]
}

describe('buildProposedTree', () => {
  it('proposes the state layer above its cities, parents first', () => {
    const { nodes, stateLayer } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: eightCitiesAcrossTwoStates(),
      existing: [],
      takenSlugs: [],
    })

    expect(stateLayer.proposed).toBe(true)
    const states = nodes.filter((node) => node.level === 'region')
    expect(states.map((node) => node.name)).toEqual(['Gujarat', 'Maharashtra'])
    // Parents first, so the commit can create them in order.
    expect(nodes.slice(0, 2)).toEqual(states)
    expect(nodeNamed(nodes, 'Pune').parentKey).toBe('state:MH')
    expect(nodeNamed(nodes, 'Surat').parentKey).toBe('state:GJ')
  })

  it('hangs cities off the target when no layer is earned', () => {
    const { nodes, stateLayer } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: [...place('Pune', [2], { latitude: 18.5 }), ...place('Surat', [3], { latitude: 21.2 })],
      existing: [],
      takenSlugs: [],
    })

    expect(stateLayer.proposed).toBe(false)
    expect(nodes.every((node) => node.level === 'city')).toBe(true)
    expect(nodes.every((node) => node.parentKey === null)).toBe(true)
  })

  it('matches a city the Atlas already holds, and creates nothing for it', () => {
    const existing: ExistingRegion[] = [
      {
        id: 50,
        level: 'city',
        name: 'Poona',
        slug: 'poona',
        mapboxId: 'place.Pune',
        parentId: TARGET.id,
        inTarget: true,
      },
    ]

    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: place('Pune', [2, 3], { latitude: 18.5 }),
      existing,
      takenSlugs: [],
    })

    const pune = nodes[0]!
    expect(pune.match).toMatchObject({ kind: 'existing', regionId: 50 })
    // Nothing is written for it, so it claims neither a slug nor a location.
    expect(pune.slug).toBeNull()
    expect(pune.location).toBeNull()
  })

  it('errors every row of a city managed outside the target', () => {
    const existing: ExistingRegion[] = [
      {
        id: 60,
        level: 'city',
        name: 'Pune',
        slug: 'pune',
        mapboxId: 'place.Pune',
        parentId: 999,
        inTarget: false,
      },
    ]

    const { nodes, rowErrors } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: place('Pune', [4, 2], { latitude: 18.5 }),
      existing,
      takenSlugs: [],
    })

    expect(nodes[0]!.match).toMatchObject({ kind: 'elsewhere', regionId: 60 })
    expect(rowErrors.map((error) => error.line)).toEqual([2, 4])
    // The city is named; whoever else manages it is not.
    expect(rowErrors[0]!.message).toContain('"Pune"')
    expect(rowErrors[0]!.message).not.toContain('999')
  })

  it('does not adopt a same-named city from another state when the state is new', () => {
    // Pune already hangs straight off the country — the mixed tree the Atlas
    // really has (FR). This batch proposes a state layer, so its Pune would sit
    // under Maharashtra, and that state does not exist yet.
    //
    // ⚠ **The existing city's parent is the target**, which is what makes this
    // sharp: a proposal that fell back to the target as the parent would adopt
    // this node and silently re-parent it. Naming any other parent would pass
    // without the rule under test.
    const existing: ExistingRegion[] = [
      {
        id: 70,
        level: 'city',
        name: 'Pune',
        slug: 'pune',
        mapboxId: null,
        parentId: TARGET.id,
        inTarget: true,
      },
    ]

    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: eightCitiesAcrossTwoStates().map((r) =>
        r.placeName === 'Pune' ? { ...r, placeId: null } : r,
      ),
      existing,
      // Collection-wide, which is what `Regions.slug` is unique across — so the
      // other Pune's slug is taken even though its node is not a match.
      takenSlugs: ['pune'],
    })

    const pune = nodeNamed(nodes, 'Pune')
    expect(pune.match).toEqual({ kind: 'create' })
    // And its slug avoids the one that city already holds.
    expect(pune.slug).toBe('pune-maharashtra')
  })

  it('locates a created city on its Mapbox feature when it has one', () => {
    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: place('Pune', [2], { latitude: 18.5 }),
      existing: [],
      takenSlugs: [],
    })

    expect(nodes[0]!.location).toEqual({ kind: 'mapbox', mapboxId: 'place.Pune' })
  })

  it('hand-locates a city with no place id, and floors its radius', () => {
    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: place('Pune', [2], { latitude: 18.5 }).map((r) => ({ ...r, placeId: null })),
      existing: [],
      takenSlugs: [],
    })

    expect(nodes[0]!.location).toEqual({
      kind: 'manual',
      latitude: 18.5,
      longitude: 73.85,
      radius: MANUAL_RADIUS_MIN_METERS,
    })
  })

  it('centres a merged city on its own classes while covering the ones it absorbed', () => {
    // Four classes in town, one in a suburb 10 km north. The suburb merges in,
    // so the node has to reach it — but the centre must stay in town, which is
    // the rule `cluster.ts` keeps its own centroid for.
    const town = place('Pune', [2, 3, 4, 5], { latitude: 18.5 }).map((r) => ({
      ...r,
      placeId: null,
    }))
    const suburb = [
      row(6, 'Pimpri', {
        placeId: null,
        cityKey: 'pimpri',
        placeName: 'Pimpri',
        point: { latitude: 18.59, longitude: 73.85 },
      }),
    ]

    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: [...town, ...suburb],
      existing: [],
      takenSlugs: [],
    })

    expect(nodes).toHaveLength(1)
    const pune = nodes[0]!
    expect(pune.merged?.map((merged) => merged.name)).toEqual(['Pimpri'])
    expect(pune.lines).toEqual([2, 3, 4, 5, 6])

    expect(pune.location?.kind).toBe('manual')
    if (pune.location?.kind !== 'manual') return
    // In town, not pulled 2 km north by the suburb's row.
    expect(pune.location.latitude).toBeCloseTo(18.5, 6)
    // And wide enough to hold the suburb, which the floor alone would not be.
    expect(pune.location.radius).toBeGreaterThan(9_000)
  })

  it('locates a state on its cities, not on the one holding most of the classes', () => {
    // Nagpur carries eight classes, the other three cities one each. A state
    // centred on classes would sit on Nagpur.
    const rows = [
      ...place('Nagpur', [2, 3, 4, 5, 6, 7, 8, 9], { latitude: 22 }),
      ...place('Pune', [10], { latitude: 18 }),
      ...place('Nashik', [11], { latitude: 20 }),
      ...place('Thane', [12], { latitude: 24 }),
      ...place('Surat', [13], { latitude: 26, subdivisionCode: 'GJ' }),
      ...place('Rajkot', [14], { latitude: 28, subdivisionCode: 'GJ' }),
      ...place('Vadodara', [15], { latitude: 30, subdivisionCode: 'GJ' }),
      ...place('Bhuj', [16], { latitude: 32, subdivisionCode: 'GJ' }),
    ]

    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows,
      existing: [],
      takenSlugs: [],
    })

    const mh = nodeNamed(nodes, 'Maharashtra')
    expect(mh.location?.kind).toBe('manual')
    if (mh.location?.kind !== 'manual') return
    // The mean of its four cities' seats, 21. Weighted by classes it would be
    // 21.64, pulled towards Nagpur's eight.
    expect(mh.location.latitude).toBeCloseTo(21, 2)
  })

  it('gives a city under an existing state that state as its slug disambiguator', () => {
    const existing: ExistingRegion[] = [
      {
        id: 80,
        level: 'region',
        name: 'Maharashtra',
        slug: 'maharashtra',
        mapboxId: null,
        parentId: TARGET.id,
        inTarget: true,
      },
    ]

    const { nodes } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: eightCitiesAcrossTwoStates().map((r) =>
        r.placeName === 'Pune' ? { ...r, placeId: null } : r,
      ),
      existing,
      takenSlugs: ['pune'],
    })

    expect(nodeNamed(nodes, 'Maharashtra').match).toMatchObject({ kind: 'existing', regionId: 80 })
    // The matched state is not itself created, so looking only at the created
    // nodes would lose the one disambiguator this city has.
    expect(nodeNamed(nodes, 'Pune').slug).toBe('pune-maharashtra')
  })

  it('proposes venues for a city target, and says why there is no state layer', () => {
    const hall = (line: number, address: string): ProposableRow =>
      row(line, 'Pune', { address, mapboxId: 'address.1', venueName: 'Community Hall' })

    const { nodes, stateLayer } = buildProposedTree({
      target: { id: 2, level: 'city', name: 'Pune' },
      countryCode: 'IN',
      rows: [hall(2, '1 High Street'), hall(3, ' 1  high street '), hall(4, '9 Other Road')],
      existing: [],
      takenSlugs: [],
    })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      level: 'venue',
      name: 'Community Hall',
      parentKey: null,
      lines: [2, 3],
    })
    expect(stateLayer.proposed).toBe(false)
    if (stateLayer.proposed) return
    expect(stateLayer.reason).toContain('city-level target')
  })

  it('matches a venue in the target to the region that already holds it', () => {
    const existing: ExistingRegion[] = [
      {
        id: 90,
        level: 'venue',
        name: 'Community Hall',
        slug: 'community-hall',
        mapboxId: 'address.1',
        parentId: 2,
        inTarget: true,
      },
    ]

    const { nodes } = buildProposedTree({
      target: { id: 2, level: 'city', name: 'Pune' },
      countryCode: 'IN',
      rows: [
        row(2, 'Pune', { address: '1 High Street', mapboxId: 'address.1' }),
        row(3, 'Pune', { address: '1 High Street', mapboxId: 'address.1' }),
      ],
      existing,
      takenSlugs: [],
    })

    expect(nodes[0]!.match).toMatchObject({ kind: 'existing', regionId: 90 })
  })

  it('proposes nothing for a batch with no rows left to place', () => {
    const { nodes, rowErrors } = buildProposedTree({
      target: TARGET,
      countryCode: 'IN',
      rows: [],
      existing: [],
      takenSlugs: [],
    })

    expect(nodes).toEqual([])
    expect(rowErrors).toEqual([])
  })
})
