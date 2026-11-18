'use client'

import { useFormFields } from '@payloadcms/ui'
import React, { useLayoutEffect, useState } from 'react'

import { type Recurrence, recurrenceForRepeats } from '@/lib/schedule/recurrence'

const UNITS: Record<Recurrence, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }

/**
 * The interval's unit, faded inside its input just after the number — "2
 * weeks" — so "Every" says what repeats wherever the recurrence control sits.
 *
 * An `afterInput`, which Payload renders after the input's own wrapper, so the
 * unit is drawn from a zero-height box there and lifted back over the input.
 * Its place is measured off the input itself — its height, its left inset and
 * the typed number's width in its own font — rather than restating Payload's
 * input metrics here.
 */
export function IntervalUnit({
  path,
  recurrenceFrom,
}: {
  path: string
  recurrenceFrom?: string
}): React.ReactElement | null {
  const groupPath = path.slice(0, path.lastIndexOf('.'))
  const recurrence = useFormFields(([fields]) =>
    recurrenceFrom
      ? recurrenceForRepeats(fields[recurrenceFrom]?.value)
      : recurrenceForRepeats(fields[`${groupPath}.recurrenceType`]?.value),
  )
  const value = useFormFields(([fields]) => fields[path]?.value)
  const [place, setPlace] = useState<{ height: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const input = document.getElementById(`field-${path.replace(/\./g, '__')}`)
    if (!(input instanceof HTMLInputElement)) return
    const style = getComputedStyle(input)
    const context = document.createElement('canvas').getContext('2d')
    if (context) context.font = `${style.fontSize} ${style.fontFamily}`
    const textWidth = context?.measureText(input.value).width ?? 0
    setPlace({
      height: input.offsetHeight,
      left:
        parseFloat(style.paddingLeft) +
        parseFloat(style.borderLeftWidth) +
        textWidth +
        (input.value ? parseFloat(style.fontSize) * 0.35 : 0),
    })
  }, [path, value, recurrence])

  if (!recurrence || !place) return null
  const count = typeof value === 'number' ? value : 1
  const unit = `${UNITS[recurrence]}${count === 1 ? '' : 's'}`

  return (
    <div aria-hidden style={{ position: 'relative', height: 0 }}>
      <span
        style={{
          position: 'absolute',
          bottom: 0,
          left: place.left,
          height: place.height,
          display: 'flex',
          alignItems: 'center',
          color: 'var(--theme-elevation-400)',
          pointerEvents: 'none',
        }}
      >
        {unit}
      </span>
    </div>
  )
}

export default IntervalUnit
