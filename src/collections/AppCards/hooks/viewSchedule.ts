import type { FieldHook } from 'payload'

import { Temporal } from '@js-temporal/polyfill'

import { buildRRuleTemporal } from '@/lib/schedule/scheduleHooks'
import { minutesOfDay } from '@/lib/schedule/time'
import type { EventSchedule } from '@/types/schedule'

type ViewName = 'startingSoon' | 'liveNow' | 'default'

/**
 * afterRead hook: computes the view schedule spec for event-type app cards.
 *
 * Returns a timeline object: { timezone: "UTC", schedule: { "HH:MM": viewName } }.
 * Each key marks when that view becomes active (24-hour UTC); the selection lasts
 * until the next key. Keys are sorted ascending. Computed from the next upcoming
 * event occurrence. Returns null when no event views are enabled or no future
 * occurrence exists.
 */
export const viewScheduleAfterRead: FieldHook = ({ data: doc, req }) => {
  if (doc?.type !== 'event') {
    return { timezone: 'UTC' as const, schedule: { '00:00': 'default' as ViewName } }
  }

  const schedule = doc.schedule as Partial<EventSchedule> | null | undefined
  if (!schedule?.firstDate) return null

  const startingSoon = doc.startingSoon as Record<string, unknown> | null | undefined
  const liveNow = doc.liveNow as Record<string, unknown> | null | undefined

  const startingSoonEnabled = startingSoon?.enabled === true
  const liveNowEnabled = liveNow?.enabled === true
  if (!startingSoonEnabled && !liveNowEnabled) return null

  const rule = buildRRuleTemporal(schedule)
  if (!rule) return null

  const timezone = schedule.firstDate_tz || 'UTC'
  const endTimeStr = schedule.endTime

  // Compute the next upcoming event start time
  const now = new Date()
  type RRuleZDT = { epochMilliseconds: bigint }

  const isRecurring =
    !!schedule.recurrenceType && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(schedule.recurrenceType)

  let nextISO: string | undefined

  if (isRecurring) {
    const until = new Date(now)
    until.setMonth(until.getMonth() + 6)
    const upcoming = (rule.between(now, until, true) as unknown as RRuleZDT[]).slice(0, 1)
    if (upcoming.length > 0) {
      nextISO = new Date(Number(upcoming[0]!.epochMilliseconds)).toISOString()
    }
  } else {
    const all = rule.all() as unknown as RRuleZDT[]
    const next = all.find((zdt) => Number(zdt.epochMilliseconds) > now.getTime())
    if (next) {
      nextISO = new Date(Number(next.epochMilliseconds)).toISOString()
    }
  }

  if (!nextISO) return null

  // Parse Starting Soon / Live Now thresholds to total minutes
  const ssThresholdStr = (startingSoon?.threshold as string | undefined) ?? '1:00'
  const ssMinutes = startingSoonEnabled ? minutesOfDay(ssThresholdStr) : null

  const lnThresholdStr = (liveNow?.threshold as string | undefined) ?? '0:00'
  const lnMinutes = (liveNowEnabled ? minutesOfDay(lnThresholdStr) : null) ?? 0

  // Converts a Temporal.Instant to HH:MM in UTC (24-hour clock)
  const toUTCHHMM = (instant: Temporal.Instant): string => {
    const d = new Date(Number(instant.epochMilliseconds))
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }

  try {
    const eventStart = Temporal.Instant.from(nextISO).toZonedDateTimeISO(timezone)

    // Event end: use configured endTime or default to +1 hour
    let eventEnd: Temporal.ZonedDateTime
    if (endTimeStr) {
      const endMinutes = minutesOfDay(endTimeStr)
      eventEnd =
        endMinutes !== null
          ? eventStart.with({
              hour: Math.floor(endMinutes / 60),
              minute: endMinutes % 60,
              second: 0,
              millisecond: 0,
              microsecond: 0,
              nanosecond: 0,
            })
          : eventStart.add({ minutes: 60 })
    } else {
      eventEnd = eventStart.add({ minutes: 60 })
    }

    // Build timeline entries: [HH:MM, viewName] — later entries win on duplicate keys.
    const entries: Array<[string, ViewName]> = []

    if (startingSoonEnabled && ssMinutes !== null) {
      entries.push([
        toUTCHHMM(eventStart.subtract({ minutes: ssMinutes }).toInstant()),
        'startingSoon',
      ])
    }

    // liveNow start: eventStart − lnThreshold (0 = exactly at event start)
    if (liveNowEnabled) {
      const lnStartInstant =
        lnMinutes > 0
          ? eventStart.subtract({ minutes: lnMinutes }).toInstant()
          : eventStart.toInstant()
      entries.push([toUTCHHMM(lnStartInstant), 'liveNow'])
    } else {
      // SS-only: default takes over at event start
      entries.push([toUTCHHMM(eventStart.toInstant()), 'default'])
    }

    // Event end: switch back to default (liveNow only)
    if (liveNowEnabled) {
      entries.push([toUTCHHMM(eventEnd.toInstant()), 'default'])
    }

    // Sort ascending; duplicate timestamps: last entry wins (sort is stable)
    entries.sort((a, b) => a[0].localeCompare(b[0]))

    // The keys repeat every 24 hours, so 00:00 carries whatever view the day's last key
    // opened. A fixed `default` there cut any window running past midnight UTC at 00:00 —
    // a 7:30–8:30 pm class in New York is 23:30–00:30 UTC.
    const timelineSchedule: Record<string, ViewName> = {
      '00:00': entries[entries.length - 1]?.[1] ?? 'default',
    }
    for (const [hhmm, view] of entries) {
      timelineSchedule[hhmm] = view
    }

    return { timezone: 'UTC' as const, schedule: timelineSchedule }
  } catch (err) {
    req.payload.logger.debug({ msg: 'viewSchedule computation failed', error: err })
    return null
  }
}
