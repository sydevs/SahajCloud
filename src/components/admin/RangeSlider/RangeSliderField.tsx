'use client'

import type { NumberFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { labelText } from '@/components/admin/helpers/labelText'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

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
    admin: { description, className, step, custom } = {},
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

  // Generate aria-label for accessibility (StaticLabel handling)
  const ariaLabel = labelText(label, name)

  return (
    <div className={fieldClasses} id={fieldId(name)} style={mergeFieldStyles(field.admin)}>
      <FieldLabel label={label} localized={localized} required={required} />

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
