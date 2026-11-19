'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldDescription, FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import { ToggleGroup, type ToggleGroupOption } from '@/components/admin/ToggleGroupField'
import { RECURRENCE_OPTIONS } from '@/lib/schedule/recurrence'

const ONCE = 'once'
const ON_DEMAND = 'on-demand'

const OPTIONS: ToggleGroupOption[] = [
  { label: 'One-time', value: ONCE },
  ...RECURRENCE_OPTIONS,
  { label: 'On-demand', value: ON_DEMAND },
]

const DESCRIPTIONS: Record<string, string> = {
  [ONCE]: 'Meets a single time, on the date below.',
  DAILY: 'Meets every day, or every few days.',
  WEEKLY: 'Meets on the same days each week, or every few weeks.',
  MONTHLY: 'Meets once a month, on a set date or weekday.',
  [ON_DEMAND]:
    'No fixed schedule. The listing invites seekers to get in touch through the public contact on the Details tab, and a time is arranged with them.',
}

const LABEL = 'How often does this class meet?'

/**
 * One control for two stored facts: whether a class is on-demand (`inactive`)
 * and how its schedule repeats (`schedule.recurrenceType`). It only writes the
 * form, so every other writer sets the two fields directly.
 *
 * Choosing On-demand leaves the recurrence alone — the schedule is hidden, not
 * cleared — so choosing a pace again restores it.
 */
export const EventFrequencyField: UIFieldClientComponent = ({ field, readOnly }) => {
  const inactive = useField<boolean>({ path: 'inactive' })
  const recurrence = useField<string | null>({ path: 'schedule.recurrenceType' })
  const value = inactive.value ? ON_DEMAND : recurrence.value || ONCE

  const choose = (next: string) => {
    inactive.setValue(next === ON_DEMAND)
    if (next !== ON_DEMAND) recurrence.setValue(next === ONCE ? null : next)
  }

  return (
    <div
      className={['field-type', 'select', readOnly && 'read-only'].filter(Boolean).join(' ')}
      style={mergeFieldStyles(field.admin)}
    >
      <FieldLabel label={LABEL} path="inactive" />
      <div className="field-type__wrap">
        <ToggleGroup
          aria-label={LABEL}
          onChange={choose}
          options={OPTIONS}
          readOnly={readOnly}
          value={value}
        />
      </div>
      <FieldDescription description={DESCRIPTIONS[value]} path="inactive" />
    </div>
  )
}

export default EventFrequencyField
