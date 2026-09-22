import type { CollectionBeforeChangeHook } from 'payload'

import * as Sentry from '@sentry/nextjs'

import {
  getFrameDiagnosticsLogContext,
  meditationFramesChanged,
  normalizeMeditationFrames,
  reportMeditationNodeWeightsCacheError,
} from '@/lib/meditations/frames'
import { recomputeWeightsForMeditation } from '@/lib/meditations/nodeWeights'

/**
 * beforeChange hook: recompute the derived `subtleSystemNodeWeights` cache
 * whenever `frames` or `duration` changes, and hand it to the save already in
 * flight.
 *
 * Riding the save is what makes the cache correct rather than merely fresh.
 * Payload writes the main row and the `latest: true` version row from one
 * `data`, so they cannot disagree, and a later save cannot start from a version
 * row the cache never reached (#843). It also gives the cache a `_status` for
 * free: a draft save carries it to the draft's version row only, and a publish
 * is what moves it onto the published main row.
 *
 * Never throws (#390). A compute failure clears the column and reports, exactly
 * as the split beforeChange/afterChange pair did.
 *
 * `context.skipRecomputeNodeWeights` still opts a write out, for a caller
 * setting the column deliberately.
 */
export const cacheMeditationNodeWeights: CollectionBeforeChangeHook = async ({
  context,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (context?.skipRecomputeNodeWeights) return data

  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(data, key)
  const framesChanged =
    hasOwn('frames') && meditationFramesChanged(originalDoc?.frames, data.frames)
  const durationChanged = hasOwn('duration') && data.duration !== originalDoc?.duration

  if (!framesChanged && !durationChanged) return data

  // This hook runs before the `frames` field's own beforeChange, so `data.frames`
  // is still whatever the client posted — `FrameListManager` sends the enriched
  // array back. The normalizer is what makes that shape safe to read.
  const frames = hasOwn('frames') ? data.frames : originalDoc?.frames
  const duration = hasOwn('duration') ? data.duration : originalDoc?.duration
  const normalized = normalizeMeditationFrames(frames)

  if (normalized.frames.length === 0) {
    data.subtleSystemNodeWeights = null
    return data
  }

  // Manual span: the weight recompute is the intrinsic cost of a meditation save
  // that touches frames/duration. Wrapping it nests the auto-instrumented `pg`
  // queries under a named node so a trace attributes the cost to this hook. See
  // issue #529 (Phase 1).
  return Sentry.startSpan(
    {
      name: 'meditations.cacheNodeWeights',
      op: 'payload.hook.beforeChange',
      attributes: {
        'meditation.id': originalDoc?.id ?? null,
        'frames.count': normalized.frames.length,
      },
    },
    async () => {
      try {
        data.subtleSystemNodeWeights = await recomputeWeightsForMeditation(
          req.payload,
          { duration, frames },
          req,
        )
      } catch (error) {
        data.subtleSystemNodeWeights = null

        reportMeditationNodeWeightsCacheError({
          diagnostics: {
            operation,
            status: data._status,
            ...getFrameDiagnosticsLogContext(normalized),
          },
          error,
          meditationId: originalDoc?.id ?? 'new',
          payload: req.payload,
          reason: 'meditation-before-change',
          req,
        })
      }

      return data
    },
  )
}
