import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import {
  asNotificationLog,
  buildReminderEntry,
  hasReminderForStage,
} from '@/lib/eventVerification/log'
import { signVerifyToken } from '@/lib/eventVerification/token'
import { buildVerifyEmailLink } from '@/lib/eventVerification/verifyUrl'
import {
  buildEventEmailDetails,
  buildManagerContacts,
  formatLongDate,
  humanDurationSince,
  resolveRecipients,
  sendNotification,
  type ReminderPayload,
} from '@/lib/notifications'
import type { Event } from '@/payload-types'

import {
  computeNextCheckAt,
  nextStageTransition,
  shouldFinish,
  unpublishDate,
} from './stageMachine'

const PAGINATION_LIMIT = 200

interface ExpireResult {
  /** Due events examined. */
  processed: number
  /** Marked `finished` (schedule ended, non-inactive). */
  finished: number
  /** Advanced one reminder stage. */
  advanced: number
  /** Soft-deleted (the expired → trash terminal). */
  trashed: number
  /** Individual reminders delivered. */
  remindersSent: number
  /** Events whose processing threw. */
  failed: number
}

/**
 * Mark a due event `finished` (terminal, unpublished, no email). Atlas's
 * `should_finish?` — its schedule ran out and it isn't inactive.
 */
async function finishEvent(payload: Payload, req: PayloadRequest, event: Event): Promise<void> {
  await payload.update({
    collection: 'events',
    id: event.id,
    data: { verificationStage: 'finished', _status: 'draft', nextCheckAt: null },
    context: { skipVerifyHook: true },
    overrideAccess: true,
    req,
  })
}

/**
 * Process one due event: finished-check first, then the reminder ladder. Sends
 * a stage's reminder only to recipients not already logged for that stage this
 * cycle, persisting each successful send immediately (so a crash resumes
 * without duplicating), and advances the stage only once every recipient is
 * logged. A partial fan-out leaves the stage + (past) `nextCheckAt` untouched so
 * the next run retries the missing recipients.
 */
async function processEvent(args: {
  payload: Payload
  req: PayloadRequest
  event: Event
  now: Date
  result: ExpireResult
}): Promise<void> {
  const { payload, req, event, now, result } = args

  // Finished-check first — supersedes the reminder ladder.
  if (shouldFinish(event)) {
    await finishEvent(payload, req, event)
    result.finished++
    return
  }

  const transition = nextStageTransition(event.verificationStage)
  if (!transition) return

  // Expired grace elapsed → soft-delete (the "archived" terminal, no email).
  // Trashing = setting `deletedAt` (payload.delete is a hard delete); the doc
  // is then excluded from default queries but recoverable from the admin trash.
  if (transition.nextStage === 'trash') {
    await payload.update({
      collection: 'events',
      id: event.id,
      data: { deletedAt: now.toISOString() },
      context: { skipVerifyHook: true },
      overrideAccess: true,
      req,
    })
    result.trashed++
    return
  }

  // Reminder stage. Dedup key = the current (from) stage.
  const stage = event.verificationStage
  const recipients = await resolveRecipients({
    payload,
    event,
    includeRegion: transition.includeRegion,
    req,
  })

  // Key event facts for the summary table — same for every recipient.
  const details = await buildEventEmailDetails({ payload, event, req })

  let log = asNotificationLog(event.notificationLog)

  // Shared across recipients: the absolute date this event is (or was)
  // unpublished — every reminder shows the same date; how long it's gone
  // unverified (for the expired notice); and the event manager's contacts,
  // included in region-manager emails so they can follow up.
  const nextCheckAtIso = computeNextCheckAt(transition, now)
  const deadline = formatLongDate(unpublishDate(stage, now).toISOString())
  const verifiedAt = log.find((entry) => entry.kind === 'verification')?.at
  const sinceLastVerified = verifiedAt ? humanDurationSince(verifiedAt, now) : 'some time'
  // Public map link, but only while the event stays published: the in-memory
  // event still reads `published` during the unpublishing (expired) transition,
  // so suppress the link there — the page is about to disappear.
  const eventUrl = transition.unpublish ? null : (event.webUrl ?? null)
  const eventManagerCard =
    typeof event.manager === 'object' && event.manager
      ? buildManagerContacts(event.manager)
      : undefined

  let allDelivered = true

  for (const recipient of recipients) {
    if (hasReminderForStage(log, stage, recipient.manager.id)) continue

    const token = signVerifyToken(
      { eventId: event.id, managerId: recipient.manager.id },
      payload.secret,
      now,
    )
    const reminder: ReminderPayload = {
      eventTitle: typeof event.title === 'string' ? event.title : `Event #${event.id}`,
      level: transition.level!,
      audience: recipient.role,
      verifyUrl: buildVerifyEmailLink(token),
      eventUrl,
      details,
      eventManager: recipient.role === 'region' ? eventManagerCard : undefined,
      deadline,
      sinceLastVerified,
      regionName: recipient.regionName,
    }

    const delivered = await sendNotification({ client: payload, recipient, reminder })
    if (!delivered) {
      allDelivered = false
      continue
    }

    // Persist the log entry immediately — it's the exactly-once marker, so a
    // crash mid-fan-out resumes by sending only the still-missing recipients.
    log = [
      ...log,
      buildReminderEntry({
        stage,
        level: transition.level!,
        role: recipient.role,
        region: recipient.regionName,
        manager: {
          id: recipient.manager.id,
          name: recipient.manager.name || recipient.destination,
        },
        channel: recipient.channel,
        destination: recipient.destination,
        at: now.toISOString(),
      }),
    ]
    await payload.update({
      collection: 'events',
      id: event.id,
      data: { notificationLog: log },
      context: { skipVerifyHook: true },
      overrideAccess: true,
      req,
    })
    result.remindersSent++
  }

  // Advance only once every recipient is logged; otherwise leave the stage +
  // past nextCheckAt so the next run retries the un-logged recipients. This is
  // deliberately block-until-delivered: a stage that can't reach a recipient
  // won't age the event further. Managers are an auth collection (email always
  // present), so the only non-delivery is a transient transport outage, which
  // self-heals on the next daily run rather than silently skipping a reminder.
  if (allDelivered) {
    await payload.update({
      collection: 'events',
      id: event.id,
      data: {
        verificationStage: transition.nextStage,
        nextCheckAt: nextCheckAtIso,
        ...(transition.unpublish ? { _status: 'draft' } : {}),
      },
      context: { skipVerifyHook: true },
      overrideAccess: true,
      req,
    })
    result.advanced++
  }
}

/**
 * Daily verification sweep. Ages each event whose `nextCheckAt` has passed one
 * step along `verified → reminded → escalated → expired` (then trashes it), or
 * marks it `finished` when its schedule has run out — sending escalating
 * reminders and auto-unpublishing on expiry. Single-threaded on the `nightly`
 * queue so the read-advance is race-free.
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const ExpireEvents: TaskConfig<'expireEvents'> = {
  slug: 'expireEvents',
  label: 'Expire Events',
  retries: 1,
  outputSchema: [
    { name: 'processed', type: 'number', required: true },
    { name: 'finished', type: 'number', required: true },
    { name: 'advanced', type: 'number', required: true },
    { name: 'trashed', type: 'number', required: true },
    { name: 'remindersSent', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 2 * * *', // daily at 02:00 UTC
      queue: 'nightly',
    },
  ],
  handler: async ({ req }) => {
    const payload = req.payload
    const now = new Date()
    const nowIso = now.toISOString()
    const result: ExpireResult = {
      processed: 0,
      finished: 0,
      advanced: 0,
      trashed: 0,
      remindersSent: 0,
      failed: 0,
    }

    // Collect due ids up front (read-only → stable pagination; processing
    // mutates `nextCheckAt`, which would otherwise shift live pages).
    const dueIds: number[] = []
    let page = 1
    let hasNextPage = true
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'events',
        where: { nextCheckAt: { less_than_equal: nowIso } },
        depth: 0,
        limit: PAGINATION_LIMIT,
        page,
        overrideAccess: true,
        req,
      })
      dueIds.push(...batch.docs.map((doc) => doc.id))
      hasNextPage = batch.hasNextPage
      page++
    }

    req.payload.logger.info({ msg: 'ExpireEvents: starting', due: dueIds.length })

    for (const id of dueIds) {
      result.processed++
      try {
        const event = await payload.findByID({
          collection: 'events',
          id,
          depth: 1,
          overrideAccess: true,
          req,
        })
        await processEvent({ payload, req, event, now, result })
      } catch (error) {
        result.failed++
        req.payload.logger.warn({
          msg: 'ExpireEvents: per-event failure — continuing',
          eventId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // The run mutates many events (advance/unpublish/trash); refresh the Atlas
    // manager sidebars once at the end rather than per-event.
    revalidateAtlasSidebar()

    req.payload.logger.info({ msg: 'ExpireEvents complete', ...result })
    return { output: result }
  },
}
