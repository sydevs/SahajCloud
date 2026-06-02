import { describe, expect, it } from 'vitest'

import { weightedSample } from '@/lib/utilities/weightedSample'

describe('weightedSample', () => {
  const weightOf = (x: { w: number }) => x.w

  it('returns [] for empty input', () => {
    expect(weightedSample([], 5, weightOf)).toEqual([])
  })

  it('returns [] when limit is 0 or negative', () => {
    expect(weightedSample([{ w: 1 }], 0, weightOf)).toEqual([])
    expect(weightedSample([{ w: 1 }], -1, weightOf)).toEqual([])
  })

  it('returns the single item for a single-element input', () => {
    const result = weightedSample([{ w: 3 }], 5, weightOf)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ w: 3 })
  })

  it('returns at most `limit` items', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, w: 1 }))
    const result = weightedSample(items, 3, weightOf)
    expect(result).toHaveLength(3)
  })

  it('returns all items when limit exceeds input length', () => {
    const items = [{ id: 1, w: 1 }, { id: 2, w: 2 }]
    const result = weightedSample(items, 10, weightOf)
    expect(result).toHaveLength(2)
  })

  it('never produces duplicates (sampling without replacement)', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i, w: 1 }))
    for (let trial = 0; trial < 50; trial++) {
      const result = weightedSample(items, 15, weightOf)
      const ids = result.map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('falls back to uniform random when all weights are zero', () => {
    const items = [{ id: 'a', w: 0 }, { id: 'b', w: 0 }, { id: 'c', w: 0 }]
    const result = weightedSample(items, 2, weightOf)
    expect(result).toHaveLength(2)
    const ids = new Set(result.map((x) => x.id))
    expect(ids.size).toBe(2)
  })

  it('distributes roughly in proportion to weights over many trials', () => {
    const items = [
      { id: 'low', w: 1 },
      { id: 'high', w: 5 },
    ]
    const counts = { low: 0, high: 0 }
    const iterations = 5000

    for (let i = 0; i < iterations; i++) {
      const [picked] = weightedSample(items, 1, weightOf)
      counts[picked.id as 'low' | 'high']++
    }

    // Expected: high ~5x more frequent than low (5000 * 5/6 ≈ 4167 vs 833).
    // Loose tolerance: high should outpace low by at least 3x.
    expect(counts.high).toBeGreaterThan(counts.low * 3)
  })

  it('supports an injected random function for determinism', () => {
    const items = [{ id: 'a', w: 1 }, { id: 'b', w: 1 }, { id: 'c', w: 1 }]
    // Always returns 0 → always picks index 0 from the current pool
    const pickFirst = () => 0
    const result = weightedSample(items, 3, weightOf, pickFirst)
    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})
