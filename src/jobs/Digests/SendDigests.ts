import type { Payload, TaskConfig } from 'payload'

import { createElement } from 'react'

import { DigestEmail, type DigestEmailProps } from '@/emails/DigestEmail'
import { runClock } from '@/lib/jobs/runClock'
import { pickChannel } from '@/lib/notifications'
import { managerRoles } from '@/lib/notifications/managerRoles'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { DigestWatermarks, Manager, TaskSendDigests } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'
import { capture } from '@/plugins/sentry/capture'

import { buildDigest } from './buildDigest'
import { areDigestsEnabled } from './featureFlag'

const PAGINATION_LIMIT = 200

/**
 * Send one role's digest, its subject the role's heading then the summary line,
 * and say whether it went out.
 *
 * ⚠ **A failed send throws** (`docs/rules/email.md`), which leaves that role's
 * watermarks untouched so the next run covers the same window.
 *
 * The channel is the manager's own `open_items` method. No messaging transport
 * is wired yet, so a handle logs and moves on, as every other notification's
 * stub does.
 */
export async function sendDigest(args: {
  manager: Manager
  payload: Payload
  props: DigestEmailProps
}): Promise<boolean> {
  const { manager, payload, props } = args
  const { channel, destination } = pickChannel(manager, 'open_items')

  if (channel !== 'email' || !destination) {
    payload.logger.warn({
      channel,
      msg: `notifications: ${channel} channel not yet implemented — digest logged, not delivered`,
      managerId: manager.id,
    })
    return false
  }

  const brand = getEmailBrand('sahaj-atlas')
  await payload.sendEmail({
    from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
    subject: stripNewlines(`${props.heading}: ${props.summary}`),
    to: destination,
    ...(await renderEmail(createElement(DigestEmail, props))),
  })
  return true
}

/**
 * One digest email per manager per role, holding only what is due.
 *
 * CADENCE: daily at 07:00 UTC (`0 7 * * *`), riding the hourly `nightly`
 * autoRun — the 06:00 tick enqueues it and the 07:00 tick runs it
 * (`src/jobs/queues.ts`). `recordAtlasSnapshot` runs on the 06:00 tick, so the
 * statistics an email quotes are the ones the home shows.
 *
 * ⚠ **One schedule, not three** — `PACES` in `./buildDigest.ts`.
 *
 * ⚠ **One email per role, never one per manager.** A manager who runs a class,
 * looks after a region and administers the map does three jobs, and each hat's
 * work arrives on its own pace with its own watermarks.
 *
 * Exactly-once: per-role, per-key watermarks on `Managers.digestWatermarks`. A
 * run covers `(watermark, runStart]` (`windowStart`) and advances it after the
 * send, and a key already advanced today is not due, so a task retry re-sends
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
    const result: TaskSendDigests['output'] = {
      failed: 0,
      managers: 0,
      quiet: 0,
      sectionsFailed: 0,
      sent: 0,
    }

    // Returns before any read, so no watermark advances while paused: the first
    // run after the pause covers the whole paused window.
    if (!areDigestsEnabled()) {
      payload.logger.info({ msg: 'SendDigests: disabled by DIGESTS_ENABLED' })
      return { output: result }
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
        // read carries (`docs/rules/access.md`). `joins` stays default because
        // `virtualRoles` reads only whether `docs` is non-empty.
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
              // ⚠ Undelivered is not sent: its marks stay, so nothing counts as delivered.
              if (!(await sendDigest({ manager, payload, props: built.email }))) continue
              result.sent += 1
            } else {
              result.quiet += 1
            }
            if (!built.advance.length) continue

            const marks = manager.digestWatermarks ?? {}
            const at = runStart.toISOString()
            const next: NonNullable<DigestWatermarks> = {
              ...marks,
              [role]: { ...marks[role], ...Object.fromEntries(built.advance.map((k) => [k, at])) },
            }
            // ⚠ `payload.db.updateOne`, never `update`: bookkeeping on someone
            // else's row, which must not run their hooks or re-validate legacy
            // data — and which `access.update: () => false` on the column
            // exists to stop the manager themselves doing.
            await payload.db.updateOne({
              collection: 'managers',
              data: { digestWatermarks: next },
              id: manager.id,
              req: undefined,
            })
            // ⚠ Kept in step on the loaded row, so the next role merges into
            // these marks rather than writing its own over them.
            manager.digestWatermarks = next
          } catch (error) {
            result.failed += 1
            capture({
              error,
              message: 'SendDigests: per-role failure — continuing',
              extra: { managerId: manager.id, role },
              logger: payload.logger,
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
