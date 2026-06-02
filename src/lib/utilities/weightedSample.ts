/**
 * Select up to `limit` items from `items` using weighted random sampling
 * without replacement. Each item's probability is proportional to its weight.
 *
 * - Weights ≤ 0 are treated as 0 (the item will not be sampled as long as any
 *   positive-weight item remains).
 * - If every remaining item has weight 0, the sampler falls back to uniform
 *   random selection so it can still fill up to `limit`.
 * - When `limit >= items.length`, all items are returned (still in weighted
 *   order, which is useful when upstream wants deterministic-ish ordering
 *   for consistent UI rendering).
 */
export function weightedSample<T>(
  items: readonly T[],
  limit: number,
  getWeight: (item: T) => number,
  random: () => number = Math.random,
): T[] {
  if (limit <= 0 || items.length === 0) return []

  const pool = items.map((item) => ({
    item,
    weight: Math.max(0, getWeight(item)),
  }))
  const selected: T[] = []
  const count = Math.min(limit, pool.length)

  for (let i = 0; i < count; i++) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let pickIndex: number

    if (totalWeight <= 0) {
      pickIndex = Math.floor(random() * pool.length)
    } else {
      const target = random() * totalWeight
      let cumulative = 0
      pickIndex = pool.length - 1
      for (let j = 0; j < pool.length; j++) {
        cumulative += pool[j].weight
        if (target < cumulative) {
          pickIndex = j
          break
        }
      }
    }

    selected.push(pool[pickIndex].item)
    pool.splice(pickIndex, 1)
  }

  return selected
}
