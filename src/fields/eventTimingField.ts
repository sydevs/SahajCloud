import type { JSONSchema4 } from 'json-schema'
import type { Field } from 'payload'

import eventTimingSchema from '@/components/admin/EventTimingField/eventTimingSchema.json' with { type: 'json' }
import { dataToUIState, validateEventTiming } from '@/components/admin/EventTimingField/utils'
import type { EventTimingData, EventTimingFieldOptions } from '@/types/eventTiming'
import { getBrowserTimezone, normalizeUTCString } from '@/types/eventTiming'

// Re-export types for convenience
export type { EventTimingFieldOptions } from '@/types/eventTiming'

/**
 * Creates an event timing field for event scheduling with datetime, timezone,
 * and iCalendar RRULE support.
 *
 * Returns a JSON field with a custom EventTimingField component.
 *
 * The field stores a JSON object with:
 * - `dtstart`: Start date-time in UTC with Z suffix
 * - `dtend`: End date-time in UTC or null for open-ended
 * - `tzid`: IANA timezone identifier
 * - `rrule`: The RRULE string (or null for one-off events)
 * - `duration`: Duration in minutes (computed from dtend - dtstart)
 *
 * @example Basic usage
 * ```typescript
 * fields: [
 *   eventTimingField({ name: 'schedule', required: true }),
 * ]
 * ```
 *
 * @example With complexity level
 * ```typescript
 * fields: [
 *   eventTimingField({
 *     name: 'schedule',
 *     complexity: 'simple', // No end time option
 *     defaultTimezone: 'America/New_York',
 *   }),
 * ]
 * ```
 *
 * @example Advanced with all options
 * ```typescript
 * fields: [
 *   eventTimingField({
 *     name: 'eventSchedule',
 *     label: 'Event Schedule',
 *     complexity: 'advanced',
 *     defaultTimezone: 'Europe/London',
 *     admin: {
 *       description: 'Configure when this event occurs',
 *       position: 'sidebar',
 *     },
 *   }),
 * ]
 * ```
 */
export function eventTimingField(options: EventTimingFieldOptions = {}): Field {
  const {
    name = 'eventTiming',
    label = 'Event Timing',
    required = false,
    complexity = 'standard',
    defaultTimezone,
    admin = {},
  } = options

  // Build default value
  const timezone = defaultTimezone || getBrowserTimezone()
  const now = new Date()
  const nextHour = new Date(now)
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)

  const defaultValue: EventTimingData = {
    dtstart: normalizeUTCString(nextHour.toISOString()),
    dtend: null,
    tzid: timezone,
    rrule: null,
    duration: 0,
  }

  return {
    name,
    label,
    type: 'json',
    required,
    defaultValue,
    validate: (value) => {
      // JSON field receives string | null | undefined, but may also receive parsed object
      let data: EventTimingData | null | undefined
      if (typeof value === 'string') {
        try {
          data = JSON.parse(value) as EventTimingData
        } catch {
          return 'Invalid event timing data format'
        }
      } else {
        data = value as EventTimingData | null | undefined
      }

      // Convert stored data to UI state for validation
      const uiState = dataToUIState(data, defaultTimezone)
      const error = validateEventTiming(uiState)
      // Return true if valid, or error message if invalid
      return error ?? true
    },
    jsonSchema: {
      uri: 'a://eventTiming.json',
      fileMatch: ['a://eventTiming.json'],
      schema: eventTimingSchema as JSONSchema4,
    },
    admin: {
      description: admin.description || 'Configure when this event occurs and repeats',
      position: admin.position,
      condition: admin.condition,
      components: {
        Field: '@/components/admin/EventTimingField',
      },
      custom: {
        complexity,
        defaultTimezone,
      },
    },
  }
}
