import type { Payload, PayloadRequest } from 'payload'

import { toText } from 'rrule-temporal/totext'

import type { EventDetails } from '@/emails/EventVerificationReminderEmail'
import { getLocalTimeHHMM } from '@/hooks/scheduleHooks'
import type { Event } from '@/payload-types'

const RECENT_REGISTRATION_DAYS = 30

type Address = NonNullable<Event['address']>
type Schedule = NonNullable<Event['schedule']>

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

/** One-line schedule: recurrence (or one-off date) + local time range + tz. */
function scheduleOneLine(schedule: Schedule | null | undefined): string {
  if (!schedule?.firstDate) return ''
  // `firstDate_tz` is a curated enum (no UTC); widen to string for the fallback
  // + comparison below.
  const tz: string = schedule.firstDate_tz || 'UTC'
  const start = getLocalTimeHHMM(schedule.firstDate, tz)
  const time = start ? (schedule.endTime ? `${start}–${schedule.endTime}` : start) : ''

  let when = ''
  if (schedule.recurrenceType && typeof schedule.icalRule === 'string') {
    try {
      when = toText(schedule.icalRule).replace(/^./, (char) => char.toUpperCase())
    } catch {
      when = ''
    }
  } else {
    // One-off event — format the single date in its timezone.
    when = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(schedule.firstDate))
  }

  const tzSuffix = tz && tz !== 'UTC' ? ` (${tz})` : ''
  return [when, time].filter(Boolean).join(', ') + tzSuffix
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
    const cutoff = new Date(
      Date.now() - RECENT_REGISTRATION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
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
