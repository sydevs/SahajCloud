/**
 * Pure helper that converts a meditation's frames timeline into a
 * `{ slug → on-screen seconds }` map, used to weight lecture clips by
 * topical overlap (see `src/endpoints/meditationLectures.ts`).
 *
 * Input contract:
 *   - `frames` are sorted by `timestamp` ascending. Each frame's on-screen
 *     window runs until the next frame's timestamp; the last frame extends
 *     to `duration`.
 *   - `subtleSystemNode` is either a populated object with a `slug`, an
 *     unpopulated id (number/string), or null. Only populated objects with
 *     a string `slug` contribute weight — unpopulated/null frames are
 *     skipped silently (the caller must populate at depth 1).
 *
 * Returns `{}` when frames are empty, duration ≤ 0, or no frames have a
 * populated node.
 */
export type FrameWithNode = {
  timestamp: number
  subtleSystemNode?: { slug?: string | null } | number | string | null
}

export function computeMeditationNodeWeights(args: {
  frames: FrameWithNode[]
  duration: number
}): Record<string, number> {
  const { frames, duration } = args
  if (!Array.isArray(frames) || frames.length === 0) return {}
  if (typeof duration !== 'number' || !(duration > 0)) return {}

  const weights: Record<string, number> = {}

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const start = frame.timestamp
    const end = i + 1 < frames.length ? frames[i + 1].timestamp : duration

    const window = end - start
    if (!(window > 0)) continue

    const node = frame.subtleSystemNode
    const slug = node && typeof node === 'object' ? node.slug : null
    if (typeof slug !== 'string' || slug.length === 0) continue

    weights[slug] = (weights[slug] ?? 0) + window
  }

  return weights
}
