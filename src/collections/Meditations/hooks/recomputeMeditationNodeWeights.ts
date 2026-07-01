import type { CollectionAfterChangeHook } from 'payload'

import * as Sentry from '@sentry/nextjs'

import {
  getFrameDiagnosticsLogContext,
  meditationFramesChanged,
  normalizeMeditationFrames,
  persistMeditationNodeWeightsCache,
  reportMeditationNodeWeightsCacheError,
} from '@/lib/meditations/frames'
import { recomputeWeightsForMeditation } from '@/lib/meditations/nodeWeights'
import type { Meditation } from '@/payload-types'

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
  operation,
}) => {
  if (context?.skipRecomputeNodeWeights) return doc

  const normalizedFrames = normalizeMeditationFrames(doc.frames)
  const framesChanged = meditationFramesChanged(previousDoc?.frames, doc.frames)

  const durationChanged = doc.duration !== previousDoc?.duration

  if (!framesChanged && !durationChanged) return doc

  // Skip computing/persisting weights when the meditation has no frames yet
  // (typical fresh-create state) — the `frames` field is required on update,
  // so attempting to write back the (empty) weights would trip its validator.
  // Subsequent edits that introduce frames will fire the hook normally.
  if (normalizedFrames.frames.length === 0) return doc

  // Manual span: the weight recompute + cache write is the intrinsic cost of a
  // meditation save that touches frames/duration. Wrapping it nests the
  // auto-instrumented `pg` queries under a named node so a trace attributes the
  // cost to this hook. See issue #529 (Phase 1).
  return Sentry.startSpan(
    {
      name: 'meditations.recomputeNodeWeights',
      op: 'payload.hook.afterChange',
      attributes: {
        'meditation.id': doc.id,
        'frames.count': normalizedFrames.frames.length,
      },
    },
    async () => {
      const diagnostics = {
        operation,
        status: doc._status,
        ...getFrameDiagnosticsLogContext(normalizedFrames),
      }

      let weights: Record<string, number>
      try {
        weights = await recomputeWeightsForMeditation(req.payload, doc as Meditation, req)
      } catch (error) {
        reportMeditationNodeWeightsCacheError({
          payload: req.payload,
          req,
          meditationId: doc.id,
          reason: 'meditation-after-change-recompute',
          diagnostics,
          error,
        })
        return doc
      }

      const persisted = await persistMeditationNodeWeightsCache({
        payload: req.payload,
        req,
        meditationId: doc.id,
        locale: typeof doc.locale === 'string' ? doc.locale : undefined,
        weights,
        reason: 'meditation-after-change',
        diagnostics,
      })

      if (!persisted) return doc

      return {
        ...doc,
        subtleSystemNodeWeights: weights,
      }
    },
  )
}
