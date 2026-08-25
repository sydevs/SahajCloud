import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import type { NotificationPreferencesValue } from '@/components/admin/NotificationPreferences/config'
import type { DigestEventGroup, DigestPeriod } from '@/emails/RegistrationDigestEmail'
import type { RegistrationRecipient } from '@/lib/notifications'
import { formatShortDate, resolveRegistrationRecipient } from '@/lib/notifications'
import type { RegistrationAnswer } from '@/lib/registrations/questions'
import { buildRegistrationAnswers } from '@/lib/registrations/questions'
import { relationId } from '@/lib/utilities/relationId'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Event, Manager } from '@/payload-types'

import { loadUsers } from './loadUsers'
import { sendRegistrationDigest } from './sendRegistrationDigest'

const PAGINATION_LIMIT = 200
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
/** Weekly digests fire on this UTC weekday (Sunday = 0 … Monday = 1). */
const WEEKLY_ANCHOR_WEEKDAY = 1

// The summary cadence strings, from the NotificationPreferences source of truth
// (`event_registration` frequency options). A manager whose resolved cadence is
// one of these gets a digest instead of per-registration emails.
const DAILY_SUMMARY = 'Daily Summary'
const WEEKLY_SUMMARY = 'Weekly Summary'

interface DigestResult {
  /** Managers whose cadence is due this run. */
  eligibleManagers: number
  /** Digest emails sent. */
  digestsSent: number
  /** Registrations included across all digests. */
  registrationsIncluded: number
  /** Managers whose processing threw. */
  failed: number
}

interface DigestRow {
  eventId: number
  userId: number
  startingAt?: string | null
  answers: RegistrationAnswer[]
}

function eventRegistrationFrequency(manager: Manager): string | undefined {
  const prefs = manager.notificationPreferences as NotificationPreferencesValue | null | undefined
  return prefs?.event_registration?.frequency
}

/** Advance a manager's digest watermark to the run start. */
async function advanceWatermark(
  payload: Payload,
  req: PayloadRequest,
  managerId: number,
  runStart: Date,
): Promise<void> {
  await payload.update({
    collection: 'managers',
    id: managerId,
    data: { lastRegistrationDigestSentAt: runStart.toISOString() },
    overrideAccess: true,
    req,
  })
}

/**
 * Events a manager runs whose registrations route to *their* digest: no
 * per-event override address (an override sends immediately, at Immediate/Never,
 * never a digest — so its registrations must not be counted here).
 */
async function loadManagerDigestEvents(
  payload: Payload,
  req: PayloadRequest,
  managerId: number,
): Promise<Event[]> {
  const events: Event[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'events',
      where: {
        and: [{ manager: { equals: managerId } }, { deletedAt: { exists: false } }],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      select: { title: true, registrationNotificationEmail: true },
      overrideAccess: true,
      req,
    })
    for (const event of batch.docs as Event[]) {
      if (event.registrationNotificationEmail?.trim()) continue
      events.push(event)
    }
    hasNextPage = batch.hasNextPage
    page++
  }
  return events
}

/** Batch-load the registrant users' name + email, chunked to bound the `in` list. */
/**
 * Build and send one manager's digest for the period, then advance their
 * watermark. Registrations are read at `depth: 0` (ids only) so populating each
 * one's event virtual fields — the #541 N+1 — is avoided; the registrant users
 * are batch-loaded once instead.
 */
async function digestForManager(args: {
  payload: Payload
  req: PayloadRequest
  manager: Manager
  period: DigestPeriod
  periodMs: number
  runStart: Date
  result: DigestResult
}): Promise<void> {
  const { payload, req, manager, period, periodMs, runStart, result } = args

  // The digest recipient is stable per manager — no per-event override routes to
  // a summary cadence — so resolve it once from an override-free event slice.
  const recipient: RegistrationRecipient | null = resolveRegistrationRecipient(
    { registrationNotificationEmail: null, registrationNotificationFrequency: null },
    manager,
  )
  if (!recipient) return

  const events = await loadManagerDigestEvents(payload, req, manager.id)
  if (events.length === 0) {
    await advanceWatermark(payload, req, manager.id, runStart)
    return
  }
  const eventById = new Map(events.map((event) => [event.id, event]))
  const eventIds = events.map((event) => event.id)

  const since = manager.lastRegistrationDigestSentAt
    ? new Date(manager.lastRegistrationDigestSentAt)
    : new Date(runStart.getTime() - periodMs)

  // New registrations in (since, runStart], collected as bare ids.
  const rows: DigestRow[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'registrations',
      where: {
        and: [
          { event: { in: eventIds } },
          { createdAt: { greater_than: since.toISOString() } },
          { createdAt: { less_than_equal: runStart.toISOString() } },
        ],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      select: { event: true, user: true, startingAt: true, questions: true },
      sort: 'createdAt',
      overrideAccess: true,
      req,
    })
    for (const registration of batch.docs) {
      const eventId = relationId(registration.event)
      const userId = relationId(registration.user)
      if (eventId == null || userId == null || !eventById.has(eventId)) continue
      rows.push({
        eventId,
        userId,
        startingAt: registration.startingAt ?? null,
        answers: buildRegistrationAnswers(
          registration.questions as Record<string, unknown> | null | undefined,
        ),
      })
    }
    hasNextPage = batch.hasNextPage
    page++
  }

  if (rows.length === 0) {
    // No new registrations this period — no empty digest, but advance the
    // watermark so the covered window stays bounded to one period.
    await advanceWatermark(payload, req, manager.id, runStart)
    return
  }

  const users = await loadUsers(payload, req, [...new Set(rows.map((row) => row.userId))])

  const rowsByEvent = new Map<number, DigestRow[]>()
  for (const row of rows) {
    const list = rowsByEvent.get(row.eventId) ?? []
    list.push(row)
    rowsByEvent.set(row.eventId, list)
  }

  // One group per event (in the manager's event order), each with its registrations.
  const groups: DigestEventGroup[] = []
  for (const event of events) {
    const eventRows = rowsByEvent.get(event.id)
    if (!eventRows || eventRows.length === 0) continue
    groups.push({
      eventTitle: typeof event.title === 'string' ? event.title : `Event #${event.id}`,
      eventAdminUrl: `${getServerUrl()}/admin/collections/events/${event.id}`,
      registrations: eventRows.map((row) => {
        const user = users.get(row.userId)
        const email = user?.email ?? ''
        return {
          registrantName: user?.name?.trim() || email || 'A registrant',
          registrantEmail: email,
          startDate: row.startingAt ? formatShortDate(row.startingAt) || null : null,
          answers: row.answers,
        }
      }),
    })
  }

  // Send first, then advance the watermark: a send failure throws (caught per
  // manager), leaving the watermark so the whole period retries next run.
  await sendRegistrationDigest({ payload, recipient, period, groups })
  await advanceWatermark(payload, req, manager.id, runStart)

  result.digestsSent++
  result.registrationsIncluded += rows.length
}

/**
 * Registration digests — one batched email per manager per period, listing the
 * new registrations for the events they run, grouped by event.
 *
 * CADENCE: daily at 07:00 UTC (`0 7 * * *`), riding the hourly `nightly` autoRun.
 * Every run sends to managers whose `event_registration` cadence is
 * `Daily Summary`; on the weekly anchor — **Monday** 07:00 UTC — it also sends to
 * `Weekly Summary` managers. Both anchors are deterministic (a fixed UTC hour and
 * weekday), never "7 days since this recipient last got one".
 *
 * Exactly-once: a per-manager `lastRegistrationDigestSentAt` watermark. A run
 * covers registrations created in `(watermark ?? runStart − period, runStart]`
 * and advances the watermark to `runStart`, so no registration lands in two
 * digests and a task retry re-sends nothing. A period with no new registrations
 * sends nothing (no empty digests) but still advances, keeping the window bounded.
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const SendRegistrationDigests: TaskConfig<'sendRegistrationDigests'> = {
  slug: 'sendRegistrationDigests',
  label: 'Send Registration Digests',
  retries: 1,
  concurrency: {
    key: () => 'sendRegistrationDigests',
    exclusive: true,
  },
  outputSchema: [
    { name: 'eligibleManagers', type: 'number', required: true },
    { name: 'digestsSent', type: 'number', required: true },
    { name: 'registrationsIncluded', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 7 * * *', // daily 07:00 UTC; the Monday run also does weekly digests
      queue: 'nightly',
    },
  ],
  handler: async ({ req }) => {
    const payload = req.payload
    // `req.context.now` overrides the clock for deterministic tests.
    const contextNow = (req.context as { now?: unknown } | undefined)?.now
    const runStart = contextNow instanceof Date ? contextNow : new Date()
    const isWeeklyAnchor = runStart.getUTCDay() === WEEKLY_ANCHOR_WEEKDAY
    const result: DigestResult = {
      eligibleManagers: 0,
      digestsSent: 0,
      registrationsIncluded: 0,
      failed: 0,
    }

    // Managers are staff (a bounded set), so scan them and filter by cadence in
    // memory rather than querying inside the notificationPreferences JSON.
    let page = 1
    let hasNextPage = true
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'managers',
        depth: 0,
        limit: PAGINATION_LIMIT,
        page,
        overrideAccess: true,
        req,
      })

      for (const manager of batch.docs as Manager[]) {
        const frequency = eventRegistrationFrequency(manager)
        let period: DigestPeriod | null = null
        let periodMs = 0
        if (frequency === DAILY_SUMMARY) {
          period = 'day'
          periodMs = DAY_MS
        } else if (frequency === WEEKLY_SUMMARY && isWeeklyAnchor) {
          period = 'week'
          periodMs = WEEK_MS
        }
        if (!period) continue

        result.eligibleManagers++
        try {
          await digestForManager({ payload, req, manager, period, periodMs, runStart, result })
        } catch (error) {
          result.failed++
          Sentry.withScope((scope) => {
            scope.setContext('sendRegistrationDigests', { managerId: manager.id })
            Sentry.captureException(error)
          })
          payload.logger.warn({
            msg: 'SendRegistrationDigests: per-manager failure — continuing',
            managerId: manager.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      hasNextPage = batch.hasNextPage
      page++
    }

    payload.logger.info({ msg: 'SendRegistrationDigests complete', ...result })
    return { output: result }
  },
}
