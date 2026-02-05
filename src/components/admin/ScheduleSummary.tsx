'use client'

import type { FieldClientComponent, FormState, NamedGroupFieldClient } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { useAllFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'
import { toText } from 'rrule-temporal/totext'

/**
 * Extracted schedule sub-field values from form state.
 */
interface ScheduleFormValues {
  firstDate?: string
  firstDate_tz?: string
  recurrenceType?: string
  interval?: number
  weekdays?: string[]
  monthlyMode?: string
  monthDay?: number
  weekNumber?: string
  weekdayOfMonth?: string
  endingType?: string
  count?: number
  untilDate?: string
}

/**
 * Extract schedule sub-field values from form state using the group name prefix.
 * Form state stores group sub-fields as flat paths: `{groupName}.{subField}`.
 */
function extractScheduleValues(formState: FormState, groupName: string): ScheduleFormValues {
  const get = (subField: string) => formState[`${groupName}.${subField}`]?.value
  return {
    firstDate: get('firstDate') as string | undefined,
    firstDate_tz: get('firstDate_tz') as string | undefined,
    recurrenceType: get('recurrenceType') as string | undefined,
    interval: get('interval') as number | undefined,
    weekdays: get('weekdays') as string[] | undefined,
    monthlyMode: get('monthlyMode') as string | undefined,
    monthDay: get('monthDay') as number | undefined,
    weekNumber: get('weekNumber') as string | undefined,
    weekdayOfMonth: get('weekdayOfMonth') as string | undefined,
    endingType: get('endingType') as string | undefined,
    count: get('count') as number | undefined,
    untilDate: get('untilDate') as string | undefined,
  }
}

/**
 * Format a ZonedDateTime as an iCalendar local datetime string: YYYYMMDDTHHmmss
 */
function formatLocalDateTime(zdt: Temporal.ZonedDateTime): string {
  const Y = String(zdt.year).padStart(4, '0')
  const M = String(zdt.month).padStart(2, '0')
  const D = String(zdt.day).padStart(2, '0')
  const h = String(zdt.hour).padStart(2, '0')
  const m = String(zdt.minute).padStart(2, '0')
  const s = String(zdt.second).padStart(2, '0')
  return `${Y}${M}${D}T${h}${m}${s}`
}

/**
 * Build an iCalendar string (DTSTART + RRULE) from form values for passing to toText().
 * Only handles recurring events. Returns null if firstDate is missing or invalid.
 *
 * Mirrors the RRULE building logic from scheduleHooks.ts but produces a string
 * directly instead of constructing an RRuleTemporal instance.
 */
function buildIcalString(values: ScheduleFormValues): string | null {
  if (!values.firstDate || !values.recurrenceType) return null

  const timezone = values.firstDate_tz || 'UTC'

  let zdt: Temporal.ZonedDateTime
  try {
    zdt = Temporal.Instant.from(values.firstDate).toZonedDateTimeISO(timezone)
  } catch {
    return null
  }

  // Build DTSTART line
  const dtstart = `DTSTART;TZID=${timezone}:${formatLocalDateTime(zdt)}`

  // Build RRULE parameters
  const params: string[] = [`FREQ=${values.recurrenceType}`]

  const interval = values.interval ?? 1
  if (interval > 1) {
    params.push(`INTERVAL=${interval}`)
  }

  // BYDAY for weekly recurrence
  if (values.recurrenceType === 'WEEKLY' && values.weekdays && values.weekdays.length > 0) {
    params.push(`BYDAY=${values.weekdays.join(',')}`)
  }

  // Monthly recurrence
  if (values.recurrenceType === 'MONTHLY') {
    const monthlyMode = values.monthlyMode || 'date'
    if (monthlyMode === 'date') {
      const day = values.monthDay ?? zdt.day
      params.push(`BYMONTHDAY=${day}`)
    } else {
      const weekNum = parseInt(values.weekNumber || '1', 10)
      const weekday = values.weekdayOfMonth || 'MO'
      params.push(`BYDAY=${weekNum}${weekday}`)
    }
  }

  // Ending conditions
  if (values.endingType === 'count' && values.count && values.count > 0) {
    params.push(`COUNT=${values.count}`)
  } else if (values.endingType === 'until' && values.untilDate) {
    const datePart = values.untilDate.includes('T')
      ? values.untilDate.split('T')[0]
      : values.untilDate
    if (datePart) {
      const formatted = datePart.replace(/-/g, '')
      params.push(`UNTIL=${formatted}T235959Z`)
    }
  }

  const rrule = `RRULE:${params.join(';')}`
  return `${dtstart}\n${rrule}`
}

/**
 * Format a one-off event date for display.
 * Output: "Once on Mar 15, 2025 at 9:30 AM (America/New_York)"
 */
function formatOneOffDate(firstDate: string, timezone: string): string | null {
  try {
    const date = new Date(firstDate)
    if (isNaN(date.getTime())) return null

    const dateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)

    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)

    return `Once on ${dateStr} at ${timeStr} (${timezone})`
  } catch {
    return null
  }
}

const bannerStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.75)',
  marginBottom: 'calc(var(--base))',
  backgroundColor: 'var(--theme-elevation-50)',
  borderRadius: 'var(--style-radius-s)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-650)',
  lineHeight: 1.5,
}

/**
 * ScheduleSummary Component
 *
 * Displays a human-readable description of the configured recurrence rule
 * below the schedule group field. Updates in real-time as the user changes
 * schedule sub-fields.
 *
 * For recurring events, uses rrule-temporal's toText() function.
 * For one-off events, formats the date/time with Intl.DateTimeFormat.
 *
 * Registered as afterInput on the schedule group field.
 */
export const ScheduleSummary: FieldClientComponent = ({ field }) => {
  const groupName = (field as NamedGroupFieldClient).name
  const [formState] = useAllFormFields()

  const summaryText = useMemo(() => {
    if (!groupName) return null

    const values = extractScheduleValues(formState, groupName)
    if (!values.firstDate) return null

    // One-off event: format with Intl.DateTimeFormat
    if (!values.recurrenceType) {
      return formatOneOffDate(values.firstDate, values.firstDate_tz || 'UTC')
    }

    // Recurring event: build iCalendar string and pass to toText()
    const ical = buildIcalString(values)
    if (!ical) return null

    try {
      return toText(ical).replace(/^./, (char) => char.toUpperCase())
    } catch {
      return null
    }
  }, [formState, groupName])

  if (!summaryText) return null

  return <div style={bannerStyle}>{summaryText}</div>
}

export default ScheduleSummary
