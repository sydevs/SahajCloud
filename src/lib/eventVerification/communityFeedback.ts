import type { JSONSchema4 } from 'json-schema'

import wilson from 'wilson-score-interval'

/**
 * The `communityFeedback` namespace inside an Event's `systemMeta` JSON —
 * registrant confirm/deny vote tallies for an unverified listing. Written by
 * the Registrations vote-sync hook (alongside the indexed `confidenceScore`
 * column, which stays a real column because the feeds sort on it); read by the
 * admin verification notice.
 *
 * Declared as a JSON Schema rather than parsed by a hand-written reader:
 * Payload generates the TypeScript type from this — so
 * `event.systemMeta?.communityFeedback?.denials` is checked at compile time —
 * and validates it on write, so a malformed tally can't reach the column in the
 * first place. A defensive runtime reader could only report that the data was
 * already wrong. Same mechanism as `Registrations.questions`.
 */
export const communityFeedbackJsonSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmations: {
      type: 'number',
      description: 'Registrants who confirmed the event exists.',
    },
    denials: { type: 'number', description: 'Registrants who denied it.' },
    updatedAt: { type: 'string', description: 'ISO timestamp of the last vote applied.' },
  },
}

export interface CommunityFeedback {
  /** Registrants who confirmed the event exists. */
  confirmations: number
  /** Registrants who denied it. */
  denials: number
  /** ISO timestamp of the last vote applied. */
  updatedAt: string
}

/** Denials required before the community verdict can unpublish a listing. */
export const DENIAL_MINIMUM = 5

/**
 * Wilson upper bound below which a listing counts as community-rejected: even
 * the most optimistic read of the votes says under half the registrants
 * confirm it exists.
 */
export const WILSON_UPPER_BOUND_THRESHOLD = 0.5

export interface CommunityVerdict {
  /** Wilson lower bound (the ranking score), null until the first vote. */
  score: number | null
  /** Wilson upper bound, null until the first vote. */
  upperBound: number | null
  /** Whether the denial threshold is met (≥5 denials AND upper bound < 0.5). */
  denied: boolean
}

/**
 * The community verdict for a vote tally — pure, so the thresholds are
 * unit-testable without Payload. Uses the Wilson score interval (95%): the
 * lower bound ranks listings conservatively (few votes ⇒ low confidence), the
 * upper bound drives the unpublish rule.
 */
export function computeCommunityVerdict(args: {
  confirmations: number
  denials: number
}): CommunityVerdict {
  const { confirmations, denials } = args
  const total = confirmations + denials
  if (total <= 0) return { score: null, upperBound: null, denied: false }
  const { left, right } = wilson(confirmations, total)
  return {
    score: left,
    upperBound: right,
    denied: denials >= DENIAL_MINIMUM && right < WILSON_UPPER_BOUND_THRESHOLD,
  }
}

/**
 * Safely read `communityFeedback` off a raw `systemMeta` value (a JSON field —
 * anything at runtime). Returns null when absent or malformed.
 */
export function readCommunityFeedback(systemMeta: unknown): CommunityFeedback | null {
  if (!systemMeta || typeof systemMeta !== 'object') return null
  const feedback = (systemMeta as { communityFeedback?: unknown }).communityFeedback
  if (!feedback || typeof feedback !== 'object') return null
  const { confirmations, denials, updatedAt } = feedback as Record<string, unknown>
  if (typeof confirmations !== 'number' || typeof denials !== 'number') return null
  return {
    confirmations,
    denials,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
  }
}
