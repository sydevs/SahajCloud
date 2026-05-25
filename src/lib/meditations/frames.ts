import type { Payload, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/cloudflare'

import type { KeyframeDefinition } from '@/types/frames'

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
  normalizedPayloadBytes: number
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
  normalizedPayloadBytes: JSON.stringify(frames).length,
})

export function normalizeMeditationFrames(value: unknown): {
  diagnostics: FrameNormalizationDiagnostics
  frames: NormalizedKeyframe[]
} {
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
  return JSON.stringify(previous) !== JSON.stringify(next)
}

export function hasFrameNormalizationIssues(
  diagnostics: FrameNormalizationDiagnostics,
): boolean {
  return diagnostics.droppedCount > 0 || Object.keys(diagnostics.invalidFrameReasons).length > 0
}

export function getFrameDiagnosticsLogContext(diagnostics: FrameNormalizationDiagnostics) {
  return {
    droppedFrameCount: diagnostics.droppedCount,
    frameCount: diagnostics.frameCount,
    invalidFrameReasons: diagnostics.invalidFrameReasons,
    normalizedFrameCount: diagnostics.normalizedFrameCount,
    normalizedPayloadBytes: diagnostics.normalizedPayloadBytes,
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
