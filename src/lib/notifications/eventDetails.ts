import type { Payload, PayloadRequest } from 'payload'

import type { EventDetails } from '@/emails/EventVerificationEmail'
import type { Event } from '@/payload-types'

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_REGISTRATION_DAYS = 30

type Address = NonNullable<Event['address']>
type Schedule = NonNullable<Event['schedule']>

const WEEKDAY_NAMES: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
}
const WEEK_ORDINALS: Record<string, string> = {
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '-1': 'last',
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`
}

/** One-line address: street, room, city, region, "country postCode". */
function addressOneLine(address: Address): string {
  const countryLine = [address.country, address.postCode].filter(Boolean).join(' ')
  return [address.street, address.room, address.city, address.region, countryLine]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
}

function formatDate(value: unknown, withYear = true): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date)
}

/** Start time in the event's timezone, e.g. "9:26 AM" (no seconds). */
function startTime(firstDate: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(firstDate))
    .replace(/ /g, ' ') // ICU emits a narrow no-break space before AM/PM
}

/** Concise recurrence phrase, e.g. "Every week on Saturday". */
function recurrencePhrase(schedule: Schedule): string {
  const interval = schedule.interval && schedule.interval > 1 ? schedule.interval : 1
  switch (schedule.recurrenceType) {
    case 'DAILY':
      return interval === 1 ? 'Every day' : `Every ${interval} days`
    case 'WEEKLY': {
      const days = (schedule.weekdays ?? [])
        .map((day) => WEEKDAY_NAMES[day])
        .filter(Boolean)
        .join(', ')
      const every = interval === 1 ? 'Every week' : `Every ${interval} weeks`
      return days ? `${every} on ${days}` : every
    }
    case 'MONTHLY': {
      const every = interval === 1 ? 'Every month' : `Every ${interval} months`
      if (schedule.monthlyMode === 'weekday' && schedule.weekdayOfMonth) {
        const week = WEEK_ORDINALS[String(schedule.weekNumber)] ?? ''
        return `${every} on the ${week} ${WEEKDAY_NAMES[schedule.weekdayOfMonth]}`
          .replace(/\s+/g, ' ')
          .trim()
      }
      if (schedule.monthDay) return `${every} on the ${ordinal(schedule.monthDay)}`
      return every
    }
    default:
      return ''
  }
}

/** One-line schedule, e.g. "Every week on Saturday at 9:26 AM". */
export function scheduleOneLine(schedule: Schedule | null | undefined): string {
  if (!schedule?.firstDate) return ''
  // `firstDate_tz` is a curated enum (no UTC); widen to string for the fallback.
  const tz: string = schedule.firstDate_tz || 'UTC'
  const time = startTime(schedule.firstDate, tz)

  if (!schedule.recurrenceType) {
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(schedule.firstDate))
    return time ? `${date} at ${time}` : date
  }

  const phrase = recurrencePhrase(schedule)
  return [phrase, time ? `at ${time}` : ''].filter(Boolean).join(' ')
}

/** Formatted scheduled-break lines, e.g. "Diwali break: 21 Jul – 23 Jul 2026". */
function formatBreaks(schedule: Schedule | null | undefined): string[] {
  return (schedule?.exclusions ?? [])
    .map((exclusion) => {
      const start = formatDate(exclusion?.startDate, false)
      const end = formatDate(exclusion?.endDate)
      if (!start && !end) return ''
      const range = end && end !== start ? `${start} – ${end}` : start || end
      return exclusion?.reason ? `${exclusion.reason}: ${range}` : range
    })
    .filter(Boolean)
}

/** A full date for deadlines, e.g. "Saturday, 19 July 2026" (UTC). */
export function formatLongDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Coarse human duration since `fromIso`, e.g. "3 months" / "5 weeks". */
export function humanDurationSince(fromIso: string, now: Date): string {
  const ms = now.getTime() - new Date(fromIso).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const days = Math.floor(ms / DAY_MS)
  if (days >= 60) return `${Math.round(days / 30)} months`
  if (days >= 14) return `${Math.round(days / 7)} weeks`
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`
  return 'less than a day'
}

/**
 * Build the summary an event reminder email shows so the manager can verify
 * the key facts at a glance: title, location (address one-line, or the online
 * URL), schedule, contact, scheduled breaks, and — only when there are any —
 * registrations in the last 30 days.
 */
export async function buildEventEmailDetails(args: {
  payload: Payload
  event: Event
  req?: PayloadRequest
}): Promise<EventDetails> {
  const { payload, event, req } = args
  const isOnline = event.eventType === 'online'

  let recentRegistrations: number | undefined
  try {
    const cutoff = new Date(Date.now() - RECENT_REGISTRATION_DAYS * DAY_MS).toISOString()
    const { totalDocs } = await payload.count({
      collection: 'registrations',
      where: {
        and: [{ event: { equals: event.id } }, { createdAt: { greater_than_equal: cutoff } }],
      },
      overrideAccess: true,
      req,
    })
    recentRegistrations = totalDocs > 0 ? totalDocs : undefined
  } catch {
    recentRegistrations = undefined
  }

  const contact = [event.contactName?.trim(), event.contactPhone?.trim()]
    .filter(Boolean)
    .join(' · ')
  const breaks = formatBreaks(event.schedule)

  return {
    title: typeof event.title === 'string' ? event.title : `Event #${event.id}`,
    locationLabel: isOnline ? 'Online' : 'Address',
    location: isOnline ? (event.onlineUrl ?? '') : addressOneLine(event.address ?? {}),
    schedule: scheduleOneLine(event.schedule),
    contact: contact || undefined,
    breaks: breaks.length > 0 ? breaks : undefined,
    recentRegistrations,
  }
}
