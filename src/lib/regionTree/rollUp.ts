/**
 * One pass up the region tree, whatever is being accumulated.
 *
 * Three callers rolled their own copy of this walk — the sidebar's
 * published/total pair, the overviews' six counters, and the overviews' manager
 * sets — differing only in what each added per item. A computation written
 * three times is three chances to spell the scope gate or the ancestor chain
 * differently, and each caller keeps the part that is genuinely its own: the
 * accumulator.
 *
 * Nothing is walked twice. The item set and each item's chain come from the
 * caller, so instantiating this costs what the hand-written loop cost.
 */

/** Where one item sits: its own region, and every ancestor of it. */
export interface RegionChain {
  ancestorIds: readonly number[]
  regionId: number
}

/**
 * Accumulate each item into its own region and every ancestor inside `inScope`.
 *
 * ⚠ **`inScope` gates the accumulation, not the items.** An ancestor above the
 * scope is skipped, so a manager's own subtree does not accumulate the
 * countries over it — but an item is still offered to its own region, so a
 * caller that means to leave an out-of-scope item out altogether filters
 * `items` instead. `rollUpRegionManagers` is the one that does.
 */
export function rollUpRegionTree<Item, Accumulator>(args: {
  bump: (accumulator: Accumulator, item: Item) => void
  chainOf: (item: Item) => RegionChain
  empty: () => Accumulator
  inScope: ReadonlySet<number>
  items: Iterable<Item>
}): Map<number, Accumulator> {
  const { bump, chainOf, empty, inScope, items } = args
  const rolled = new Map<number, Accumulator>()
  const into = (regionId: number, item: Item) => {
    if (!inScope.has(regionId)) return
    const accumulator = rolled.get(regionId) ?? empty()
    bump(accumulator, item)
    rolled.set(regionId, accumulator)
  }
  for (const item of items) {
    const chain = chainOf(item)
    into(chain.regionId, item)
    for (const ancestorId of chain.ancestorIds) into(ancestorId, item)
  }
  return rolled
}
