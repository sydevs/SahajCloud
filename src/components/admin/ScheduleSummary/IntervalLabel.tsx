'use client'

import type { NumberFieldClient } from 'payload'

import { FieldLabel, useFormFields } from '@payloadcms/ui'
import React from 'react'

import type { Recurrence } from '@/lib/schedule/recurrence'

const UNITS: Record<Recurrence, string> = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months' }

/**
 * The interval's label with its unit — "Every (weeks)" — read off the group's
 * own recurrence, so it says what repeats wherever the control that sets it
 * sits.
 */
export function IntervalLabel({
  field,
  path,
}: {
  field: NumberFieldClient
  path: string
}): React.ReactElement {
  const recurrence = useFormFields(
    ([fields]) => fields[`${path.slice(0, path.lastIndexOf('.'))}.recurrenceType`]?.value,
  )
  const unit = typeof recurrence === 'string' ? UNITS[recurrence as Recurrence] : undefined
  return (
    <FieldLabel label={unit ? `Every (${unit})` : 'Every'} path={path} required={field.required} />
  )
}

export default IntervalLabel
