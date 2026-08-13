import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import {
  asNotificationLog,
  buildReminderEntry,
  hasReminderForStage,
} from '@/lib/eventVerification/log'
import { addDays } from '@/lib/eventVerification/periods'
import { signVerifyToken } from '@/lib/eventVerification/token'
import { buildVerifyEmailLink } from '@/lib/eventVerification/verifyUrl'
import { resolveNextCheckAt } from '@/lib/eventVerification/watermark'
import {
  buildEventEmailDetails,
  buildEventListingProgress,
  buildManagerContacts,
  formatLongDate,
  humanDurationSince,
  resolveRecipients,
  sendNotification,
  type ReminderPayload,
} from '@/lib/notifications'
import { shouldFinish } from '@/lib/schedule/scheduleStatus'
import type { Event } from '@/payload-types'

import { stageAction, unpublishDate } from './stageMachine'

const PAGINATION_LIMIT = 200

interface ExpireResult {
  /** Due events examined. */
  processed: number
  /** Marked `finished` (schedule ended, non-inactive). */
  finished: number
  /** Advanced one reminder stage. */
  advanced: number
  /** Soft-deleted — the `expired` grace terminal or the `finished` retention window. */
  trashed: number
  /** Individual reminders delivered. */
  remindersSent: number
  /** Events whose processing threw. */
  failed: number
}

/**
 * Mark a due event `finished` (terminal, no email). Atlas's `should_finish?` —
 * its schedule ran out and it isn't inactive.
 *
 * Deliberately leaves `_status` alone (#603): a finished event stays
 * **published** so its Atlas page keeps resolving for a late seeker following an
 * old link (and `webPath` / `webUrl` are publish-gated, so unpublishing is
 * exactly what would break those links). It drops out of the public *feeds*
 * instead, via `notFinishedWhere`. Only the unverified ladder unpublishes.
 *
 * The watermark moves to the retention deadline rather than null: `finished` is
 * a dwell state, not the end of the line — the event is trashed once its
 * retention window elapses (see the `finished` rule in the stage machine).
 */
async function finishEvent(payload: Payload, req: PayloadRequest, event: Event): Promise<void> {
  await payload.update({
    collection: 'events',
    id: event.id,
    data: {
      verificationStage: 'finished',
      nextCheckAt: resolveNextCheckAt({
        stage: 'finished',
        schedule: event.schedule,
        inactive: event.inactive,
      }),
    },
    context: { skipVerifyHook: true },
    overrideAccess: true,
    req,
  })
}

/** Soft-delete an event: trashing is setting `deletedAt` (`payload.delete` is a hard delete). */
async function trashEvent(
  payload: Payload,
  req: PayloadRequest,
  event: Event,
  now: Date,
): Promise<void> {
  await payload.update({
    collection: 'events',
    id: event.id,
    data: { deletedAt: now.toISOString() },
    context: { skipVerifyHook: true },
    overrideAccess: true,
    req,
  })
}

/**
 * Process one due event: the finished-check first, then the action the stage
 * machine assigns to its stage.
 *
 * For a reminder stage, sends only to recipients not already logged for that
 * stage this cycle, persisting each successful send immediately (so a crash
 * resumes without duplicating), and advances the stage only once every
 * recipient is logged. A partial fan-out leaves the stage + (past)
 * `nextCheckAt` untouched so the next run retries the missing recipients.
 */
async function processEvent(args: {
  payload: Payload
  req: PayloadRequest
  event: Event
  now: Date
  result: ExpireResult
}): Promise<void> {
  const { payload, req, event, now, result } = args
  const stage = event.verificationStage

  // Finished-check first — it supersedes every other action. Finishing is a
  // transition *into* `finished`, so it can't apply to an event already there —
  // and mustn't: such an event is due precisely because its retention window
  // elapsed, so re-finishing it would push that window out another 6 months,
  // every night, and it would never be trashed at all.
  if (stage !== 'finished' && shouldFinish(event, now)) {
    await finishEvent(payload, req, event)
    result.finished++
    return
  }

  const action = stageAction(stage)

  // Terminal: the expired grace period elapsed, or a finished event outlived
  // its retention window. No email either way. The doc is then excluded from
  // default queries but recoverable from the admin trash.
  if (action.kind === 'trash') {
    await trashEvent(payload, req, event, now)
    result.trashed++
    return
  }

  // Pre-adoption drift guard: nothing to do but re-arm the watermark from the
  // schedule, so a due event can't be re-examined every night forever.
  // Unreachable in practice — a due pre-adoption event has a run-out schedule,
  // which the finish-check above already claimed.
  if (action.kind === 'await-schedule') {
    await payload.update({
      collection: 'events',
      id: event.id,
      data: {
        nextCheckAt: resolveNextCheckAt({
          stage,
          schedule: event.schedule,
          inactive: event.inactive,
        }),
      },
      context: { skipVerifyHook: true },
      overrideAccess: true,
      req,
    })
    return
  }

  // Reminder stage. Dedup key = the current (from) stage.
  const recipients = await resolveRecipients({
    payload,
    event,
    includeRegion: action.includeRegion,
    req,
  })

  // Key event facts for the summary table — same for every recipient.
  const details = await buildEventEmailDetails({ payload, event, req })

  // How complete the listing is (#611), computed fresh from the event we
  // already loaded rather than read off the stored `qualityOpenCount` — a count
  // can neither name what to fix nor say what's already done. Also same for
  // every recipient, so it's built once here rather than per send; the reminder
  // ladder itself is untouched, so adding this can't perturb the per-stage
  // dedup below. `null` when the listing wasn't checked at all.
  const listingProgress = (await buildEventListingProgress({ event, req, now })) ?? undefined

  let log = asNotificationLog(event.notificationLog)

  // Shared across recipients: the absolute date this event is (or was)
  // unpublished — every reminder shows the same date; how long it's gone
  // unverified (for the expired notice); and the event manager's contacts,
  // included in region-manager emails so they can follow up.
  //
  // The watermark is the next stage's own deadline capped by the schedule's
  // end, so an event that runs out mid-cycle is finished the day after its
  // last occurrence rather than waiting for the next reminder.
  const nextCheckAtIso = resolveNextCheckAt({
    stage: action.nextStage,
    stageDeadline: addDays(now, action.offsetDays),
    schedule: event.schedule,
    inactive: event.inactive,
  })
  const deadline = formatLongDate(unpublishDate(stage, now).toISOString())
  const verifiedAt = log.find((entry) => entry.kind === 'verification')?.at
  const sinceLastVerified = verifiedAt ? humanDurationSince(verifiedAt, now) : 'some time'
  // Public map link, but only while the event stays published: the in-memory
  // event still reads `published` during the unpublishing (expired) transition,
  // so suppress the link there — the page is about to disappear.
  const eventUrl = action.unpublish ? null : (event.webUrl ?? null)
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
      level: action.level,
      audience: recipient.role,
      verifyUrl: buildVerifyEmailLink(token),
      eventUrl,
      details,
      listingProgress,
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
        level: action.level,
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
        verificationStage: action.nextStage,
        nextCheckAt: nextCheckAtIso,
        ...(action.unpublish ? { _status: 'draft' } : {}),
      },
      context: { skipVerifyHook: true },
      overrideAccess: true,
      req,
    })
    result.advanced++
  }
}

/**
 * Collect the ids matching `where` up front (read-only → stable pagination;
 * processing mutates the rows, which would otherwise shift live pages).
 */
async function collectIds(
  payload: Payload,
  req: PayloadRequest,
  where: Parameters<Payload['find']>[0]['where'],
): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'events',
      where,
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      overrideAccess: true,
      req,
    })
    ids.push(...batch.docs.map((doc) => doc.id))
    hasNextPage = batch.hasNextPage
    page++
  }
  return ids
}

/**
 * Daily verification sweep. Every lifecycle transition an event can make is
 * driven by one query — `nextCheckAt <= now` — and decided by the stage machine
 * (`./stageMachine`): ages a managed event one step along
 * `verified → reminded → escalated → urgent → expired` (then trashes it), marks
 * any event `finished` when its schedule has run out, and trashes a finished
 * event once its retention window elapses. Single-threaded on the `nightly`
 * queue so the read-advance is race-free.
 *
 * **Why one query.** `nextCheckAt` is a watermark: every event that isn't
 * actionable is future-dated or null, so the index range in the past holds only
 * work that is genuinely due, however large the table grows. Expressing a
 * transition any other way — e.g. sweeping `schedule.lastDate < now` for
 * run-out pre-adoption events — means scanning every event that ever ended, on
 * every run, forever. `resolveNextCheckAt` is where each stage's watermark is
 * defined, and it is the reason the pre-adoption stages need no sweep of their
 * own.
 *
 * Only the **unverified** ladder unpublishes. Finishing leaves the event
 * published and simply drops it from the public feeds (#603), so this sweep no
 * longer decides whether a finished event is publicly visible — it only records
 * the stage. The feeds filter on `schedule.lastDate` on every read, which is why
 * they don't lag behind this job the way the stage does.
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const ExpireEvents: TaskConfig<'expireEvents'> = {
  slug: 'expireEvents',
  label: 'Expire Events',
  retries: 1,
  concurrency: {
    key: () => 'expireEvents',
    exclusive: true,
  },
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

    const dueIds = await collectIds(payload, req, { nextCheckAt: { less_than_equal: nowIso } })

    req.payload.logger.info({ msg: 'ExpireEvents: starting', due: dueIds.length })

    for (const id of dueIds) {
      result.processed++
      try {
        const event = await payload.findByID({
          collection: 'events',
          id,
          depth: 1,
          // Exclude-mode select (any `false` switches the whole select to
          // exclude — `getSelectMode`), so every other field still loads. The
          // virtual `qualityReport` is the one field this job never reads, and
          // an unselected field returns before its `afterRead` runs
          // (`stripUnselectedFields`), so the report isn't built here at all.
          // It's built once, explicitly, by `buildEventListingProgress` below.
          select: { qualityReport: false },
          overrideAccess: true,
          req,
        })
        await processEvent({ payload, req, event, now, result })
      } catch (error) {
        result.failed++
        Sentry.withScope((scope) => {
          scope.setContext('expireEvents', { eventId: id })
          Sentry.captureException(error)
        })
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
