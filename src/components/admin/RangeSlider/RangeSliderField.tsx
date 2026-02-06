'use client'

import type { NumberFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import { RangeSlider } from './RangeSlider'

/**
 * Range Slider Field Component
 *
 * A PayloadCMS field component wrapper for RangeSlider that provides:
 * - Field state management via useField hook
 * - Label, error, and description rendering
 * - Reads min/max from the number field config, step from admin config
 * - Reads optional custom labels from admin.custom.labels
 *
 * Usage in collection config:
 * ```typescript
 * {
 *   name: 'weight',
 *   type: 'number',
 *   min: 1,
 *   max: 5,
 *   defaultValue: 3,
 *   admin: {
 *     components: { Field: '@/components/admin/RangeSlider' },
 *     custom: {
 *       labels: { 1: 'Low', 3: 'Medium', 5: 'High' },
 *     },
 *   },
 * }
 * ```
 */
export const RangeSliderField: NumberFieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    localized,
    required,
    min,
    max,
    admin: { description, className, style, step, custom } = {},
  } = field

  const { value, setValue, showError } = useField<number | null>()

  const labels = custom?.labels as Record<number, string> | undefined

  const effectiveMin = min ?? 0
  const effectiveMax = max ?? 10
  const effectiveStep = (step as number | undefined) ?? 1

  // Build CSS classes following PayloadCMS conventions
  const fieldClasses = [
    'field-type',
    'number',
    className,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  // Generate aria-label for accessibility (StaticLabel handling)
  const ariaLabel =
    typeof label === 'string'
      ? label
      : typeof label === 'object' && label !== null
        ? label['en'] || Object.values(label)[0] || name
        : name

  return (
    <div className={fieldClasses} id={fieldId} style={style}>
      <FieldLabel label={label} localized={localized} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <RangeSlider
          value={value}
          onChange={setValue}
          min={effectiveMin}
          max={effectiveMax}
          step={effectiveStep}
          labels={labels}
          readOnly={readOnly}
          aria-label={ariaLabel}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default RangeSliderField
