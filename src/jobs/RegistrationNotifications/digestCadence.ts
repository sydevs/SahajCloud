import type { PayloadRequest } from 'payload'

import type { DigestPeriod } from '@/emails/RegistrationDigestEmail'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
/** Weekly digests fire on this UTC weekday (Sunday = 0 … Monday = 1). */
const WEEKLY_ANCHOR_WEEKDAY = 1

// The summary cadence strings, from the NotificationPreferences source of truth.
const DAILY_SUMMARY = 'Daily Summary'
const WEEKLY_SUMMARY = 'Weekly Summary'

/**
 * Which digest a cadence is due for at `runStart`, or `null` for none. Every
 * daily run serves `Daily Summary`; the Monday run also serves `Weekly
 * Summary`. Both anchors are fixed, never "7 days since this recipient last got
 * one", so the digest jobs agree on when a week ends.
 */
export function dueDigestPeriod(
  frequency: string | undefined,
  runStart: Date,
): { period: DigestPeriod; periodMs: number } | null {
  if (frequency === DAILY_SUMMARY) return { period: 'day', periodMs: DAY_MS }
  if (frequency === WEEKLY_SUMMARY && runStart.getUTCDay() === WEEKLY_ANCHOR_WEEKDAY) {
    return { period: 'week', periodMs: WEEK_MS }
  }
  return null
}

/** The run's clock. `req.context.now` overrides it for deterministic tests. */
export function digestRunStart(req: PayloadRequest): Date {
  const contextNow = (req.context as { now?: unknown } | undefined)?.now
  return contextNow instanceof Date ? contextNow : new Date()
}
