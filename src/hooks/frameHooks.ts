import type { CollectionAfterChangeHook } from 'payload'

import { extractID } from 'payload/shared'

import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
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

  const { docs } = await req.payload.find({
    collection: 'meditations',
    limit: 0,
    depth: 0,
    pagination: false,
    locale: 'all',
    req,
  })

  const affected = (docs as Meditation[]).filter(
    (m) =>
      Array.isArray(m.frames) &&
      m.frames.some((f) => {
        if (!f || typeof f !== 'object') return false
        const fid = (f as { id?: unknown }).id
        return fid === doc.id
      }),
  )

  if (affected.length === 0) return doc

  for (const m of affected) {
    const weights = await recomputeWeightsForMeditation(req.payload, m, req)
    await req.payload.update({
      collection: 'meditations',
      id: m.id,
      data: { subtleSystemNodeWeights: weights },
      context: { skipRecomputeNodeWeights: true },
      req,
      locale: m.locale ?? undefined,
    })
  }

  return doc
}
