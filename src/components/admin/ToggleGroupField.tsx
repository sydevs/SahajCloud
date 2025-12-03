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
  // Type assertion - we know this is a select field based on how it's configured
  const selectField = field as SelectFieldClient

  // Extract field properties
  const {
    name: fieldName,
    label: fieldLabel,
    localized: fieldLocalized,
    required: fieldRequired,
    options: fieldOptions,
    admin,
  } = selectField

  const fieldDescription = admin?.description
  const fieldClassName = admin?.className
  const fieldStyle = admin?.style

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
        const label = typeof opt.label === 'string' ? opt.label : opt.value
        return { label, value: opt.value }
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
    fieldClassName,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  // Generate field ID from path (replace dots with double underscores)
  const fieldId = `field-${fieldName.replace(/\./g, '__')}`

  return (
    <div className={fieldClasses} id={fieldId} style={fieldStyle}>
      {/* Field Label */}
      <FieldLabel
        label={fieldLabel}
        localized={fieldLocalized}
        path={fieldName}
        required={fieldRequired}
      />

      {/* Field Wrap - contains error and input */}
      <div className="field-type__wrap">
        {/* Field Error - positioned before input */}
        <FieldError path={fieldName} showError={showError} />

        {/* Toggle Button Group Input */}
        <ToggleButtonGroup
          value={value || ''}
          onChange={setValue}
          options={options}
          readOnly={readOnly}
          aria-label={
            typeof fieldLabel === 'string'
              ? fieldLabel
              : typeof fieldLabel === 'object' && fieldLabel !== null
                ? fieldLabel['en'] || Object.values(fieldLabel)[0] || fieldName
                : fieldName
          }
        />
      </div>

      {/* Field Description - positioned after wrap */}
      <FieldDescription description={fieldDescription} path={fieldName} />
    </div>
  )
}

export default ToggleGroupField
