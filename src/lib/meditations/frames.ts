/**
 * Centralized frame normalization for the Meditations `frames` JSON field.
 *
 * Shared by:
 *   - Meditations field hooks (validate / beforeChange / afterRead) — see
 *     `src/collections/content/Meditations.ts`
 *   - `invalidateMeditationNodeWeights` / `recomputeMeditationNodeWeights`
 *     in `src/hooks/meditationHooks.ts`
 *   - `cascadeFrameNodeChange` in `src/hooks/frameHooks.ts`
 *
 * `normalizeMeditationFrames` is idempotent: it drops malformed entries,
 * coerces string IDs to numbers, and returns diagnostics suitable for
 * `req.payload.logger.warn` and Sentry breadcrumbs. The persistence helper
 * (`persistMeditationNodeWeightsCache`) writes the derived
 * `subtleSystemNodeWeights` cache best-effort; failures must not propagate
 * to the user-facing save (root cause of issue #390).
 */
import type { JSONSchema4 } from 'json-schema'
import type { JSONField, Payload, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import type { KeyframeDefinition } from '@/types/frames'

export const MEDITATION_FRAMES_SCHEMA_URI = 'https://sahajcloud.dev/schemas/meditation-frames.json'

/**
 * What `Meditations.frames` holds: a list of keyframes, each naming a frame and
 * when it appears.
 *
 * **This types the column; it does not gate a save.** A field's `beforeChange`
 * hooks run before its `validate` (`payload/dist/fields/hooks/beforeChange/promise.js`
 * — hooks at line 58, validate at 86), and this field's hook runs
 * `normalizeMeditationFramesForStorage`, which reduces every entry to exactly
 * `{ id, timestamp }` and drops the rest. So by the time the schema sees a
 * value it always matches. What the schema buys is the generated type, which is
 * what `FrameListManager` and the ranking code read.
 *
 * Entries stay open for the same reason the normalizer exists: `afterRead`
 * enriches each keyframe with the whole Frame document, and `FrameListManager`
 * posts that enriched array straight back. Nothing but the hook stands between
 * that and the column today.
 */
export const meditationFramesJsonSchema: JSONSchema4 = {
  $id: MEDITATION_FRAMES_SCHEMA_URI,
  title: 'MeditationFrames',
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    required: ['id', 'timestamp'],
    properties: {
      id: { type: ['integer', 'string'], description: 'The Frame document id.' },
      timestamp: { type: 'number', description: 'Seconds into the meditation.' },
    },
  },
}

/** The field-level wrapper Payload wants — see `Meditations.frames`. */
export const meditationFramesFieldSchema: JSONField['jsonSchema'] = {
  uri: MEDITATION_FRAMES_SCHEMA_URI,
  fileMatch: [MEDITATION_FRAMES_SCHEMA_URI],
  schema: meditationFramesJsonSchema,
}

export const NODE_WEIGHTS_SCHEMA_URI =
  'https://sahajcloud.dev/schemas/meditation-node-weights.json'

/**
 * `Meditations.subtleSystemNodeWeights`: the cached `{ slug → on-screen
 * seconds }` map built by `computeMeditationNodeWeights`. Written only by the
 * recompute hook and the cascade from Frames, so the schema can be closed on
 * the value type while staying open on the keys — the keys are subtle-system
 * node slugs, which live in the `subtle-system` collection rather than in code.
 */
export const meditationNodeWeightsFieldSchema: JSONField['jsonSchema'] = {
  uri: NODE_WEIGHTS_SCHEMA_URI,
  fileMatch: [NODE_WEIGHTS_SCHEMA_URI],
  schema: {
    $id: NODE_WEIGHTS_SCHEMA_URI,
    title: 'MeditationNodeWeights',
    // `null` is a legal write — the cache is cleared by setting the column to
    // null — so the generated type has to carry it. Payload's built-in
    // validator skips `null` before Ajv, so this changes no save.
    type: ['object', 'null'],
    additionalProperties: { type: 'number' },
  },
}

export type FrameNormalizationIssue =
  | 'invalid-id'
  | 'invalid-timestamp'
  | 'missing-id'
  | 'missing-timestamp'
  | 'negative-timestamp'
  | 'non-object'
  | 'not-array'

export type FrameNormalizationDiagnostics = {
  droppedCount: number
  frameCount: number
  invalidFrameReasons: Partial<Record<FrameNormalizationIssue, number>>
  normalizedFrameCount: number
}

export type NormalizedFramesResult = {
  diagnostics: FrameNormalizationDiagnostics
  frames: NormalizedKeyframe[]
}

export type NormalizedKeyframe = {
  id: number
  timestamp: number
}

const incrementIssue = (
  issues: Partial<Record<FrameNormalizationIssue, number>>,
  issue: FrameNormalizationIssue,
) => {
  issues[issue] = (issues[issue] ?? 0) + 1
}

const parseFrameID = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null

    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

const buildDiagnostics = (
  frameCount: number,
  frames: NormalizedKeyframe[],
  invalidFrameReasons: Partial<Record<FrameNormalizationIssue, number>>,
): FrameNormalizationDiagnostics => ({
  droppedCount: frameCount - frames.length,
  frameCount,
  invalidFrameReasons,
  normalizedFrameCount: frames.length,
})

export function normalizeMeditationFrames(value: unknown): NormalizedFramesResult {
  const invalidFrameReasons: Partial<Record<FrameNormalizationIssue, number>> = {}

  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) {
      incrementIssue(invalidFrameReasons, 'not-array')
    }

    return {
      diagnostics: buildDiagnostics(0, [], invalidFrameReasons),
      frames: [],
    }
  }

  const frames: NormalizedKeyframe[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      incrementIssue(invalidFrameReasons, 'non-object')
      continue
    }

    const frame = item as { id?: unknown; timestamp?: unknown }
    if (frame.id === undefined || frame.id === null || frame.id === '') {
      incrementIssue(invalidFrameReasons, 'missing-id')
      continue
    }

    const id = parseFrameID(frame.id)
    if (id === null) {
      incrementIssue(invalidFrameReasons, 'invalid-id')
      continue
    }

    if (frame.timestamp === undefined || frame.timestamp === null) {
      incrementIssue(invalidFrameReasons, 'missing-timestamp')
      continue
    }

    if (typeof frame.timestamp !== 'number' || !Number.isFinite(frame.timestamp)) {
      incrementIssue(invalidFrameReasons, 'invalid-timestamp')
      continue
    }

    if (frame.timestamp < 0) {
      incrementIssue(invalidFrameReasons, 'negative-timestamp')
      continue
    }

    frames.push({ id, timestamp: frame.timestamp })
  }

  frames.sort((a, b) => a.timestamp - b.timestamp)

  return {
    diagnostics: buildDiagnostics(value.length, frames, invalidFrameReasons),
    frames,
  }
}

export function normalizeMeditationFramesForStorage(value: unknown): KeyframeDefinition[] {
  return normalizeMeditationFrames(value).frames
}

export function meditationFramesChanged(previousFrames: unknown, nextFrames: unknown): boolean {
  const previous = normalizeMeditationFrames(previousFrames).frames
  const next = normalizeMeditationFrames(nextFrames).frames
  if (previous.length !== next.length) return true
  for (let i = 0; i < previous.length; i++) {
    if (previous[i].id !== next[i].id) return true
    if (previous[i].timestamp !== next[i].timestamp) return true
  }
  return false
}

export function hasFrameNormalizationIssues(diagnostics: FrameNormalizationDiagnostics): boolean {
  return diagnostics.droppedCount > 0 || Object.keys(diagnostics.invalidFrameReasons).length > 0
}

export function getFrameDiagnosticsLogContext(result: NormalizedFramesResult) {
  const { diagnostics, frames } = result
  return {
    droppedFrameCount: diagnostics.droppedCount,
    frameCount: diagnostics.frameCount,
    invalidFrameReasons: diagnostics.invalidFrameReasons,
    normalizedFrameCount: diagnostics.normalizedFrameCount,
    normalizedPayloadBytes: JSON.stringify(frames).length,
  }
}

export function reportMeditationNodeWeightsCacheError(args: {
  diagnostics?: Record<string, unknown>
  error: unknown
  meditationId: number | string
  payload: Payload
  reason: string
  req?: PayloadRequest
}) {
  const { diagnostics, error, meditationId, payload, reason, req } = args
  const logger = req?.payload.logger ?? payload.logger
  const errorMessage = error instanceof Error ? error.message : String(error)
  const issueContext = {
    issue: '390',
    meditationId,
    reason,
    ...diagnostics,
  }

  logger.error({
    msg: 'Failed to update meditation node weights cache',
    error: errorMessage,
    ...issueContext,
  })

  Sentry.withScope((scope) => {
    scope.setTag('issue', '390')
    scope.setTag('collection', 'meditations')
    scope.setTag('operation', reason)
    scope.setExtra('meditationNodeWeightsCache', issueContext)
    Sentry.captureException(error)
  })
}

/**
 * Persist the derived `subtleSystemNodeWeights` cache directly via the DB
 * adapter. Intentionally bypasses `payload.update` for two reasons:
 *
 * 1. It avoids re-entering the Meditations `afterChange` hook (no need
 *    for a `skipRecomputeNodeWeights` context flag and no risk of an
 *    infinite recompute loop).
 * 2. The write is best-effort: on failure we report to logger + Sentry
 *    and return `false`, but never throw. This is the fix for issue #390
 *    — a cache-write error must never 500 the user-facing publish.
 */
export async function persistMeditationNodeWeightsCache(args: {
  diagnostics?: Record<string, unknown>
  locale?: string | null
  meditationId: number | string
  payload: Payload
  reason: string
  req?: PayloadRequest
  weights: Record<string, number> | null
}): Promise<boolean> {
  const { diagnostics, locale, meditationId, payload, reason, req, weights } = args

  try {
    await payload.db.updateOne({
      collection: 'meditations',
      id: meditationId,
      data: { subtleSystemNodeWeights: weights },
      locale: locale ?? undefined,
      req,
      returning: false,
    })
    return true
  } catch (error) {
    reportMeditationNodeWeightsCacheError({
      diagnostics,
      error,
      meditationId,
      payload,
      reason,
      req,
    })

    return false
  }
}
