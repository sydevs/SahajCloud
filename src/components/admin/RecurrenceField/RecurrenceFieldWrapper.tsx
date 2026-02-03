'use client'

import type { JSONFieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useMemo, useCallback } from 'react'

import type { RecurrenceData, RecurrenceUIState, RecurrenceComplexity } from '@/types/recurrence'

import { RecurrenceEditor } from './RecurrenceEditor'
import { dataToUIState, uiStateToData } from './utils'

/**
 * Recurrence Field Wrapper Component
 *
 * A PayloadCMS field component wrapper for RecurrenceEditor that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Conversion between stored JSON and UI state
 * - Proper field wrapper structure matching PayloadCMS JSON fields
 *
 * This component integrates the RecurrenceEditor UI component into PayloadCMS's
 * field system, following the exact markup structure as JSON fields.
 *
 * @example Usage in collection config
 * ```typescript
 * import { recurrenceField } from '@/fields'
 *
 * {
 *   // ... collection config
 *   fields: [
 *     recurrenceField({
 *       name: 'schedule',
 *       complexity: 'standard',
 *     }),
 *   ],
 * }
 * ```
 */
export const RecurrenceFieldWrapper: JSONFieldClientComponent = ({ field, readOnly }) => {
  // Extract field properties with nested destructuring for admin
  const {
    name,
    label,
    localized,
    required,
    admin: { description, className, style, custom } = {},
  } = field as JSONFieldClient

  // Extract custom config with type safety
  const complexity = (custom?.complexity as RecurrenceComplexity) || 'standard'
  const defaultDuration = (custom?.defaultDuration as number) || 1

  // Use Payload's field hook for state management
  const { value, setValue, showError } = useField<RecurrenceData>()

  // Convert stored JSON to UI state
  const uiState = useMemo(() => dataToUIState(value, defaultDuration), [value, defaultDuration])

  // Handle UI state changes - convert back to stored format
  const handleChange = useCallback(
    (newState: RecurrenceUIState) => {
      const data = uiStateToData(newState, defaultDuration)
      setValue(data)
    },
    [setValue, defaultDuration],
  )

  // Build CSS classes following PayloadCMS conventions
  const fieldClasses = ['field-type', 'json', className, showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  // Generate field ID from path
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

        <RecurrenceEditor
          value={uiState}
          onChange={handleChange}
          complexity={complexity}
          readOnly={readOnly}
          aria-label={ariaLabel}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default RecurrenceFieldWrapper
