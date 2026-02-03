import type { Field } from 'payload'

import { dataToUIState, validateRecurrence } from '@/components/admin/RecurrenceField/utils'
import type { RecurrenceData, RecurrenceFieldOptions } from '@/types/recurrence'

// Re-export types for convenience
export type { RecurrenceFieldOptions } from '@/types/recurrence'

/**
 * Creates a recurrence field for event scheduling with iCalendar RRULE support.
 * Returns a JSON field with a custom RecurrenceField component.
 *
 * The field stores a JSON object with:
 * - `rrule`: The RRULE string (or null for one-off events)
 * - `duration`: Event duration in days
 *
 * @example Basic usage
 * ```typescript
 * fields: [
 *   recurrenceField({ name: 'schedule', required: true }),
 * ]
 * ```
 *
 * @example With complexity level
 * ```typescript
 * fields: [
 *   recurrenceField({
 *     name: 'schedule',
 *     complexity: 'simple', // Only basic options
 *     defaultDuration: 1,
 *   }),
 * ]
 * ```
 *
 * @example Advanced with all options
 * ```typescript
 * fields: [
 *   recurrenceField({
 *     name: 'eventSchedule',
 *     label: 'Event Schedule',
 *     complexity: 'advanced',
 *     defaultDuration: 3, // 3-day event
 *     admin: {
 *       description: 'Configure when this event repeats',
 *       position: 'sidebar',
 *     },
 *   }),
 * ]
 * ```
 */
export function recurrenceField(options: RecurrenceFieldOptions = {}): Field {
  const {
    name = 'recurrence',
    label = 'Recurrence',
    required = false,
    complexity = 'standard',
    defaultDuration = 1,
    admin = {},
  } = options

  const defaultValue: RecurrenceData = {
    rrule: null, // null = one-off event (per RFC 5545)
    duration: defaultDuration,
  }

  return {
    name,
    label,
    type: 'json',
    required,
    defaultValue,
    validate: (value) => {
      // JSON field receives string | null | undefined, but may also receive parsed object
      let data: RecurrenceData | null | undefined
      if (typeof value === 'string') {
        try {
          data = JSON.parse(value) as RecurrenceData
        } catch {
          return 'Invalid recurrence data format'
        }
      } else {
        data = value as RecurrenceData | null | undefined
      }

      // Convert stored data to UI state for validation
      const uiState = dataToUIState(data, defaultDuration)
      const error = validateRecurrence(uiState)
      // Return true if valid, or error message if invalid
      return error ?? true
    },
    admin: {
      description: admin.description || 'Define when this event repeats',
      position: admin.position,
      condition: admin.condition,
      components: {
        Field: '@/components/admin/RecurrenceField',
      },
      custom: {
        complexity,
        defaultDuration,
      },
    },
  }
}
