'use client'

import type { FormState } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { useAllFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'

interface ViewWindow {
  label: string
  timeRange: string
  timezone?: string
}

function parseMinutes(hhmm: string): number | null {
  const match = hhmm.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
  if (!match) return null
  return parseInt(match[1]!, 10) * 60 + parseInt(match[2]!, 10)
}

function formatZonedTime(zdt: Temporal.ZonedDateTime): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zdt.timeZoneId,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(zdt.epochMilliseconds))
}

function computeWindows(formState: FormState): ViewWindow[] | null {
  const get = (key: string) => formState[key]?.value

  const firstDate = get('schedule.firstDate') as string | undefined
  const firstDateTz = get('schedule.firstDate_tz') as string | undefined
  const endTimeStr = get('schedule.endTime') as string | undefined

  if (!firstDate) return null

  const timezone = firstDateTz || 'UTC'

  let eventStart: Temporal.ZonedDateTime
  try {
    eventStart = Temporal.Instant.from(firstDate).toZonedDateTimeISO(timezone)
  } catch {
    return null
  }

  // Fall back to 1 hour when endTime is absent or unparseable
  let eventEnd: Temporal.ZonedDateTime
  if (endTimeStr) {
    const m = endTimeStr.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
    eventEnd = m
      ? eventStart.with({
          hour: parseInt(m[1]!, 10),
          minute: parseInt(m[2]!, 10),
          second: 0,
          millisecond: 0,
          microsecond: 0,
          nanosecond: 0,
        })
      : eventStart.add({ minutes: 60 })
  } else {
    eventEnd = eventStart.add({ minutes: 60 })
  }

  const result: ViewWindow[] = []

  // Compute liveNow start first — Starting Soon ends where Live Now begins
  const liveNowEnabled = get('liveNow.enabled') as boolean | undefined
  const lnThresholdStr = (get('liveNow.threshold') as string | undefined) ?? '0:00'
  const lnMinutes = liveNowEnabled === true ? (parseMinutes(lnThresholdStr) ?? 0) : 0
  const lnStart = lnMinutes > 0 ? eventStart.subtract({ minutes: lnMinutes }) : eventStart

  // Starting Soon: (eventStart − ssThreshold) → lnStart
  const startingSoonEnabled = get('startingSoon.enabled') as boolean | undefined
  if (startingSoonEnabled === true) {
    const thresholdStr = (get('startingSoon.threshold') as string | undefined) ?? '1:00'
    const minutes = parseMinutes(thresholdStr)
    if (minutes !== null) {
      result.push({
        label: 'Starting Soon',
        timeRange: `${formatZonedTime(eventStart.subtract({ minutes }))} – ${formatZonedTime(lnStart)}`,
        timezone,
      })
    }
  }

  // Live Now: lnStart → event end
  if (liveNowEnabled === true) {
    result.push({
      label: 'Live Now',
      timeRange: `${formatZonedTime(lnStart)} – ${formatZonedTime(eventEnd)}`,
      timezone,
    })
  }

  result.push({
    label: 'Default',
    timeRange: result.length === 0 ? 'All times' : 'All other times',
  })

  return result
}

const containerStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.75)',
  marginBottom: 'calc(var(--base))',
  backgroundColor: 'var(--theme-elevation-50)',
  borderRadius: 'var(--style-radius-s)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-650)',
}

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: 'calc(var(--base) * 0.25)',
  color: 'var(--theme-elevation-800)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  lineHeight: 1.6,
}

const nameLabelStyle: React.CSSProperties = {
  minWidth: '110px',
  fontWeight: 500,
}

const timeRangeStyle: React.CSSProperties = {
  minWidth: '160px',
}

const timezoneStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
}

export const AppCardViewSchedule: React.FC = () => {
  const [formState] = useAllFormFields()

  const windows = useMemo(() => computeWindows(formState), [formState])

  if (!windows || windows.length === 0) return null

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>View Schedule</div>
      {windows.map((w) => (
        <div key={w.label} style={rowStyle}>
          <span style={nameLabelStyle}>{w.label}</span>
          <span style={timeRangeStyle}>{w.timeRange}</span>
          {w.timezone && <span style={timezoneStyle}>{w.timezone}</span>}
        </div>
      ))}
    </div>
  )
}

export default AppCardViewSchedule
