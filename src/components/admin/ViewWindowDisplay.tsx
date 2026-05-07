'use client'

import type { FormState } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { useAllFormFields } from '@payloadcms/ui'
import React, { useMemo } from 'react'

interface ViewWindow {
  label: string
  timeRange: string
}

function parseThresholdMinutes(threshold: string): number | null {
  const match = threshold.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
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
  const endTime = get('schedule.endTime') as string | undefined

  if (!firstDate || !endTime) return null

  const timezone = firstDateTz || 'UTC'

  let eventStart: Temporal.ZonedDateTime
  try {
    eventStart = Temporal.Instant.from(firstDate).toZonedDateTimeISO(timezone)
  } catch {
    return null
  }

  const endMatch = endTime.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
  if (!endMatch) return null

  const eventEnd = eventStart.with({
    hour: parseInt(endMatch[1]!, 10),
    minute: parseInt(endMatch[2]!, 10),
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  })

  const views: { label: string; thresholdMinutes: number }[] = []

  for (const [key, label] of [
    ['startingSoon', 'Starting Soon'],
    ['liveNow', 'Live Now'],
  ] as const) {
    const enabled = get(`${key}.enabled`) as boolean | undefined
    if (enabled === false) continue

    const threshold = (get(`${key}.threshold`) as string | undefined) ?? (key === 'startingSoon' ? '1:00' : '0:00')
    const minutes = parseThresholdMinutes(threshold)
    if (minutes === null) continue

    views.push({ label, thresholdMinutes: minutes })
  }

  // Sort so the view with the largest threshold (earliest activation) comes first
  views.sort((a, b) => b.thresholdMinutes - a.thresholdMinutes)

  const result: ViewWindow[] = []

  for (let i = 0; i < views.length; i++) {
    const view = views[i]!
    const next = views[i + 1]

    const viewStart = eventStart.subtract({ minutes: view.thresholdMinutes })
    const viewEnd = next ? eventStart.subtract({ minutes: next.thresholdMinutes }) : eventEnd

    result.push({
      label: view.label,
      timeRange: `${formatZonedTime(viewStart)} – ${formatZonedTime(viewEnd)}`,
    })
  }

  result.push({ label: 'Default', timeRange: 'All other times' })

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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  lineHeight: 1.6,
}

const labelStyle: React.CSSProperties = {
  minWidth: '110px',
  fontWeight: 500,
}

export const ViewWindowDisplay: React.FC = () => {
  const [formState] = useAllFormFields()

  const windows = useMemo(() => computeWindows(formState), [formState])

  if (!windows || windows.length === 0) return null

  return (
    <div style={containerStyle}>
      {windows.map((w) => (
        <div key={w.label} style={rowStyle}>
          <span style={labelStyle}>{w.label}</span>
          <span>{w.timeRange}</span>
        </div>
      ))}
    </div>
  )
}

export default ViewWindowDisplay
