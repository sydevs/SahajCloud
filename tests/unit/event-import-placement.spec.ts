import { describe, expect, it } from 'vitest'

import {
  creatableNodes,
  matchedRegionIds,
  parentRegionId,
  placeLine,
} from '@/collections/EventImports/commit/placement'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'

const TARGET_ID = 7

function node(
  key: string,
  level: ProposedNode['level'],
  lines: number[],
  overrides: Partial<ProposedNode> = {},
): ProposedNode {
  return {
    key,
    level,
    name: key,
    parentKey: null,
    match: { kind: 'create' },
    slug: key,
    location: { kind: 'mapbox', mapboxId: `mapbox.${key}` },
    lines,
    ...overrides,
  }
}

describe('placeLine', () => {
  /**
   * ⚠ **The shape the whole module exists for.** A state carries every line of
   * every city beneath it, so a shallowest-match reader files the class under
   * Bavaria rather than Munich — and both nodes are legitimate, so nothing
   * downstream objects.
   */
  it('files a class under the deepest node that holds its line', () => {
    const nodes = [
      node('state:BY', 'region', [2, 3]),
      node('city:munich', 'city', [2, 3], { parentKey: 'state:BY' }),
    ]
    const known = new Map([
      ['state:BY', 40],
      ['city:munich', 41],
    ])

    expect(placeLine(2, nodes, known)).toEqual({ kind: 'region', regionId: 41 })
  })

  it('prefers a venue over the city that also holds the line', () => {
    const nodes = [node('city:pune', 'city', [5]), node('venue:hall', 'venue', [5])]
    const known = new Map([
      ['city:pune', 60],
      ['venue:hall', 61],
    ])

    expect(placeLine(5, nodes, known)).toEqual({ kind: 'region', regionId: 61 })
  })

  it('answers with an existing node’s own region id, with nothing created', () => {
    const nodes = [
      node('city:berlin', 'city', [4], {
        match: { kind: 'existing', regionId: 99, name: 'Berlin', slug: 'berlin' },
      }),
    ]

    expect(placeLine(4, nodes, matchedRegionIds(nodes))).toEqual({ kind: 'region', regionId: 99 })
  })

  /** A city target's row with no shared hall belongs to the target itself. */
  it('answers the target when no node holds the line', () => {
    expect(placeLine(9, [node('venue:hall', 'venue', [5])], new Map())).toEqual({ kind: 'target' })
  })

  /**
   * ⚠ **Reported, never filed under the ancestor.** A city whose create failed
   * still holds its lines, and answering with the state above it would put a
   * Munich class in Bavaria — the exact placement the deepest-node rule exists
   * to prevent, and indistinguishable from a correct one once it is an id.
   */
  it('refuses a line whose deepest node has no region yet', () => {
    const nodes = [
      node('state:BY', 'region', [2]),
      node('city:munich', 'city', [2], { parentKey: 'state:BY' }),
    ]

    expect(placeLine(2, nodes, new Map([['state:BY', 40]]))).toEqual({
      kind: 'pending',
      node: nodes[1],
    })
  })

  /** A node held outside the target is already a row error, and is never filed. */
  it('refuses a line whose deepest node is held elsewhere', () => {
    const nodes = [
      node('city:pune', 'city', [3], { match: { kind: 'elsewhere', regionId: 6, name: 'Pune' } }),
    ]

    expect(placeLine(3, nodes, new Map())).toMatchObject({ kind: 'pending' })
  })
})

describe('creatableNodes', () => {
  it('keeps only the nodes the commit creates', () => {
    const nodes = [
      node('city:a', 'city', [1]),
      node('city:b', 'city', [2], {
        match: { kind: 'existing', regionId: 5, name: 'B', slug: 'b' },
      }),
      node('city:c', 'city', [3], { match: { kind: 'elsewhere', regionId: 6, name: 'C' } }),
    ]

    expect(creatableNodes(nodes).map((n) => n.key)).toEqual(['city:a'])
  })

  /**
   * ⚠ **Refused rather than sorted.** A city written before the state it hangs
   * under fails on the foreign key, which Postgres reports naming neither node —
   * so the order is asserted where the tree is read.
   */
  it('refuses a tree whose created child precedes its created parent', () => {
    const nodes = [
      node('city:munich', 'city', [2], { parentKey: 'state:BY' }),
      node('state:BY', 'region', [2]),
    ]

    expect(() => creatableNodes(nodes)).toThrow(/not parent-first/)
  })

  it('allows a child whose parent already exists', () => {
    const nodes = [
      node('city:munich', 'city', [2], { parentKey: 'state:BY' }),
      node('state:BY', 'region', [2], {
        match: { kind: 'existing', regionId: 40, name: 'Bavaria', slug: 'bavaria' },
      }),
    ]

    expect(creatableNodes(nodes).map((n) => n.key)).toEqual(['city:munich'])
  })
})

describe('matchedRegionIds', () => {
  it('names only the nodes the Atlas already holds', () => {
    const nodes = [
      node('city:a', 'city', [1]),
      node('city:b', 'city', [2], {
        match: { kind: 'existing', regionId: 5, name: 'B', slug: 'b' },
      }),
      node('city:c', 'city', [3], { match: { kind: 'elsewhere', regionId: 6, name: 'C' } }),
    ]

    expect([...matchedRegionIds(nodes)]).toEqual([['city:b', 5]])
  })
})

describe('parentRegionId', () => {
  /**
   * ⚠ **The target, not null.** A top-level node hangs off the target region, and
   * answering null would make the commit skip every city a country batch
   * proposes.
   */
  it('gives the target for a node with no proposed parent', () => {
    const city = node('city:pune', 'city', [1])
    expect(parentRegionId(city, new Map(), TARGET_ID)).toBe(TARGET_ID)
  })

  it('gives a created parent’s id once it is known', () => {
    const city = node('city:pune', 'city', [1], { parentKey: 'state:MH' })

    expect(parentRegionId(city, new Map([['state:MH', 50]]), TARGET_ID)).toBe(50)
  })

  /** The seed is how a region the Atlas already holds reaches the commit. */
  it('gives an existing parent’s id, seeded rather than created', () => {
    const state = node('state:MH', 'region', [1], {
      match: { kind: 'existing', regionId: 51, name: 'Maharashtra', slug: 'maharashtra' },
    })
    const city = node('city:pune', 'city', [1], { parentKey: 'state:MH' })

    expect(parentRegionId(city, matchedRegionIds([state, city]), TARGET_ID)).toBe(51)
  })

  it('answers null while a created parent is still unwritten', () => {
    const city = node('city:pune', 'city', [1], { parentKey: 'state:MH' })

    expect(parentRegionId(city, new Map(), TARGET_ID)).toBeNull()
  })
})
