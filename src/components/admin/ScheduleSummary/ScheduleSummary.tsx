'use client'

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
  return (
    <InfoBanner icon={<CalendarDays aria-hidden size={20} />} title={summary.title}>
      {summary.detail}
    </InfoBanner>
  )
}

/** The banner heading the schedule group, registered by `scheduleFields` as its `beforeInput`. */
export function ScheduleSummary({ path }: { path: string }): React.ReactElement {
  return <ScheduleSummaryBanner schedulePath={path} />
}

export default ScheduleSummary
