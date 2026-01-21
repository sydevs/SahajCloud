/**
 * Usage Plugin Tasks
 *
 * Task configurations for daily usage reset.
 */

import type { D1Database } from '@cloudflare/workers-types'
import type { Payload, TaskConfig } from 'payload'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as Sentry from '@sentry/cloudflare'

import { serverEnv } from '@/lib/env'
import type { Client } from '@/payload-types'

import { HIGH_USAGE_THRESHOLD } from './constants'

// ============================================================================
// ABUSE MILESTONES
// ============================================================================

/**
 * Thresholds for Sentry milestone reporting.
 * Only used internally by reportAbuseMilestones().
 */
const ABUSE_MILESTONES = {
  /** Report when highUsageDays reaches 1 (first offense) */
  FIRST_HIGH_USAGE: 1,
  /** Report when highUsageDays reaches 10 (persistent pattern) */
  PERSISTENT_ABUSER: 10,
} as const

// ============================================================================
// ABUSE MILESTONE REPORTING
// ============================================================================

interface AbuseMilestoneReport {
  clientId: string | number
  clientName: string
  milestone: 'first_high_usage' | 'persistent_abuser'
  highUsageDays: number
}

/**
 * Identify clients crossing abuse milestones and report to Sentry.
 *
 * Milestones:
 * - first_high_usage: Client exceeds threshold for the first time (0 → 1)
 * - persistent_abuser: Client reaches 10 high-usage days (9 → 10)
 */
async function reportAbuseMilestones(req: { payload: Payload }): Promise<void> {
  const milestonesToReport: AbuseMilestoneReport[] = []

  // Single query for both milestone conditions:
  // - First-time high usage (highUsageDays = 0, about to become 1)
  // - Becoming persistent abuser (highUsageDays = 9, about to become 10)
  const clientsAtMilestones = await req.payload.find({
    collection: 'clients',
    where: {
      and: [
        { 'usage.dailyRequests': { greater_than: HIGH_USAGE_THRESHOLD } },
        {
          or: [
            { 'usage.highUsageDays': { equals: 0 } },
            { 'usage.highUsageDays': { equals: ABUSE_MILESTONES.PERSISTENT_ABUSER - 1 } },
          ],
        },
      ],
    },
    limit: 100,
    depth: 0,
  })

  for (const client of clientsAtMilestones.docs as Client[]) {
    const currentHighUsageDays = client.usage?.highUsageDays || 0

    if (currentHighUsageDays === 0) {
      milestonesToReport.push({
        clientId: client.id,
        clientName: client.name || 'Unknown',
        milestone: 'first_high_usage',
        highUsageDays: ABUSE_MILESTONES.FIRST_HIGH_USAGE,
      })
    } else if (currentHighUsageDays === ABUSE_MILESTONES.PERSISTENT_ABUSER - 1) {
      milestonesToReport.push({
        clientId: client.id,
        clientName: client.name || 'Unknown',
        milestone: 'persistent_abuser',
        highUsageDays: ABUSE_MILESTONES.PERSISTENT_ABUSER,
      })
    }
  }

  // Report to Sentry if DSN is configured and we have milestones to report
  if (serverEnv.NEXT_PUBLIC_SENTRY_DSN && milestonesToReport.length > 0) {
    for (const report of milestonesToReport) {
      Sentry.withScope((scope) => {
        scope.setTag('clientId', String(report.clientId))
        scope.setTag('milestone', report.milestone)
        scope.setLevel('warning')
        scope.setContext('abuse_details', {
          clientName: report.clientName,
          highUsageDays: report.highUsageDays,
          threshold: HIGH_USAGE_THRESHOLD,
        })

        const message =
          report.milestone === 'first_high_usage'
            ? `API abuse milestone: First high-usage day for "${report.clientName}"`
            : `API abuse milestone: "${report.clientName}" is now a persistent abuser (${report.highUsageDays} days)`

        Sentry.captureMessage(message)
      })
    }

    req.payload.logger.info({
      msg: 'Reported abuse milestones to Sentry',
      count: milestonesToReport.length,
      milestones: milestonesToReport.map((m) => ({
        clientId: m.clientId,
        milestone: m.milestone,
      })),
    })
  }
}

// ============================================================================
// RESET USAGE TASK
// ============================================================================

/**
 * Task that resets daily counters at midnight UTC.
 *
 * - Updates peakDailyRequests if current is higher
 * - Increments highUsageDays if threshold exceeded
 * - Updates lastHighUsageAt if threshold exceeded
 * - Resets dailyRequests to 0
 *
 * In production: Uses D1 atomic SQL for race-condition-free updates.
 * In development: Falls back to Payload API (race conditions acceptable in dev).
 */
export const resetUsageTask: TaskConfig<'resetUsage'> = {
  slug: 'resetUsage',
  label: 'Reset Usage Counters',
  retries: 2,
  inputSchema: [],
  outputSchema: [],
  schedule: [{ cron: '0 0 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    // =========================================================================
    // Step 1: Identify and report abuse milestones BEFORE updating counters
    // =========================================================================
    await reportAbuseMilestones(req)

    // Production - use D1 atomic SQL
    if (process.env.NODE_ENV === 'production') {
      try {
        const { env } = await getCloudflareContext({ async: true })
        const db = (env as { D1?: D1Database }).D1

        if (db) {
          const now = new Date().toISOString()

          // Atomic reset with abuse tracking (single query)
          await db
            .prepare(
              `
            UPDATE clients
            SET
              usage_peak_daily_requests = MAX(
                COALESCE(usage_peak_daily_requests, 0),
                COALESCE(usage_daily_requests, 0)
              ),
              usage_high_usage_days = CASE
                WHEN COALESCE(usage_daily_requests, 0) > ?
                THEN COALESCE(usage_high_usage_days, 0) + 1
                ELSE COALESCE(usage_high_usage_days, 0)
              END,
              usage_last_high_usage_at = CASE
                WHEN COALESCE(usage_daily_requests, 0) > ?
                THEN ?
                ELSE usage_last_high_usage_at
              END,
              usage_daily_requests = 0
            WHERE usage_daily_requests > 0
          `,
            )
            .bind(HIGH_USAGE_THRESHOLD, HIGH_USAGE_THRESHOLD, now)
            .run()

          return { output: null }
        }

        req.payload.logger.warn({ msg: 'D1 binding not available for reset, using fallback' })
      } catch (error) {
        req.payload.logger.error({
          msg: 'D1 reset failed, using fallback',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Development fallback - use Payload API
    const clientsWithUsage = await req.payload.find({
      collection: 'clients',
      where: { 'usage.dailyRequests': { greater_than: 0 } },
      limit: 1000,
    })

    const now = new Date().toISOString()

    for (const client of clientsWithUsage.docs as Client[]) {
      const stats = client.usage || {}
      const dailyRequests = stats.dailyRequests || 0
      const peakDailyRequests = stats.peakDailyRequests || 0
      const highUsageDays = stats.highUsageDays || 0
      const exceededThreshold = dailyRequests > HIGH_USAGE_THRESHOLD

      await req.payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          usage: {
            ...stats,
            peakDailyRequests: Math.max(peakDailyRequests, dailyRequests),
            highUsageDays: exceededThreshold ? highUsageDays + 1 : highUsageDays,
            lastHighUsageAt: exceededThreshold ? now : stats.lastHighUsageAt,
            dailyRequests: 0,
          },
        },
      })
    }

    return { output: null }
  },
}
