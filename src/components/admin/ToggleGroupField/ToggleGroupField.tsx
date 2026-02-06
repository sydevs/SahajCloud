'use client'

import type { FieldClientComponent, SelectFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useEffect, useMemo } from 'react'

import { ToggleGroup, type ToggleGroupOption } from './ToggleGroup'

/**
 * Toggle Group Field Component
 *
 * A PayloadCMS field component wrapper for ToggleGroup that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Automatic value initialization for single-select (uses defaultValue or first option)
 * - Multi-select support via `hasMany` field property
 * - Proper field wrapper structure matching PayloadCMS SelectInput
 *
 * Features:
 * - Single-select mode (default): auto-initializes value, radio behavior
 * - Multi-select mode (`hasMany: true`): no auto-init (empty array is valid), toggle behavior
 * - Full integration with PayloadCMS validation and error handling
 * - Read-only mode support
 * - Accessible field structure with proper labels and descriptions
 * - CSS classes matching PayloadCMS field conventions
 *
 * Usage in collection config:
 * ```typescript
 * // Single-select
 * {
 *   name: 'status',
 *   type: 'select',
 *   options: [{ label: 'Draft', value: 'draft' }, { label: 'Published', value: 'published' }],
 *   admin: { components: { Field: '@/components/admin/ToggleGroupField' } },
 * }
 *
 * // Multi-select
 * {
 *   name: 'timings',
 *   type: 'select',
 *   hasMany: true,
 *   options: [{ label: 'Morning', value: 'morning' }, { label: 'Evening', value: 'evening' }],
 *   admin: { components: { Field: '@/components/admin/ToggleGroupField' } },
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
    hasMany = false,
    options: fieldOptions,
    admin: { description, className, style } = {},
  } = field as SelectFieldClient

  // Use Payload's field hook for state management
  // Path is inferred from context - no need to pass it explicitly
  const { value, setValue, showError } = useField<string | string[]>()

  // Convert field options to ToggleButtonOption format
  // Handle both string and OptionObject formats
  const options: ToggleGroupOption[] = useMemo(
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

  // For single-select: ensure we always have a value (use first option if empty)
  // For multi-select: skip auto-initialization (empty array is valid)
  useEffect(() => {
    if (!hasMany && !value && options.length > 0) {
      setValue(options[0].value)
    }
  }, [hasMany, value, options, setValue])

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

  // Normalize value for the ToggleGroup component
  const normalizedValue = hasMany
    ? (Array.isArray(value) ? value : []) as string[]
    : ((value as string) || '')

  return (
    <div className={fieldClasses} id={fieldId} style={style}>
      <FieldLabel label={label} localized={localized} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        {hasMany ? (
          <ToggleGroup
            hasMany
            value={normalizedValue as string[]}
            onChange={setValue as (value: string[]) => void}
            options={options}
            readOnly={readOnly}
            clearable={!required}
            aria-label={ariaLabel}
          />
        ) : (
          <ToggleGroup
            value={normalizedValue as string}
            onChange={setValue as (value: string) => void}
            options={options}
            readOnly={readOnly}
            aria-label={ariaLabel}
          />
        )}
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default ToggleGroupField
