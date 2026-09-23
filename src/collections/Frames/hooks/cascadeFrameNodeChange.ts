import type { CollectionAfterChangeHook } from 'payload'

import * as Sentry from '@sentry/nextjs'
import { extractID } from 'payload/shared'

import {
  getFrameDiagnosticsLogContext,
  normalizeMeditationFrames,
  persistMeditationNodeWeightsCache,
  reportMeditationNodeWeightsCacheError,
} from '@/lib/meditations/frames'
import { recomputeWeightsForMeditation } from '@/lib/meditations/nodeWeights'
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
 * This is the one node-weights writer with no save of its own to ride — it
 * touches meditations other than the document being saved — so it goes through
 * `persistMeditationNodeWeightsCache`, whose DB-adapter bypass keeps a derived
 * write from restamping `updatedAt` on every meditation using the frame. That
 * write reaches the main row alone; the meditation's own next published save is
 * what brings its `latest: true` version row back in line (#843).
 */
export const cascadeFrameNodeChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  if (operation !== 'update') return doc

  const before = previousDoc?.subtleSystemNode ? extractID(previousDoc.subtleSystemNode) : null
  const after = doc?.subtleSystemNode ? extractID(doc.subtleSystemNode) : null
  if (before === after) return doc

  const changedFrameId = typeof doc.id === 'number' ? doc.id : Number(doc.id)
  if (!Number.isSafeInteger(changedFrameId)) return doc

  // Manual span: this full-table meditations scan + per-doc recompute is the
  // expensive part of a Frame node change. Wrapping it as an active span nests
  // the auto-instrumented `pg` queries underneath a single named node, so a
  // trace shows the cascade cost at a glance. See issue #529 (Phase 1).
  return Sentry.startSpan(
    {
      name: 'frames.cascadeNodeChange',
      op: 'payload.hook.afterChange',
      attributes: { 'frame.id': changedFrameId },
    },
    async (span) => {
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

      span.setAttribute('meditations.scanned', docs.length)
      span.setAttribute('meditations.affected', affected.length)

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
    },
  )
}
