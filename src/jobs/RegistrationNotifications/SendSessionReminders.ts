import type { ReminderWindow } from './reminderWindow'
import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { appendLogEntry, asLog, hasLogEntry, type LogEntry } from '@/fields'
import { runClock } from '@/lib/jobs/runClock'
import type { LocaleCode } from '@/lib/locales'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import { activeRegistrationWhere } from '@/lib/registrations/active'
import { buildRRuleTemporal } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import type { Event } from '@/payload-types'
import { capture } from '@/plugins/sentry/capture'
import type { EventSchedule } from '@/types/schedule'

import { reminderWindow, reminderWindowWhere, withinReminderWindow } from './reminderWindow'
import { sendSessionReminder } from './sendSessionReminder'

/** `type` slug for reminder entries in the registration's `activityLog`. */
export const REMINDER_LOG_EVENT = 'session-reminder'

/** Short, unambiguous date for the log's one-line summary. */
function formatOccurrenceLabel(occurrenceIso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(occurrenceIso))
}

const PAGINATION_LIMIT = 200

const CLIENT_BRAND_SELECT = {
  name: true,
  color1: true,
  color2: true,
  logo: true,
  supportEmail: true,
} as const

interface ReminderResult {
  /** Published, registration-taking events examined. */
  processedEvents: number
  /** Reminders delivered. */
  remindersSent: number
  /** Registrations skipped for a missing email address. */
  skipped: number
  /** Events whose processing threw. */
  failed: number
}

/**
 * Real occurrence starts (ISO) inside the window.
 *
 * Uses the same `buildRRuleTemporal` source as the ICS attachment, so recurrence
 * is never re-derived and the schedule's `exclusions` are applied automatically.
 * Recurring rules are bounded with `between`; a one-off (which has no
 * `recurrenceType`) uses `all()` — calling `all()` on an unbounded recurring
 * rule would never terminate, which is exactly why the branch keys on it.
 *
 * `between` is inclusive at both ends, so the bounds are re-applied by
 * `withinReminderWindow` — the same expression the registration query runs in
 * SQL (`reminderWindow.ts`).
 */
function upcomingOccurrences(schedule: Event['schedule'], window: ReminderWindow): string[] {
  const rule = buildRRuleTemporal((schedule ?? {}) as Partial<EventSchedule>)
  if (!rule) return []

  const raw = schedule?.recurrenceType ? rule.between(window.start, window.end, true) : rule.all()

  return raw
    .map((zdt) => new Date(Number(zdt.epochMilliseconds)).toISOString())
    .filter((iso) => withinReminderWindow(iso, window))
}

/**
 * The occurrences a registration should be reminded for. A registrant with
 * `startingAt` set attends a single session, so they're reminded only for the
 * occurrence matching it (and only if it's still a real, non-excluded upcoming
 * occurrence); otherwise they attend the whole series and are reminded for each.
 */
function occurrencesForRegistration(occurrences: string[], startingAt?: string | null): string[] {
  if (!startingAt) return occurrences
  const target = new Date(startingAt).getTime()
  return occurrences.filter((iso) => new Date(iso).getTime() === target)
}

/** Load a client's branding fields once per run, `depth: 1` so its logo resolves. */
async function loadClient(
  payload: Payload,
  req: PayloadRequest,
  clientId: number,
  cache: Map<number, EmailClient | null>,
): Promise<EmailClient | null> {
  const cached = cache.get(clientId)
  if (cached !== undefined) return cached
  let client: EmailClient | null = null
  try {
    client = (await payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 1,
      select: CLIENT_BRAND_SELECT,
      overrideAccess: true,
      req,
    })) as EmailClient
  } catch (error) {
    payload.logger.warn({
      msg: 'SendSessionReminders: could not load client branding; using default brand',
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  cache.set(clientId, client)
  return client
}

/** One registration with reminders due this run, resolved to bare ids. */
interface DueRegistration {
  submissionId: number
  /** The registrant's address, off the row's own column — no `users` join. */
  email: string | null
  name: string | null
  clientId: number | null
  locale: LocaleCode | null
  log: LogEntry[]
  /** Occurrences due (in window, matching startingAt, not already reminded). */
  due: string[]
}

/** Remind every subscribed registration for each upcoming occurrence of one event. */
async function remindForEvent(args: {
  payload: Payload
  req: PayloadRequest
  event: Event
  now: Date
  window: ReminderWindow
  clientCache: Map<number, EmailClient | null>
  result: ReminderResult
}): Promise<void> {
  const { payload, req, event, now, window, clientCache, result } = args

  const occurrences = upcomingOccurrences(event.schedule, window)
  if (occurrences.length === 0) return

  // Collect the registrations with a reminder due, as bare ids — reading at
  // depth 0 so users/clients aren't populated for registrations that send
  // nothing this run; the registrant users are batch-loaded once below.
  const pending: DueRegistration[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'user-submissions',
      // `activeRegistrationWhere` is what stops a spam-flagged row receiving
      // reminders, and it carries the `type: registration` predicate this query
      // needs anyway. Both new predicates are indexed; `remindersUnsubscribedAt`
      // never was, so this gains an index rather than losing one.
      where: {
        and: [
          { event: { equals: event.id } },
          { unsubscribedAt: { exists: false } },
          activeRegistrationWhere,
          // A whole-series row, or one whose session is in the window — else the
          // read grows with every past session the event has had.
          {
            or: [{ startingAt: { exists: false } }, reminderWindowWhere('startingAt', window)],
          },
        ],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      select: {
        client: true,
        startingAt: true,
        senderEmail: true,
        submissionData: true,
        activityLog: true,
      },
      overrideAccess: true,
      req,
    })

    for (const registration of batch.docs) {
      const log = asLog(registration.activityLog)
      const due = occurrencesForRegistration(occurrences, registration.startingAt).filter(
        (occurrence) => !hasLogEntry(log, REMINDER_LOG_EVENT, occurrence),
      )
      if (due.length === 0) continue
      pending.push({
        submissionId: registration.id,
        // ⚠ `senderEmail` is `virtual: 'user.email'` (#630), so this is the
        // Registrant's address through the join. Payload resolves a
        // relationship-path virtual in the query, so the `select` above needs
        // no `user` beside it — pinned by this job's own spec.
        email: registration.senderEmail?.trim() || null,
        name: readSubmissionValue(registration.submissionData, 'name') ?? null,
        clientId: relationId(registration.client),
        locale: (readSubmissionValue(registration.submissionData, 'locale') ??
          null) as LocaleCode | null,
        log,
        due,
      })
    }

    hasNextPage = batch.hasNextPage
    page++
  }
  if (pending.length === 0) return

  for (const item of pending) {
    const registrantEmail = item.email
    if (!registrantEmail) {
      // ⚠ Still a real case. `senderEmail` is deliberately optional — an
      // anonymous submission is allowed — so the guard moved from the join to
      // the column rather than going away. Logged, never silently dropped.
      result.skipped++
      payload.logger.warn({
        msg: 'SendSessionReminders: registration has no email; skipping',
        submissionId: item.submissionId,
        eventId: event.id,
      })
      continue
    }
    const registrantName = item.name?.trim() || registrantEmail
    const client = item.clientId ? await loadClient(payload, req, item.clientId, clientCache) : null

    let log = item.log
    for (const occurrence of item.due) {
      await sendSessionReminder({
        payload,
        event,
        client,
        registrantName,
        registrantEmail,
        locale: item.locale,
        submissionId: item.submissionId,
        occurrenceIso: occurrence,
        req,
      })

      // Persist the ledger entry immediately — it's the exactly-once marker, so
      // a crash mid-run resumes without re-sending what already went out.
      log = appendLogEntry(log, {
        at: now.toISOString(),
        type: REMINDER_LOG_EVENT,
        key: occurrence,
        cells: {
          activity: `Session reminder for ${formatOccurrenceLabel(occurrence)}`,
          sentTo: { label: 'email', text: registrantEmail },
        },
      })
      await payload.update({
        collection: 'user-submissions',
        id: item.submissionId,
        data: { activityLog: log },
        overrideAccess: true,
        req,
      })
      result.remindersSent++
    }
  }
}

/**
 * Session reminders — sent ~24h before each session a registrant is attending.
 *
 * CADENCE: hourly (`0 * * * *`), riding the existing hourly `nightly` autoRun.
 * Each run reminds for any un-reminded occurrence whose start falls in the next
 * 24h. Because runs are hourly, a reminder fires at the first hour boundary at
 * or after `occurrence − 24h`, so the notice always lands between 23h and 24h
 * before the session — a worst-case deviation from "exactly 24h before" of under
 * one hour. A missed run (server down) is caught by the next one as long as the
 * occurrence hasn't started; occurrences already past are never reminded.
 *
 * Exactly-once: a per-registration `activityLog` ledger keyed on occurrence
 * start, persisted immediately after each send. A task retry or an overlapping
 * run re-sends nothing, and exclusive concurrency keeps a single run at a time.
 *
 * Skips unsubscribed registrations (`remindersUnsubscribedAt` set), and
 * unpublished/trashed or non-registration events (filtered out of the sweep).
 *
 * Manual trigger: `pnpm payload jobs:run --queue nightly`
 */
export const SendSessionReminders: TaskConfig<'sendSessionReminders'> = {
  slug: 'sendSessionReminders',
  label: 'Send Session Reminders',
  retries: 1,
  concurrency: {
    key: () => 'sendSessionReminders',
    exclusive: true,
  },
  outputSchema: [
    { name: 'processedEvents', type: 'number', required: true },
    { name: 'remindersSent', type: 'number', required: true },
    { name: 'skipped', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 * * * *', // hourly — tight enough to honour "24h before" (< 1h deviation)
      queue: 'nightly',
    },
  ],
  handler: async ({ req }) => {
    const payload = req.payload
    const now = runClock(req)
    const window = reminderWindow(now)
    const result: ReminderResult = {
      processedEvents: 0,
      remindersSent: 0,
      skipped: 0,
      failed: 0,
    }
    const clientCache = new Map<number, EmailClient | null>()

    // Only published, non-trashed events that take native registrations can have
    // reminders. Reminder sends mutate registrations (not events), so event
    // pagination is stable and each page can be processed as it's read.
    let page = 1
    let hasNextPage = true
    while (hasNextPage) {
      const batch = await payload.find({
        collection: 'events',
        where: {
          and: [
            { _status: { equals: 'published' } },
            { deletedAt: { exists: false } },
            { registrationMode: { equals: 'sahaj-atlas' } },
          ],
        },
        depth: 0,
        limit: PAGINATION_LIMIT,
        page,
        overrideAccess: true,
        req,
      })

      for (const event of batch.docs as Event[]) {
        result.processedEvents++
        try {
          await remindForEvent({ payload, req, event, now, window, clientCache, result })
        } catch (error) {
          result.failed++
          capture({
            error,
            message: 'SendSessionReminders: per-event failure — continuing',
            extra: { eventId: event.id },
            level: 'warning',
            logger: payload.logger,
          })
        }
      }

      hasNextPage = batch.hasNextPage
      page++
    }

    payload.logger.info({ msg: 'SendSessionReminders complete', ...result })
    return { output: result }
  },
}
