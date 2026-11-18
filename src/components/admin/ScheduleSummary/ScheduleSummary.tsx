'use client'

import type { GroupFieldClient } from 'payload'

import { useAllFormFields } from '@payloadcms/ui'
import { CalendarDays } from 'lucide-react'
import React, { useMemo } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

import { summarizeSchedule } from './summary'

export interface ScheduleSummaryBannerProps {
  /** The schedule group's own path in the form. */
  schedulePath: string
  /** A caller-owned recurrence control (`scheduleFields`' `recurrenceFrom`). */
  recurrenceFrom?: string
}

/**
 * The schedule in a sentence, following each edit before it is saved — or,
 * before a first date is set, what to fill in.
 */
export function ScheduleSummaryBanner({
  schedulePath,
  recurrenceFrom,
}: ScheduleSummaryBannerProps): React.ReactElement | null {
  const [formState] = useAllFormFields()
  const summary = useMemo(
    () => summarizeSchedule(formState, schedulePath, recurrenceFrom),
    [formState, schedulePath, recurrenceFrom],
  )
  if (!summary) return null

  if (summary.kind === 'empty') {
    return (
      <InfoBanner icon={<CalendarDays aria-hidden size={20} />} title="No schedule yet">
        Set the first date and time below, and how often it repeats. A summary appears here as you
        fill them in.
      </InfoBanner>
    )
  }
  return (
    <InfoBanner icon={<CalendarDays aria-hidden size={20} />} title={summary.title}>
      {summary.detail}
    </InfoBanner>
  )
}

/**
 * The banner heading the schedule group, registered by `scheduleFields` as its
 * `beforeInput` (`hasSummary`).
 */
export function ScheduleSummary({
  field,
  path,
  recurrenceFrom,
}: {
  field?: GroupFieldClient
  path?: string
  recurrenceFrom?: string
}): React.ReactElement | null {
  const schedulePath = path ?? (field && 'name' in field ? field.name : undefined)
  if (!schedulePath) return null
  return <ScheduleSummaryBanner recurrenceFrom={recurrenceFrom} schedulePath={schedulePath} />
}

export default ScheduleSummary
