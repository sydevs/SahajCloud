'use client'

import type { NumberFieldClient } from 'payload'

import { FieldLabel, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { type Recurrence, recurrenceForRepeats } from '@/lib/schedule/recurrence'

const UNITS: Record<Recurrence, string> = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months' }

/**
 * The interval's label with its unit — "Every (weeks)" — so it says what
 * repeats wherever the recurrence control sits.
 */
export function IntervalLabel({
  field,
  path,
  recurrenceFrom,
}: {
  field: NumberFieldClient
  path: string
  recurrenceFrom?: string
}): React.ReactElement {
  const recurrence = useFormFields(([fields]) =>
    recurrenceForRepeats(
      fields[recurrenceFrom ?? `${path.slice(0, path.lastIndexOf('.'))}.recurrenceType`]?.value,
    ),
  )
  const label = recurrence ? `Every (${UNITS[recurrence]})` : 'Every'
  return <FieldLabel label={label} path={path} required={field.required} />
}

export default IntervalLabel
