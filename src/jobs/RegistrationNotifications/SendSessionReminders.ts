import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import type { LocaleCode } from '@/lib/locales'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendSessionReminder } from '@/lib/notifications/sendSessionReminder'
import type { ScheduleSubFields } from '@/lib/schedule/scheduleHooks'
import { buildRRuleTemporal } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import { DAY_MS } from '@/lib/utilities/time'
import type { Event } from '@/payload-types'

import { loadUsers } from './loadUsers'
import { asReminderLog, hasReminderFor, type ReminderLogEntry } from './reminderLedger'

const PAGINATION_LIMIT = 200
/** 24 hours — how far ahead a run reminds. */
const REMINDER_WINDOW_MS = DAY_MS

const CLIENT_BRAND_SELECT = {
  name: true,
  color1: true,
  color2: true,
  logo: true,
  websiteUrl: true,
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
 * Real occurrence starts (ISO) strictly within `(windowStart, windowEnd]`.
 *
 * Uses the same `buildRRuleTemporal` source as the ICS attachment, so recurrence
 * is never re-derived and the schedule's `exclusions` are applied automatically.
 * Recurring rules are bounded with `between`; a one-off (which has no
 * `recurrenceType`) uses `all()` — calling `all()` on an unbounded recurring
 * rule would never terminate, which is exactly why the branch keys on it.
 */
function upcomingOccurrences(
  schedule: Event['schedule'],
  windowStart: Date,
  windowEnd: Date,
): string[] {
  const rule = buildRRuleTemporal((schedule ?? {}) as Partial<ScheduleSubFields>)
  if (!rule) return []

  const raw = schedule?.recurrenceType ? rule.between(windowStart, windowEnd, true) : rule.all()

  return raw
    .map((zdt) => new Date(Number(zdt.epochMilliseconds)).toISOString())
    .filter((iso) => {
      const ms = new Date(iso).getTime()
      return ms > windowStart.getTime() && ms <= windowEnd.getTime()
    })
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
  registrationId: number
  userId: number | null
  clientId: number | null
  locale: LocaleCode | null
  log: ReminderLogEntry[]
  /** Occurrences due (in window, matching startingAt, not already reminded). */
  due: string[]
}

/** Remind every subscribed registration for each upcoming occurrence of one event. */
async function remindForEvent(args: {
  payload: Payload
  req: PayloadRequest
  event: Event
  now: Date
  windowEnd: Date
  clientCache: Map<number, EmailClient | null>
  result: ReminderResult
}): Promise<void> {
  const { payload, req, event, now, windowEnd, clientCache, result } = args

  const occurrences = upcomingOccurrences(event.schedule, now, windowEnd)
  if (occurrences.length === 0) return

  // Collect the registrations with a reminder due, as bare ids — reading at
  // depth 0 so users/clients aren't populated for registrations that send
  // nothing this run; the registrant users are batch-loaded once below.
  const pending: DueRegistration[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'registrations',
      where: {
        and: [{ event: { equals: event.id } }, { remindersUnsubscribedAt: { exists: false } }],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      select: { user: true, client: true, startingAt: true, locale: true, reminderLog: true },
      overrideAccess: true,
      req,
    })

    for (const registration of batch.docs) {
      const log = asReminderLog(registration.reminderLog)
      const due = occurrencesForRegistration(occurrences, registration.startingAt).filter(
        (occurrence) => !hasReminderFor(log, occurrence),
      )
      if (due.length === 0) continue
      pending.push({
        registrationId: registration.id,
        userId: relationId(registration.user),
        clientId: relationId(registration.client),
        locale: (registration.locale as LocaleCode | null) ?? null,
        log,
        due,
      })
    }

    hasNextPage = batch.hasNextPage
    page++
  }
  if (pending.length === 0) return

  const userIds = pending.map((item) => item.userId).filter((id): id is number => id != null)
  const users = await loadUsers(payload, req, [...new Set(userIds)])

  for (const item of pending) {
    const user = item.userId != null ? users.get(item.userId) : undefined
    const registrantEmail = user?.email
    if (!registrantEmail) {
      // A registration always has a user; a missing email is bad data, not a
      // normal skip — log it so it's visible rather than silently dropped.
      result.skipped++
      payload.logger.warn({
        msg: 'SendSessionReminders: registration has no email; skipping',
        registrationId: item.registrationId,
        eventId: event.id,
      })
      continue
    }
    const registrantName = user.name?.trim() || registrantEmail
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
        registrationId: item.registrationId,
        occurrenceIso: occurrence,
        req,
      })

      // Persist the ledger entry immediately — it's the exactly-once marker, so
      // a crash mid-run resumes without re-sending what already went out.
      log = [...log, { occurrence, sentAt: now.toISOString() }]
      await payload.update({
        collection: 'registrations',
        id: item.registrationId,
        data: { reminderLog: log },
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
 * Exactly-once: a per-registration `reminderLog` ledger keyed on occurrence
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
    // `req.context.now` overrides the clock for deterministic tests.
    const contextNow = (req.context as { now?: unknown } | undefined)?.now
    const now = contextNow instanceof Date ? contextNow : new Date()
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS)
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
          await remindForEvent({ payload, req, event, now, windowEnd, clientCache, result })
        } catch (error) {
          result.failed++
          Sentry.withScope((scope) => {
            scope.setContext('sendSessionReminders', { eventId: event.id })
            Sentry.captureException(error)
          })
          payload.logger.warn({
            msg: 'SendSessionReminders: per-event failure — continuing',
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
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
