'use client'

import type { FieldClientComponent, SelectFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useEffect, useMemo } from 'react'

import { ToggleButtonGroup, type ToggleButtonOption } from './ToggleButtonGroup'

/**
 * Toggle Group Field Component
 *
 * A PayloadCMS field component wrapper for ToggleButtonGroup that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Automatic value initialization (uses defaultValue or first option)
 * - Proper field wrapper structure matching PayloadCMS SelectInput
 *
 * This component integrates the ToggleButtonGroup UI component into PayloadCMS's
 * field system, following the exact markup structure as SelectInput.
 *
 * Features:
 * - Automatic value initialization from field defaultValue or first option
 * - Full integration with PayloadCMS validation and error handling
 * - Read-only mode support
 * - Accessible field structure with proper labels and descriptions
 * - CSS classes matching PayloadCMS field conventions
 *
 * Usage in collection config:
 * ```typescript
 * {
 *   name: 'status',
 *   type: 'select',
 *   required: true,
 *   defaultValue: 'draft',
 *   options: [
 *     { label: 'Draft', value: 'draft' },
 *     { label: 'Published', value: 'published' },
 *   ],
 *   admin: {
 *     description: 'Set the publication status',
 *     components: {
 *       Field: '@/components/admin/ToggleGroupField',
 *     },
 *   },
 * }
 * ```
 */
export const ToggleGroupField: FieldClientComponent = ({ field, readOnly }) => {
  // Extract field properties with nested destructuring for admin
  const {
    name,
    label,
    localized,
    required,
    options: fieldOptions,
    admin: { description, className, style } = {},
  } = field as SelectFieldClient

  // Use Payload's field hook for state management
  // Path is inferred from context - no need to pass it explicitly
  const { value, setValue, showError } = useField<string>()

  // Convert field options to ToggleButtonOption format
  // Handle both string and OptionObject formats
  const options: ToggleButtonOption[] = useMemo(
    () =>
      fieldOptions.map((opt) => {
        if (typeof opt === 'string') {
          // String option - use as both label and value
          return { label: opt, value: opt }
        }
        // OptionObject - extract label and value
        const optLabel = typeof opt.label === 'string' ? opt.label : opt.value
        return { label: optLabel, value: opt.value }
      }),
    [fieldOptions],
  )

  // Ensure we always have a value (use first option if empty)
  useEffect(() => {
    if (!value && options.length > 0) {
      setValue(options[0].value)
    }
  }, [value, options, setValue])

  // Build CSS classes following PayloadCMS conventions
  // Note: PayloadCMS uses 'field-type' as the base class, not 'field'
  const fieldClasses = [
    'field-type',
    'select',
    className,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  // Generate field ID from path (replace dots with double underscores)
  const fieldId = `field-${name.replace(/\./g, '__')}`

  // Generate aria-label for accessibility
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

        <ToggleButtonGroup
          value={value || ''}
          onChange={setValue}
          options={options}
          readOnly={readOnly}
          aria-label={ariaLabel}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default ToggleGroupField
