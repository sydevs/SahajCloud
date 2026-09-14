/**
 * Abuse Detection Utilities
 *
 * Simple abuse score calculation:
 * - Frequency (40%): highUsageDays / daysActive
 * - Recency (30%): Decay from lastHighUsageAt
 * - Current (30%): dailyRequests / threshold
 */

import { z } from 'zod'

import type { ClientAbuseScore } from '@/payload-types'

import { HIGH_USAGE_THRESHOLD } from './constants'

/**
 * The schema behind `ClientAbuseScore`, for `Clients.usage.abuseScore`.
 *
 * That column is virtual: `calculateAbuseScore` below is its only writer and
 * nothing stores it, so the shape can be closed — no row exists under an
 * earlier one. `json-field-schemas.spec.ts` pins the generated type to it.
 */
export const abuseScoreSchema = z.strictObject({
  score: z.number().describe('Abuse score from 0-100.'),
  level: z
    .enum(['normal', 'elevated', 'high', 'critical'])
    .describe('Severity band the score falls in.'),
  breakdown: z.strictObject({
    frequency: z.number().describe('Frequency contribution (0-40).'),
    recency: z.number().describe('Recency contribution (0-30).'),
    current: z.number().describe('Current-spike contribution (0-30).'),
  }),
})

// ============================================================================
// ABUSE SCORE CALCULATION
// ============================================================================

/**
 * Calculate abuse score from usage data.
 *
 * Formula:
 * - Frequency (40%): highUsageDays / daysActive
 * - Recency (30%): Exponential decay from lastHighUsageAt (half-life ~30 days)
 * - Current (30%): dailyRequests / HIGH_USAGE_THRESHOLD (capped at 1)
 *
 * @param usage - Client usage statistics
 * @returns Abuse score with level and breakdown
 */
export function calculateAbuseScore(usage: {
  dailyRequests?: number | null
  highUsageDays?: number | null
  lastHighUsageAt?: string | null
  firstRequestAt?: string | null
}): ClientAbuseScore {
  const { dailyRequests = 0, highUsageDays = 0, lastHighUsageAt, firstRequestAt } = usage

  // Calculate days active (minimum 1)
  const daysActive = firstRequestAt
    ? Math.max(1, Math.floor((Date.now() - new Date(firstRequestAt).getTime()) / 86400000))
    : 1

  // Frequency: what percentage of days exceeded threshold (40% weight)
  const frequencyRatio = Math.min(1, (highUsageDays || 0) / daysActive)
  const frequency = Math.round(frequencyRatio * 40)

  // Recency: exponential decay over 30 days (30% weight)
  const daysSinceHigh = lastHighUsageAt
    ? Math.floor((Date.now() - new Date(lastHighUsageAt).getTime()) / 86400000)
    : 999
  const recencyRatio = Math.exp(-daysSinceHigh / 30)
  const recency = Math.round(recencyRatio * 30)

  // Current spike: ratio to threshold (30% weight)
  const currentRatio = Math.min(1, (dailyRequests || 0) / HIGH_USAGE_THRESHOLD)
  const current = Math.round(currentRatio * 30)

  // Total score
  const score = frequency + recency + current

  // Determine level
  const level: ClientAbuseScore['level'] =
    score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'elevated' : 'normal'

  return { score, level, breakdown: { frequency, recency, current } }
}
