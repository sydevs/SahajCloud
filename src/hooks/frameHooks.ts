import type { CollectionAfterChangeHook } from 'payload'

import { extractID } from 'payload/shared'

import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
import {
  getFrameDiagnosticsLogContext,
  normalizeMeditationFrames,
  persistMeditationNodeWeightsCache,
  reportMeditationNodeWeightsCacheError,
} from '@/lib/meditations/frames'
import type { Meditation } from '@/payload-types'

/**
 * afterChange hook on Frames. When a frame's `subtleSystemNode`
 * relationship changes, find every meditation whose JSON `frames` array
 * references this frame and recompute its cached `subtleSystemNodeWeights`.
 *
 * Full-table scan: meditations store `frames` as a JSON column (array of
 * `{ id, timestamp }`), so we walk all meditations and filter in app code
 * rather than relying on a SQLite JSON_EXTRACT query (no precedent in this
 * codebase). Acceptable while the active scale stays small; revisit if the
 * meditations table grows past the order of a few thousand rows.
 *
 * Each Meditation update sets `context.skipRecomputeNodeWeights` so the
 * cascade doesn't re-trigger Meditation's own afterChange hook.
 */
export const cascadeFrameNodeChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  if (operation !== 'update') return doc

  const before = previousDoc?.subtleSystemNode
    ? extractID(previousDoc.subtleSystemNode)
    : null
  const after = doc?.subtleSystemNode ? extractID(doc.subtleSystemNode) : null
  if (before === after) return doc

  const changedFrameId = typeof doc.id === 'number' ? doc.id : Number(doc.id)
  if (!Number.isSafeInteger(changedFrameId)) return doc

  const { docs } = await req.payload.find({
    collection: 'meditations',
    limit: 0,
    depth: 0,
    pagination: false,
    locale: 'all',
    req,
  })

  const affected = (docs as Meditation[])
    .map((meditation) => ({
      meditation,
      normalized: normalizeMeditationFrames(meditation.frames),
    }))
    .filter(({ normalized }) => normalized.frames.some((f) => f.id === changedFrameId))

  if (affected.length === 0) return doc

  for (const { meditation, normalized } of affected) {
    const diagnostics = {
      frameId: doc.id,
      operation,
      status: meditation._status,
      ...getFrameDiagnosticsLogContext(normalized.diagnostics),
    }

    let weights: Record<string, number>
    try {
      weights = await recomputeWeightsForMeditation(req.payload, meditation, req)
    } catch (error) {
      reportMeditationNodeWeightsCacheError({
        payload: req.payload,
        req,
        meditationId: meditation.id,
        reason: 'frame-cascade-recompute',
        diagnostics,
        error,
      })
      continue
    }

    await persistMeditationNodeWeightsCache({
      payload: req.payload,
      meditationId: meditation.id,
      weights,
      reason: 'frame-cascade',
      diagnostics,
      req,
      locale: meditation.locale ?? undefined,
    })
  }

  return doc
}
