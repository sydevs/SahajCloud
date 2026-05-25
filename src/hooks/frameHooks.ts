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

function toNumericId(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const id = extractID(value as Parameters<typeof extractID>[0])
  const numeric = typeof id === 'number' ? id : Number(id)
  return Number.isFinite(numeric) ? numeric : null
}

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

  // `extractID` can return either `number` or `string`; coerce both sides so
  // `1` and `"1"` compare equal. If coercion yields NaN, fall through and
  // treat as a change — recomputing is safer than silently skipping.
  const before = toNumericId(previousDoc?.subtleSystemNode)
  const after = toNumericId(doc?.subtleSystemNode)
  if (before !== null && after !== null && before === after) return doc

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
      ...getFrameDiagnosticsLogContext(normalized),
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
