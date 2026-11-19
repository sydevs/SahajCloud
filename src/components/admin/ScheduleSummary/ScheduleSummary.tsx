'use client'

import { useAllFormFields } from '@payloadcms/ui'
import { CalendarDays } from 'lucide-react'
import React, { useMemo } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

import { summarizeSchedule } from './summary'

/**
 * The schedule in a sentence, following each edit before it is saved — or,
 * before a first date is set, what to fill in.
 *
 * `scheduleFields` registers it as the group's `beforeInput`, which hands it the
 * group's `path`. A caller rendering its own recurrence control places it itself.
 */
export function ScheduleSummary({
  path,
}: {
  /** The schedule group's own path in the form. */
  path: string
}): React.ReactElement | null {
  const [formState] = useAllFormFields()
  const summary = useMemo(() => summarizeSchedule(formState, path), [formState, path])
  if (!summary) return null
  return (
    <InfoBanner icon={<CalendarDays aria-hidden size={20} />} title={summary.title}>
      {summary.detail}
    </InfoBanner>
  )
}

export default ScheduleSummary
