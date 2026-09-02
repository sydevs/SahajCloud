/**
 * Nearest-ancestor precedence for canonical ownership (#634).
 *
 * `resolveOwnersByRegion` is the pure half of the resolver — chain in, owner
 * out — so every precedence rule is testable without a database. The half that
 * *does* need one (the `clients` query's enabled/published filtering, and the
 * query count) is covered in `tests/int/region-canonical-url.int.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import type { CanonicalOwner } from '@/lib/atlas/regionOwners'
import { canonicalTargetFor, resolveOwnersByRegion } from '@/lib/atlas/regionOwners'
import { buildRegionPath, descendantRegionIds } from '@/lib/atlas/regionTree'

/**
 *   1 united-kingdom
 *   └─ 2 england
 *       ├─ 3 greater-london
 *       │   └─ 4 camden
 *       └─ 5 yorkshire
 *   6 france  (separate root, never owned)
 */
const CHAINS = new Map<number, number[]>([
  [1, [1]],
  [2, [1, 2]],
  [3, [1, 2, 3]],
  [4, [1, 2, 3, 4]],
  [5, [1, 2, 5]],
  [6, [6]],
])

const owner = (clientId: number, domain: string): CanonicalOwner => ({
  clientId,
  domain,
  mount: '/',
  routing: 'query',
})

const UK = owner(10, 'sahajayoga.org.uk')
const LONDON = owner(11, 'sahajayogalondon.co.uk')

describe('resolveOwnersByRegion', () => {
  it('gives an owner its own region', () => {
    const owners = resolveOwnersByRegion(CHAINS, new Map([[1, UK]]))
    expect(owners.get(1)).toBe(UK)
  })

  it('extends an owner over its whole descendant subtree', () => {
    const owners = resolveOwnersByRegion(CHAINS, new Map([[1, UK]]))
    for (const regionId of [2, 3, 4, 5]) expect(owners.get(regionId)).toBe(UK)
  })

  it('lets the nearest ancestor win over a more distant one', () => {
    const owners = resolveOwnersByRegion(
      CHAINS,
      new Map([
        [1, UK],
        [3, LONDON],
      ]),
    )
    // Greater London and Camden below it belong to the London client…
    expect(owners.get(3)).toBe(LONDON)
    expect(owners.get(4)).toBe(LONDON)
    // …while their siblings and ancestors stay with the UK client.
    expect(owners.get(5)).toBe(UK)
    expect(owners.get(2)).toBe(UK)
    expect(owners.get(1)).toBe(UK)
  })

  it('resolves an owner sitting mid-chain', () => {
    const owners = resolveOwnersByRegion(CHAINS, new Map([[2, UK]]))
    expect(owners.get(2)).toBe(UK)
    expect(owners.get(4)).toBe(UK)
    // The root above the owner is *not* covered — ownership flows down only.
    expect(owners.has(1)).toBe(false)
  })

  it('leaves a region with no owner in its ancestry unowned', () => {
    const owners = resolveOwnersByRegion(CHAINS, new Map([[1, UK]]))
    expect(owners.has(6)).toBe(false)
  })

  it('returns nothing at all when no client owns anything', () => {
    expect(resolveOwnersByRegion(CHAINS, new Map()).size).toBe(0)
  })

  it('still resolves a region whose breadcrumb chain collapsed to itself', () => {
    // `breadcrumbChainIds` falls back to `[id]` for a root, a not-yet-populated
    // create, or corrupt breadcrumbs. Such a region can own/be owned directly,
    // but inherits nothing — there is no ancestry left to walk.
    const collapsed = new Map<number, number[]>([[4, [4]]])
    expect(resolveOwnersByRegion(collapsed, new Map([[1, UK]])).has(4)).toBe(false)
    expect(resolveOwnersByRegion(collapsed, new Map([[4, LONDON]])).get(4)).toBe(LONDON)
  })
})

describe('canonicalTargetFor', () => {
  it('states https itself rather than trusting the stored host', () => {
    const target = canonicalTargetFor({ ...LONDON, mount: '/classes', routing: 'path' })
    expect(target).toEqual({
      origin: 'https://sahajayogalondon.co.uk',
      mount: '/classes',
      routing: 'path',
    })
  })

  it('falls back to the We Meditate surface, routing by path', () => {
    const target = canonicalTargetFor(undefined)
    expect(target.routing).toBe('path')
    expect(target.origin).not.toContain('sahajatlas')
  })

  // #652: the fallback client is passed here AS the owner, not beside one —
  // this function ranks nothing. Precedence is `getCanonicalUrlBase` returning
  // before it resolves a fallback at all, which only a database can show, so it
  // is asserted in `region-canonical-url.int.spec.ts` and not here.
  const FALLBACK: CanonicalOwner = {
    clientId: 9,
    domain: 'wemeditate.com',
    mount: '/map',
    routing: 'path',
  }

  it('treats the fallback client as an ordinary owner', () => {
    expect(canonicalTargetFor(FALLBACK)).toEqual({
      origin: 'https://wemeditate.com',
      mount: '/map',
      routing: 'path',
    })
  })
})

describe('buildRegionPath', () => {
  it('joins an ancestor slug chain', () => {
    expect(buildRegionPath(['belgium', 'flanders', 'antwerp'])).toBe('/belgium/flanders/antwerp')
  })

  it('builds a single-segment path for a root', () => {
    expect(buildRegionPath(['belgium'])).toBe('/belgium')
  })

  it.each([
    ['a blank segment', ['nl', '', 'amsterdam']],
    ['a missing segment', ['nl', undefined, 'amsterdam']],
    ['a null segment', ['nl', null, 'amsterdam']],
    ['an empty chain', []],
  ])('refuses %s rather than emitting //', (_name, slugs) => {
    expect(buildRegionPath(slugs as Array<string | null | undefined>)).toBeNull()
  })
})

describe('descendantRegionIds', () => {
  // A city's page has to list classes held at its shared venues, which attach to
  // the venue and not to the city. Containment in the chain is what expresses
  // "beneath", and it comes off a map the request has already loaded.
  it('returns the region first, then everything beneath it at any depth', () => {
    expect(descendantRegionIds(CHAINS, 2)).toEqual([2, 3, 4, 5])
  })

  it('returns a leaf alone', () => {
    expect(descendantRegionIds(CHAINS, 4)).toEqual([4])
  })

  it('never crosses into a sibling root', () => {
    expect(descendantRegionIds(CHAINS, 6)).toEqual([6])
    expect(descendantRegionIds(CHAINS, 1)).not.toContain(6)
  })

  it('still names the region itself when the tree has no entry for it', () => {
    expect(descendantRegionIds(new Map(), 99)).toEqual([99])
  })
})
