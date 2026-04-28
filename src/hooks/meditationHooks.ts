import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  Payload,
  PayloadRequest,
  Where,
} from 'payload'

import { parseBuffer } from 'music-metadata'

import type { Frame, Meditation } from '@/payload-types'

const MAX_DURATION_MINUTES = 50

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
 * beforeOperation hook that filters meditations by their `locale` select field.
 *
 * Unlike other collections that use PayloadCMS's field-level localization,
 * each meditation document belongs to a single locale via its `locale` field.
 * This hook adds a `where` clause to filter meditations by their locale
 * when `find` or `count` operations include a locale parameter.
 *
 * Skipped for:
 * - `findByID` operations (always return the specific document)
 * - `locale=all` requests (return all locales)
 * - Non-read operations (create, update, delete, etc.)
 */
export const filterMeditationsByLocale: CollectionBeforeOperationHook = ({ operation, args }) => {
  // Only filter find, count, and deprecated 'read' operations
  if (operation !== 'find' && operation !== 'count' && operation !== 'read') {
    return args
  }

  const locale = args.req?.locale

  // Skip filtering when locale is 'all' or not specified
  if (!locale || locale === 'all') {
    return args
  }

  // For deprecated 'read' operation, args could be find or findByID.
  // findByID args have an `id` property — skip filtering for those.
  if ('id' in args) {
    return args
  }

  // Build locale filter
  const localeFilter: Where = { locale: { equals: locale } }

  // Merge with existing where clause using AND logic
  const existingWhere = args.where
  if (existingWhere && Object.keys(existingWhere).length > 0) {
    args.where = {
      and: [existingWhere, localeFilter],
    }
  } else {
    args.where = localeFilter
  }

  return args
}

/**
 * beforeChange hook that extracts audio duration from uploaded files
 * using music-metadata's parseBuffer.
 *
 * Sets `data.duration` to the rounded duration in seconds.
 * Throws if the audio exceeds MAX_DURATION_MINUTES (50 minutes).
 */
export const extractAudioDuration: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (!req.file?.data) {
    return data
  }

  const buffer = Buffer.isBuffer(req.file.data) ? req.file.data : Buffer.from(req.file.data)

  let duration: number | undefined
  try {
    const metadata = await parseBuffer(buffer, { mimeType: req.file.mimetype })
    duration = metadata.format.duration
  } catch (error) {
    req.payload.logger.warn({
      msg: 'Failed to extract audio duration',
      filename: req.file.name,
      error: error instanceof Error ? error.message : String(error),
    })
    return data
  }

  if (duration == null) {
    return data
  }

  const maxSeconds = MAX_DURATION_MINUTES * 60
  if (duration > maxSeconds) {
    throw new Error(
      `Audio duration (${Math.round(duration / 60)} minutes) exceeds maximum of ${MAX_DURATION_MINUTES} minutes`,
    )
  }

  data.duration = Math.round(duration)
  return data
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
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) return {}
  if (typeof meditation.duration !== 'number' || meditation.duration <= 0) return {}

  const frameIds = rawFrames
    .map((f) => (f && typeof f === 'object' ? (f as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === 'number')

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
  for (const f of rawFrames) {
    const id = (f as { id?: unknown }).id
    const timestamp = (f as { timestamp?: unknown }).timestamp
    if (typeof id !== 'number' || typeof timestamp !== 'number') continue
    const frameDoc = frameMap.get(id)
    populated.push({
      timestamp,
      subtleSystemNode: frameDoc?.subtleSystemNode ?? null,
    })
  }
  populated.sort((a, b) => a.timestamp - b.timestamp)

  return computeMeditationNodeWeights({
    frames: populated,
    duration: meditation.duration,
  })
}

/**
 * afterChange hook that recomputes the cached `subtleSystemNodeWeights`
 * field whenever `frames` or `duration` change. The hook self-updates the
 * meditation, gated by `context.skipRecomputeNodeWeights` to break the loop.
 */
export const recomputeMeditationNodeWeights: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  context,
}) => {
  if (context?.skipRecomputeNodeWeights) return doc

  const framesChanged =
    JSON.stringify(extractFrameIds(doc.frames)) !==
    JSON.stringify(extractFrameIds(previousDoc?.frames))

  const durationChanged = doc.duration !== previousDoc?.duration

  if (!framesChanged && !durationChanged) return doc

  // Skip computing/persisting weights when the meditation has no frames yet
  // (typical fresh-create state) — the `frames` field is required on update,
  // so attempting to write back the (empty) weights would trip its validator.
  // Subsequent edits that introduce frames will fire the hook normally.
  const frameIds = extractFrameIds(doc.frames)
  if (frameIds.length === 0) return doc

  const weights = await recomputeWeightsForMeditation(req.payload, doc as Meditation, req)

  await req.payload.update({
    collection: 'meditations',
    id: doc.id,
    data: { subtleSystemNodeWeights: weights },
    context: { skipRecomputeNodeWeights: true },
    req,
  })

  return doc
}

function extractFrameIds(frames: unknown): number[] {
  if (!Array.isArray(frames)) return []
  return frames
    .map((f) => (f && typeof f === 'object' ? (f as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === 'number')
}
