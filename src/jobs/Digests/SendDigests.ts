import type { TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { runClock } from '@/lib/jobs/runClock'
import { managerRoles } from '@/lib/notifications/managerRoles'
import type { Manager } from '@/payload-types'

import { buildDigest } from './buildDigest'
import { sendDigest } from './sendDigest'
import { advanceWatermarks } from './watermarks'

const PAGINATION_LIMIT = 200

interface DigestResult {
  /** Managers with at least one role to report on. */
  managers: number
  /** Emails sent. */
  sent: number
  /** Roles that had nothing due. */
  quiet: number
  /** Sections whose own query threw, across every email. */
  sectionsFailed: number
  /** Roles whose processing threw. */
  failed: number
}

/**
 * One digest email per manager per role, holding only what is due.
 *
 * CADENCE: daily at 07:00 UTC (`0 7 * * *`), riding the hourly `nightly`
 * autoRun — the 06:00 tick enqueues it and the 07:00 tick runs it
 * (`src/jobs/queues.ts`). `recordAtlasSnapshot` runs on the 06:00 tick, so the
 * statistics an email quotes are the ones the home shows.
 *
 * ⚠ **One schedule, not three.** Daily, Weekly and Monthly are decided from
 * this run's own clock (`./due.ts`); three schedules would send a Weekly
 * manager two emails on a Monday the 1st.
 *
 * ⚠ **One email per role, never one per manager.** A manager who runs a class,
 * looks after a region and administers the map does three jobs, and each hat's
 * work arrives on its own pace with its own watermarks.
 *
 * Exactly-once: per-role, per-key watermarks on `Managers.digestWatermarks`. A
 * run covers `(max(watermark, runStart − period), runStart]` and advances it
 * after the send, so nothing lands in two emails and a task retry re-sends
 * nothing. **A crash between the send and the advance re-sends that role's
 * email**, which is the accepted direction: a duplicate is a nuisance, a
 * dropped month of open items is not.
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const SendDigests: TaskConfig<'sendDigests'> = {
  slug: 'sendDigests',
  label: 'Send Digests',
  retries: 1,
  concurrency: { key: () => 'sendDigests', exclusive: true },
  outputSchema: [
    { name: 'managers', type: 'number', required: true },
    { name: 'sent', type: 'number', required: true },
    { name: 'quiet', type: 'number', required: true },
    { name: 'sectionsFailed', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 7 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    const payload = req.payload
    const runStart = runClock(req)
    const result: DigestResult = {
      failed: 0,
      managers: 0,
      quiet: 0,
      sectionsFailed: 0,
      sent: 0,
    }

    // Managers are staff — a bounded set — so the run scans them and reads
    // each one's paces in memory rather than querying inside the preferences
    // JSON, which no index reaches.
    let page = 1
    let hasNextPage = true
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'managers',
        depth: 0,
        // The two Atlas roles are derived from these joins, which an ordinary
        // read carries (`docs/rules/access.md`). `joins` is left at its default
        // because `virtualRoles` reads only whether `docs` is non-empty.
        limit: PAGINATION_LIMIT,
        overrideAccess: true,
        page,
        req,
        where: { type: { not_equals: 'inactive' } },
      })

      for (const manager of batch.docs as Manager[]) {
        const roles = managerRoles(manager)
        if (!roles.length) continue
        result.managers += 1

        for (const role of roles) {
          try {
            const built = await buildDigest({ manager, req, role, runStart })
            result.sectionsFailed += built.failed
            if (built.email) {
              // Send first, then advance: a send failure throws, leaving the
              // marks where they were so the whole window retries next run.
              await sendDigest({
                manager,
                payload,
                props: built.email.props,
                subject: built.email.subject,
              })
              result.sent += 1
            } else {
              result.quiet += 1
            }
            // Assigned back, so the next role in this loop merges into the
            // marks the last one wrote rather than over them.
            manager.digestWatermarks = await advanceWatermarks({
              keys: built.advance,
              manager,
              payload,
              role,
              runStart,
            })
          } catch (error) {
            result.failed += 1
            Sentry.withScope((scope) => {
              scope.setContext('sendDigests', { managerId: manager.id, role })
              Sentry.captureException(error)
            })
            payload.logger.warn({
              error: error instanceof Error ? error.message : String(error),
              managerId: manager.id,
              msg: 'SendDigests: per-role failure — continuing',
              role,
            })
          }
        }
      }

      hasNextPage = batch.hasNextPage
      page++
    }

    payload.logger.info({ msg: 'SendDigests complete', ...result })
    return { output: result }
  },
}
