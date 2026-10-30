import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { refusalHour } from '@/collections/RegistrationRefusals/RegistrationRefusals'
import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { NEVER_FREQUENCY } from '@/components/admin/NotificationPreferences/config'
import type { RefusedEventGroup, RefusedSignup } from '@/emails/RefusedRegistrationDigestEmail'
import type { DigestPeriod } from '@/emails/RegistrationDigestEmail'
import { VERDICT_NOTES } from '@/jobs/ScreenSubmissions/verdicts'
import type { AntiSpamCode } from '@/lib/antiSpam/antiSpamGuard'
import { pickChannel } from '@/lib/notifications'
import { adminDocUrl, adminUrl } from '@/lib/utilities/adminUrl'
import { relationId } from '@/lib/utilities/relationId'
import type { Manager, RegistrationRefusal } from '@/payload-types'

import { digestRunStart, dueDigestPeriod } from './digestCadence'
import { sendRefusedRegistrationDigest } from './sendRefusedRegistrationDigest'

const PREFERENCE_KEY = 'refused_registrations'
const PAGINATION_LIMIT = 200
/**
 * Screening refusals listed per class. The rest are counted: a flood that
 * passed the captcha would otherwise make one email of thousands of cards, and
 * the admin list holds every one.
 */
const MAX_LISTED_PER_EVENT = 25
/**
 * Classes given a section, most-refused first. Only a published class taking
 * registrations is counted at the form, so this bounds what a flood across
 * every class could make of one email; the rest are named as a number.
 */
const MAX_LISTED_EVENTS = 50

/**
 * What a refusal at the form means, said for an admin. Keyed `AntiSpamCode`, so
 * a code added to the write guard is a compile error here rather than a raw
 * `content_unscannable` in an inbox. Each is a noun phrase: the email prints it
 * after a count.
 */
const REQUEST_REASON_LABELS: Record<AntiSpamCode, string> = {
  captcha_failed: 'The captcha check failed',
  captcha_unavailable:
    'The captcha could not be checked — our own configuration, or Cloudflare unreachable',
  invalid_email: 'The email address was not a usable address',
  disposable_email: 'A disposable email address',
  urls_not_allowed: 'A link in one of the answers',
  content_unscannable: 'An answer too large to check',
}

/**
 * The stage picks the vocabulary, never the code: `invalid_email` and
 * `disposable_email` are a name each stage spells for its own check. A
 * screening refusal reads `VERDICT_NOTES`, the wording its own submission is
 * annotated with, so the two cannot drift. An unlisted code — the column is
 * free text, so that a code added upstream is never a lost refusal — is shown
 * as itself.
 */
const reasonLabel = (stage: RegistrationRefusal['stage'], code: string): string => {
  const labels: Record<string, string | null> =
    stage === 'request' ? REQUEST_REASON_LABELS : VERDICT_NOTES
  return labels[code] ?? code
}

type RefusalRow = Pick<
  RegistrationRefusal,
  'id' | 'event' | 'stage' | 'reason' | 'count' | 'submission'
>

interface DigestResult {
  eligibleAdmins: number
  digestsSent: number
  refusalsIncluded: number
  failed: number
}

/**
 * The cadence an admin chose. No fallback, as for every other type: what the
 * preferences table shows is what is sent. The migration that added the type
 * wrote its default into every existing manager's preferences.
 */
function refusedRegistrationsFrequency(manager: Manager): string | undefined {
  return manager.notificationPreferences?.[PREFERENCE_KEY]?.frequency
}

async function advanceWatermark(
  payload: Payload,
  req: PayloadRequest,
  managerId: number,
  runStart: Date,
): Promise<void> {
  await payload.update({
    collection: 'managers',
    id: managerId,
    data: { lastRefusedRegistrationDigestSentAt: runStart.toISOString() },
    overrideAccess: true,
    req,
  })
}

/**
 * One window's refusals. A refusal at the form is an hourly count, read by the
 * hours that ended inside the window — `[hour(since), hour(until))` — so an hour
 * still being counted waits for the next digest rather than being split. A
 * screening refusal is one row, read by when it was refused.
 */
async function loadRefusals(
  payload: Payload,
  req: PayloadRequest,
  since: Date,
  until: Date,
): Promise<RefusalRow[]> {
  const rows: RefusalRow[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'registration-refusals',
      where: {
        or: [
          {
            and: [
              { stage: { equals: 'request' } },
              { hour: { greater_than_equal: refusalHour(since).toISOString() } },
              { hour: { less_than: refusalHour(until).toISOString() } },
            ],
          },
          {
            and: [
              { stage: { equals: 'screening' } },
              { createdAt: { greater_than: since.toISOString() } },
              { createdAt: { less_than_equal: until.toISOString() } },
            ],
          },
        ],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      select: { event: true, stage: true, reason: true, count: true, submission: true },
      sort: 'createdAt',
      overrideAccess: true,
      req,
    })
    rows.push(...(batch.docs as RefusalRow[]))
    hasNextPage = batch.hasNextPage
    page++
  }
  return rows
}

/** Class titles by id, trashed classes included — a refusal outlives a deletion. */
async function loadEventTitles(
  payload: Payload,
  req: PayloadRequest,
  ids: number[],
): Promise<Map<number, string>> {
  const titles = new Map<number, string>()
  for (let i = 0; i < ids.length; i += PAGINATION_LIMIT) {
    const chunk = ids.slice(i, i + PAGINATION_LIMIT)
    const { docs } = await payload.find({
      collection: 'events',
      where: { id: { in: chunk } },
      depth: 0,
      limit: chunk.length,
      select: { title: true },
      trash: true,
      overrideAccess: true,
      req,
    })
    for (const event of docs) {
      titles.set(event.id, typeof event.title === 'string' ? event.title : `Class #${event.id}`)
    }
  }
  return titles
}

/** The refused registrations' own name and address, read off their rows. */
async function loadSignups(
  payload: Payload,
  req: PayloadRequest,
  ids: number[],
): Promise<Map<number, { name: string; email: string }>> {
  const signups = new Map<number, { name: string; email: string }>()
  for (let i = 0; i < ids.length; i += PAGINATION_LIMIT) {
    const chunk = ids.slice(i, i + PAGINATION_LIMIT)
    const { docs } = await payload.find({
      collection: 'user-submissions',
      where: { id: { in: chunk } },
      depth: 0,
      limit: chunk.length,
      select: { senderEmail: true, submissionData: true },
      overrideAccess: true,
      req,
    })
    for (const submission of docs) {
      const email = submission.senderEmail?.trim() ?? ''
      const name = readSubmissionValue(submission.submissionData, 'name')?.trim()
      signups.set(submission.id, { name: name || email || 'A visitor', email })
    }
  }
  return signups
}

/** How many sign-ups one row stands for: an hour's count at the form, one at screening. */
const refusalsIn = (row: RefusalRow): number => (row.stage === 'request' ? row.count || 1 : 1)

/**
 * Group one window's refusals by class: the form's refusals as a count per
 * reason, screening's as one card per sign-up. The most-refused class leads,
 * and only the first `MAX_LISTED_EVENTS` get a section.
 */
async function buildGroups(
  payload: Payload,
  req: PayloadRequest,
  allRows: RefusalRow[],
): Promise<{ groups: RefusedEventGroup[]; moreClasses: number }> {
  const totals = new Map<number | null, number>()
  for (const row of allRows) {
    const eventId = relationId(row.event)
    totals.set(eventId, (totals.get(eventId) ?? 0) + refusalsIn(row))
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([eventId]) => eventId)
  const listed = new Set(ranked.slice(0, MAX_LISTED_EVENTS))
  const moreClasses = ranked.length - listed.size
  const rows = allRows.filter((row) => listed.has(relationId(row.event)))

  const eventIds = [...new Set(rows.map((row) => relationId(row.event)).filter((id) => id != null))]
  const submissionIds = [
    ...new Set(
      rows
        .filter((row) => row.stage === 'screening')
        .map((row) => relationId(row.submission))
        .filter((id) => id != null),
    ),
  ]
  // In turn, not together: both forward `req`, and a job's request may hold
  // one transaction's connection, which runs one query at a time.
  const titles = await loadEventTitles(payload, req, eventIds)
  const signups = await loadSignups(payload, req, submissionIds)

  interface Draft {
    group: RefusedEventGroup
    counts: Map<string, number>
  }
  const drafts = new Map<number | null, Draft>(
    ranked
      .filter((eventId) => listed.has(eventId))
      .map((eventId) => {
        const title = eventId == null ? undefined : titles.get(eventId)
        const draft: Draft = {
          group: {
            eventTitle: title ?? 'A class that has since been deleted',
            eventAdminUrl: title != null && eventId != null ? adminDocUrl('events', eventId) : null,
            atRequest: [],
            atScreening: [],
            moreAtScreening: 0,
          },
          counts: new Map(),
        }
        return [eventId, draft]
      }),
  )

  for (const row of rows) {
    const draft = drafts.get(relationId(row.event))!

    if (row.stage === 'request') {
      const label = reasonLabel(row.stage, row.reason)
      draft.counts.set(label, (draft.counts.get(label) ?? 0) + refusalsIn(row))
      continue
    }

    if (draft.group.atScreening.length >= MAX_LISTED_PER_EVENT) {
      draft.group.moreAtScreening++
      continue
    }
    const submissionId = relationId(row.submission)
    const signup = submissionId == null ? undefined : signups.get(submissionId)
    const card: RefusedSignup = {
      // A manager may have deleted the row since; the refusal still counts.
      name: signup?.name ?? 'A sign-up that has since been deleted',
      email: signup?.email ?? '',
      reason: reasonLabel(row.stage, row.reason),
      submissionAdminUrl:
        signup && submissionId != null ? adminDocUrl('user-submissions', submissionId) : null,
    }
    draft.group.atScreening.push(card)
  }

  const groups = [...drafts.values()].map(({ group, counts }) => ({
    ...group,
    atRequest: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count })),
  }))
  return { groups, moreClasses }
}

async function digestForAdmin(args: {
  payload: Payload
  req: PayloadRequest
  manager: Manager
  period: DigestPeriod
  periodMs: number
  runStart: Date
  windows: Map<string, Promise<RefusalRow[]>>
  result: DigestResult
}): Promise<void> {
  const { payload, req, manager, period, periodMs, runStart, windows, result } = args

  const { channel, destination } = pickChannel(manager, PREFERENCE_KEY)
  if (!destination) return

  const since = manager.lastRefusedRegistrationDigestSentAt
    ? new Date(manager.lastRefusedRegistrationDigestSentAt)
    : new Date(runStart.getTime() - periodMs)

  // Admins on one cadence share a watermark, so one read serves them all.
  const key = since.toISOString()
  let rowsLoad = windows.get(key)
  if (!rowsLoad) {
    rowsLoad = loadRefusals(payload, req, since, runStart)
    windows.set(key, rowsLoad)
  }
  const rows = await rowsLoad

  if (rows.length === 0) {
    await advanceWatermark(payload, req, manager.id, runStart)
    return
  }

  const total = rows.reduce((sum, row) => sum + refusalsIn(row), 0)
  const { groups, moreClasses } = await buildGroups(payload, req, rows)
  await sendRefusedRegistrationDigest({
    payload,
    channel,
    destination,
    props: {
      recipientName: manager.name || manager.email || null,
      period,
      groups,
      moreClasses,
      total,
      listUrl: adminUrl('/collections/registration-refusals'),
    },
  })
  await advanceWatermark(payload, req, manager.id, runStart)

  result.digestsSent++
  result.refusalsIncluded += total
}

/**
 * Refused sign-ups digests — one email per admin per period, naming every class
 * sign-up the spam check refused (sydevs/SahajAtlasWeb#259).
 *
 * The recipients are the managers with `type: 'admin'`: a refusal can land on
 * any class, and only an admin can act on all of them. Each sets the cadence on
 * their `refused_registrations` preference, which runs exactly as the
 * registration digest's does — daily at 07:00 UTC, weekly on the Monday run,
 * `Never` for none.
 *
 * Exactly-once by the same per-manager watermark as `SendRegistrationDigests`,
 * on `lastRefusedRegistrationDigestSentAt`: a run covers the window from the
 * watermark (or one period back) to its own start, and advances it. A period
 * with none sends nothing and still advances. An admin at `Never` is advanced
 * too, so turning the digest back on starts from that day rather than
 * delivering months of refusals as one day's.
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const SendRefusedRegistrationDigests: TaskConfig<'sendRefusedRegistrationDigests'> = {
  slug: 'sendRefusedRegistrationDigests',
  label: 'Send Refused Sign-up Digests',
  retries: 1,
  concurrency: {
    key: () => 'sendRefusedRegistrationDigests',
    exclusive: true,
  },
  outputSchema: [
    { name: 'eligibleAdmins', type: 'number', required: true },
    { name: 'digestsSent', type: 'number', required: true },
    { name: 'refusalsIncluded', type: 'number', required: true },
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
    const runStart = digestRunStart(req)
    const result: DigestResult = {
      eligibleAdmins: 0,
      digestsSent: 0,
      refusalsIncluded: 0,
      failed: 0,
    }
    const windows = new Map<string, Promise<RefusalRow[]>>()

    let page = 1
    let hasNextPage = true
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'managers',
        where: { type: { equals: 'admin' } },
        depth: 0,
        limit: PAGINATION_LIMIT,
        page,
        overrideAccess: true,
        req,
      })

      for (const manager of batch.docs as Manager[]) {
        const frequency = refusedRegistrationsFrequency(manager)
        const due = dueDigestPeriod(frequency, runStart)
        if (!due) {
          if (frequency === NEVER_FREQUENCY) {
            await advanceWatermark(payload, req, manager.id, runStart).catch((error: unknown) =>
              payload.logger.warn({
                msg: 'SendRefusedRegistrationDigests: could not advance a muted admin',
                managerId: manager.id,
                error: error instanceof Error ? error.message : String(error),
              }),
            )
          }
          continue
        }

        result.eligibleAdmins++
        try {
          await digestForAdmin({ payload, req, manager, ...due, runStart, windows, result })
        } catch (error) {
          result.failed++
          Sentry.withScope((scope) => {
            scope.setContext('sendRefusedRegistrationDigests', { managerId: manager.id })
            Sentry.captureException(error)
          })
          payload.logger.warn({
            msg: 'SendRefusedRegistrationDigests: per-admin failure — continuing',
            managerId: manager.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      hasNextPage = batch.hasNextPage
      page++
    }

    payload.logger.info({ msg: 'SendRefusedRegistrationDigests complete', ...result })
    return { output: result }
  },
}
