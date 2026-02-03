'use client'

import type { JSONFieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useMemo, useCallback } from 'react'

import type { EventTimingData, EventTimingUIState, EventTimingComplexity } from '@/types/eventTiming'
import { getBrowserTimezone } from '@/types/eventTiming'

import { EventTimingEditor } from './EventTimingEditor'
import { dataToUIState, uiStateToData } from './utils'

/**
 * Event Timing Field Wrapper Component
 *
 * A PayloadCMS field component wrapper for EventTimingEditor that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Conversion between stored JSON and UI state
 * - Proper field wrapper structure matching PayloadCMS JSON fields
 *
 * This component integrates the EventTimingEditor UI component into PayloadCMS's
 * field system, following the exact markup structure as JSON fields.
 *
 * @example Usage in collection config
 * ```typescript
 * import { eventTimingField } from '@/fields'
 *
 * {
 *   // ... collection config
 *   fields: [
 *     eventTimingField({
 *       name: 'schedule',
 *       complexity: 'standard',
 *     }),
 *   ],
 * }
 * ```
 */
export const EventTimingFieldWrapper: JSONFieldClientComponent = ({ field, readOnly }) => {
  // Extract field properties with nested destructuring for admin
  const {
    name,
    label,
    localized,
    required,
    admin: { description, className, style, custom } = {},
  } = field as JSONFieldClient

  // Extract custom config with type safety
  const complexity = (custom?.complexity as EventTimingComplexity) || 'standard'
  const defaultTimezone = (custom?.defaultTimezone as string) || getBrowserTimezone()

  // Use Payload's field hook for state management
  const { value, setValue, showError } = useField<EventTimingData>()

  // Convert stored JSON to UI state
  const uiState = useMemo(() => dataToUIState(value, defaultTimezone), [value, defaultTimezone])

  // Handle UI state changes - convert back to stored format
  const handleChange = useCallback(
    (newState: EventTimingUIState) => {
      const data = uiStateToData(newState)
      setValue(data)
    },
    [setValue],
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

        <EventTimingEditor
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

export default EventTimingFieldWrapper
