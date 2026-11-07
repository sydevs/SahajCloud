/**
 * The one walk up the region tree, which three surfaces instantiate.
 *
 * What is pinned here is the part every caller shares and none of them states:
 * which regions an item reaches, and that each region accumulates on its own.
 * What each caller adds per item is pinned where that caller is tested —
 * `atlas-sidebar-model.spec.ts` and `atlas-overview-programs.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import { rollUpRegionTree } from '@/lib/regionTree/rollUp'

const COUNTRY = 1
const REGION = 2
const CITY = 3

/** One listing in the city, whose chain climbs to the country. */
const item = { chain: { ancestorIds: [REGION, COUNTRY], regionId: CITY } }

const count = (inScope: number[]) =>
  rollUpRegionTree<typeof item, { n: number }>({
    bump: (accumulator) => {
      accumulator.n += 1
    },
    chainOf: (one) => one.chain,
    empty: () => ({ n: 0 }),
    inScope: new Set(inScope),
    items: [item],
  })

describe('rollUpRegionTree', () => {
  it("reaches the item's own region and every ancestor in scope", () => {
    const rolled = count([CITY, REGION, COUNTRY])
    expect([...rolled.keys()].sort()).toEqual([COUNTRY, REGION, CITY])
    for (const accumulator of rolled.values()) expect(accumulator.n).toBe(1)
  })

  it('skips an ancestor above the scope, so a subtree excludes what covers it', () => {
    const rolled = count([CITY, REGION])
    expect(rolled.has(COUNTRY)).toBe(false)
    expect(rolled.get(REGION)?.n).toBe(1)
  })

  it('emits no row for a region nothing reached', () => {
    expect(count([COUNTRY]).has(REGION)).toBe(false)
  })

  /**
   * ⚠ `empty` is a factory, not a value. One shared accumulator would make
   * every region report the whole scope's total, and with a single-region
   * fixture every other case here would still pass.
   */
  it('gives each region its own accumulator', () => {
    const second = { chain: { ancestorIds: [COUNTRY], regionId: REGION } }
    const rolled = rollUpRegionTree<typeof item, number[]>({
      bump: (seen, one) => seen.push(one.chain.regionId),
      chainOf: (one) => one.chain,
      empty: () => [],
      inScope: new Set([CITY, REGION, COUNTRY]),
      items: [item, second],
    })

    expect(rolled.get(CITY)).toEqual([CITY])
    expect(rolled.get(REGION)).toEqual([CITY, REGION])
    expect(rolled.get(COUNTRY)).toEqual([CITY, REGION])
  })
})
