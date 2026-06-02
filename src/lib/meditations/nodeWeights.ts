import type { Payload, PayloadRequest } from 'payload'

import { normalizeMeditationFrames } from '@/lib/meditations/frames'
import type { Frame, Meditation } from '@/payload-types'

/**
 * Pure helper that converts a meditation's frames timeline into a
 * `{ slug → on-screen seconds }` map, used to weight lecture clips by
 * topical overlap (see Meditations/endpoints/lectures.ts).
 *
 * Input contract:
 *   - `frames` are sorted by `timestamp` ascending. Each frame's on-screen
 *     window runs until the next frame's timestamp; the last frame extends
 *     to `duration`.
 *   - `subtleSystemNode` is either a populated object with a `slug`, an
 *     unpopulated id, or null. Only populated objects with a string `slug`
 *     contribute weight — unpopulated/null frames are skipped silently
 *     (the caller must populate at depth 1).
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

/**
 * Read the cached subtle-system-node weights for `meditation` by re-computing
 * from its current `frames` JSON + `duration`. Bulk-fetches Frame docs at
 * depth 1 so each frame has its `subtleSystemNode` relationship populated
 * with `slug`. Returns `{}` for meditations with no frames or no nodes.
 */
export async function recomputeWeightsForMeditation(
  payload: Payload,
  meditation: Pick<Meditation, 'id' | 'frames' | 'duration'>,
  req?: PayloadRequest,
): Promise<Record<string, number>> {
  const rawFrames = meditation.frames
  const { frames } = normalizeMeditationFrames(rawFrames)
  if (frames.length === 0) return {}
  if (typeof meditation.duration !== 'number' || meditation.duration <= 0) return {}

  const frameIds = [...new Set(frames.map((f) => f.id))]

  if (frameIds.length === 0) return {}

  const { docs: frameDocs } = await payload.find({
    collection: 'frames',
    where: { id: { in: frameIds } },
    limit: frameIds.length,
    depth: 1,
    pagination: false,
    req,
  })

  const frameMap = new Map<number, Frame>(frameDocs.map((d) => [d.id, d as Frame]))

  type PopulatedFrame = {
    timestamp: number
    subtleSystemNode: NonNullable<Frame['subtleSystemNode']> | null
  }
  const populated: PopulatedFrame[] = []
  for (const f of frames) {
    const frameDoc = frameMap.get(f.id)
    populated.push({
      timestamp: f.timestamp,
      subtleSystemNode: frameDoc?.subtleSystemNode ?? null,
    })
  }
  populated.sort((a, b) => a.timestamp - b.timestamp)

  return computeMeditationNodeWeights({
    frames: populated,
    duration: meditation.duration,
  })
}
