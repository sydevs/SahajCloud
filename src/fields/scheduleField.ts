import type { JSONSchema4 } from 'json-schema'
import type { Field } from 'payload'

import scheduleSchema from '@/components/admin/ScheduleField/scheduleSchema.json' with { type: 'json' }
import { dataToUIState, validateSchedule } from '@/components/admin/ScheduleField/utils'
import type { ScheduleData, ScheduleFieldOptions } from '@/types/schedule'
import { getBrowserTimezone, normalizeUTCString } from '@/types/schedule'

// Re-export types for convenience
export type { ScheduleFieldOptions } from '@/types/schedule'

/**
 * Creates a schedule field for event scheduling with datetime, timezone,
 * and iCalendar RRULE support.
 *
 * Returns a JSON field with a custom ScheduleField component.
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
 *   scheduleField({ name: 'schedule', required: true }),
 * ]
 * ```
 *
 * @example With complexity level
 * ```typescript
 * fields: [
 *   scheduleField({
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
 *   scheduleField({
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
export function scheduleField(options: ScheduleFieldOptions = {}): Field {
  const {
    name = 'schedule',
    label = 'Schedule',
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

  const defaultValue: ScheduleData = {
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
      let data: ScheduleData | null | undefined
      if (typeof value === 'string') {
        try {
          data = JSON.parse(value) as ScheduleData
        } catch {
          return 'Invalid schedule data format'
        }
      } else {
        data = value as ScheduleData | null | undefined
      }

      // Convert stored data to UI state for validation
      const uiState = dataToUIState(data, defaultTimezone)
      const error = validateSchedule(uiState)
      // Return true if valid, or error message if invalid
      return error ?? true
    },
    jsonSchema: {
      uri: 'a://schedule.json',
      fileMatch: ['a://schedule.json'],
      schema: scheduleSchema as JSONSchema4,
    },
    admin: {
      description: admin.description || 'Configure when this event occurs and repeats',
      position: admin.position,
      condition: admin.condition,
      components: {
        Field: '@/components/admin/ScheduleField',
      },
      custom: {
        complexity,
        defaultTimezone,
      },
    },
  }
}
