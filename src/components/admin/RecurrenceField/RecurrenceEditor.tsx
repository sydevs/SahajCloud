'use client'

import React, { useCallback } from 'react'

import type { RecurrenceUIState, RecurrenceComplexity, RecurrenceType } from '@/types/recurrence'

import { recurrenceEditorStyles as styles } from './styles'
import {
  WEEKDAY_LABELS,
  WEEKDAY_FULL_LABELS,
  WEEK_NUMBER_LABELS,
  getOrdinalSuffix,
  getHumanReadableSummary,
  weekLabelIndexToRRule,
  rruleWeekToLabelIndex,
} from './utils'

/**
 * Props for RecurrenceEditor component
 */
export interface RecurrenceEditorProps {
  value: RecurrenceUIState
  onChange: (value: RecurrenceUIState) => void
  complexity: RecurrenceComplexity
  readOnly?: boolean
  'aria-label'?: string
}

/**
 * Recurrence type options
 */
const RECURRENCE_TYPE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

/**
 * RecurrenceEditor Component
 *
 * A pure UI component for editing recurrence patterns.
 * Has zero PayloadCMS dependencies - can be tested and used independently.
 *
 * Features:
 * - Recurrence type selection (none/daily/weekly/monthly)
 * - Weekday picker for weekly recurrence
 * - Interval input (every N days/weeks/months)
 * - Monthly mode selection (by date or by weekday)
 * - Ending condition selection (never/count/until)
 * - Duration input for multi-day events (advanced mode)
 * - Human-readable summary display
 *
 * All styling uses PayloadCMS CSS variables for theme consistency.
 */
export const RecurrenceEditor: React.FC<RecurrenceEditorProps> = ({
  value,
  onChange,
  complexity,
  readOnly = false,
  'aria-label': ariaLabel,
}) => {
  // Helper to update a single field
  const updateField = useCallback(
    <K extends keyof RecurrenceUIState>(field: K, fieldValue: RecurrenceUIState[K]) => {
      if (readOnly) return
      onChange({ ...value, [field]: fieldValue })
    },
    [value, onChange, readOnly],
  )

  // Handle recurrence type change
  const handleRecurrenceTypeChange = useCallback(
    (type: RecurrenceType) => {
      if (readOnly) return

      // Reset weekdays when switching to weekly
      const weekdays = type === 'weekly' ? value.weekdays : []

      onChange({
        ...value,
        recurrenceType: type,
        weekdays,
        interval: 1, // Reset interval when changing type
      })
    },
    [value, onChange, readOnly],
  )

  // Handle weekday toggle
  const handleWeekdayToggle = useCallback(
    (dayIndex: number) => {
      if (readOnly) return

      const newWeekdays = value.weekdays.includes(dayIndex)
        ? value.weekdays.filter((d) => d !== dayIndex)
        : [...value.weekdays, dayIndex].sort((a, b) => a - b)

      updateField('weekdays', newWeekdays)
    },
    [value.weekdays, updateField, readOnly],
  )

  // Check if a feature should be shown based on complexity
  const showFeature = useCallback(
    (feature: 'interval' | 'biweekly' | 'monthlyWeekday' | 'duration'): boolean => {
      switch (feature) {
        case 'interval':
          // Show interval for all recurrence types in standard/advanced
          return complexity !== 'simple'
        case 'biweekly':
          // Bi-weekly is available in standard and advanced
          return complexity !== 'simple'
        case 'monthlyWeekday':
          // Monthly by weekday is advanced only
          return complexity === 'advanced'
        case 'duration':
          // Multi-day duration is advanced only
          return complexity === 'advanced'
        default:
          return true
      }
    },
    [complexity],
  )

  // Get available recurrence types based on complexity
  const availableTypes = RECURRENCE_TYPE_OPTIONS.filter((opt) => {
    if (complexity === 'simple') {
      // Simple: only none, daily, weekly
      return ['none', 'daily', 'weekly'].includes(opt.value)
    }
    return true // Standard and advanced get all types
  })

  // Format date for input
  const formatDateForInput = (date: Date | null): string => {
    if (!date) return ''
    return date.toISOString().split('T')[0]
  }

  // Parse date from input
  const parseDateFromInput = (dateStr: string): Date | null => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? null : date
  }

  return (
    <div style={styles.container} aria-label={ariaLabel} role="group">
      {/* Recurrence Type Selector */}
      <div style={styles.row}>
        <span style={styles.label}>Repeats:</span>
        <select
          value={value.recurrenceType}
          onChange={(e) => handleRecurrenceTypeChange(e.target.value as RecurrenceType)}
          disabled={readOnly}
          style={{
            ...styles.select,
            opacity: readOnly ? 0.6 : 1,
            cursor: readOnly ? 'not-allowed' : 'pointer',
          }}
          aria-label="Recurrence type"
        >
          {availableTypes.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Interval Input (for non-simple complexity and recurring events) */}
      {value.recurrenceType !== 'none' && showFeature('interval') && (
        <div style={styles.row}>
          <span style={styles.label}>Every:</span>
          <input
            type="number"
            min={1}
            max={99}
            value={value.interval}
            onChange={(e) => updateField('interval', Math.max(1, parseInt(e.target.value) || 1))}
            disabled={readOnly}
            style={{
              ...styles.input,
              opacity: readOnly ? 0.6 : 1,
            }}
            aria-label="Interval"
          />
          <span style={styles.text}>
            {value.recurrenceType === 'daily'
              ? value.interval === 1
                ? 'day'
                : 'days'
              : value.recurrenceType === 'weekly'
                ? value.interval === 1
                  ? 'week'
                  : 'weeks'
                : value.interval === 1
                  ? 'month'
                  : 'months'}
          </span>
        </div>
      )}

      {/* Weekday Picker (for weekly recurrence) */}
      {value.recurrenceType === 'weekly' && (
        <div style={styles.section}>
          <span style={styles.label}>On days:</span>
          <div style={styles.weekdayContainer} role="group" aria-label="Days of the week">
            {WEEKDAY_LABELS.map((label, index) => {
              const isSelected = value.weekdays.includes(index)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleWeekdayToggle(index)}
                  disabled={readOnly}
                  style={{
                    ...styles.weekdayButton,
                    backgroundColor: isSelected
                      ? 'var(--theme-elevation-800)'
                      : 'var(--theme-input-bg)',
                    color: isSelected ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-600)',
                    opacity: readOnly ? 0.6 : 1,
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                  }}
                  aria-label={WEEKDAY_FULL_LABELS[index]}
                  aria-pressed={isSelected}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Monthly Mode Selector */}
      {value.recurrenceType === 'monthly' && (
        <div style={styles.section}>
          {/* Monthly by date */}
          {(value.monthlyMode === 'date' || !showFeature('monthlyWeekday')) && (
            <div style={styles.row}>
              <span style={styles.label}>On day:</span>
              <select
                value={value.monthDay}
                onChange={(e) => updateField('monthDay', parseInt(e.target.value))}
                disabled={readOnly}
                style={{
                  ...styles.select,
                  opacity: readOnly ? 0.6 : 1,
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                }}
                aria-label="Day of month"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {getOrdinalSuffix(day)}
                  </option>
                ))}
              </select>
              <span style={styles.text}>of each month</span>
            </div>
          )}

          {/* Monthly mode toggle (advanced only) */}
          {showFeature('monthlyWeekday') && (
            <>
              <div style={styles.row}>
                <span style={styles.label}>Mode:</span>
                <select
                  value={value.monthlyMode}
                  onChange={(e) => updateField('monthlyMode', e.target.value as 'date' | 'weekday')}
                  disabled={readOnly}
                  style={{
                    ...styles.select,
                    opacity: readOnly ? 0.6 : 1,
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                  }}
                  aria-label="Monthly mode"
                >
                  <option value="date">By date</option>
                  <option value="weekday">By weekday</option>
                </select>
              </div>

              {/* Monthly by weekday (e.g., 2nd Tuesday) */}
              {value.monthlyMode === 'weekday' && (
                <div style={styles.row}>
                  <span style={styles.label}>On the:</span>
                  <select
                    value={rruleWeekToLabelIndex(value.weekNumber)}
                    onChange={(e) =>
                      updateField('weekNumber', weekLabelIndexToRRule(parseInt(e.target.value)))
                    }
                    disabled={readOnly}
                    style={{
                      ...styles.select,
                      minWidth: '80px',
                      opacity: readOnly ? 0.6 : 1,
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                    }}
                    aria-label="Week of month"
                  >
                    {WEEK_NUMBER_LABELS.map((label, index) => (
                      <option key={index} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={value.weekdayOfMonth}
                    onChange={(e) => updateField('weekdayOfMonth', parseInt(e.target.value))}
                    disabled={readOnly}
                    style={{
                      ...styles.select,
                      opacity: readOnly ? 0.6 : 1,
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                    }}
                    aria-label="Weekday"
                  >
                    {WEEKDAY_FULL_LABELS.map((label, index) => (
                      <option key={index} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Ending Condition (for recurring events) */}
      {value.recurrenceType !== 'none' && (
        <div style={styles.section}>
          <div style={styles.row}>
            <span style={styles.label}>Ends:</span>
            <select
              value={value.endingType}
              onChange={(e) => updateField('endingType', e.target.value as 'never' | 'count' | 'until')}
              disabled={readOnly}
              style={{
                ...styles.select,
                opacity: readOnly ? 0.6 : 1,
                cursor: readOnly ? 'not-allowed' : 'pointer',
              }}
              aria-label="Ending type"
            >
              <option value="never">Never</option>
              <option value="count">After</option>
              <option value="until">On date</option>
            </select>

            {value.endingType === 'count' && (
              <>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={value.count}
                  onChange={(e) => updateField('count', Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={readOnly}
                  style={{
                    ...styles.input,
                    width: '60px',
                    opacity: readOnly ? 0.6 : 1,
                  }}
                  aria-label="Number of occurrences"
                />
                <span style={styles.text}>occurrences</span>
              </>
            )}

            {value.endingType === 'until' && (
              <input
                type="date"
                value={formatDateForInput(value.until)}
                onChange={(e) => updateField('until', parseDateFromInput(e.target.value))}
                disabled={readOnly}
                style={{
                  ...styles.dateInput,
                  opacity: readOnly ? 0.6 : 1,
                }}
                aria-label="End date"
              />
            )}
          </div>
        </div>
      )}

      {/* Duration Input (advanced mode only) */}
      {showFeature('duration') && (
        <div style={styles.row}>
          <span style={styles.label}>Duration:</span>
          <input
            type="number"
            min={1}
            max={30}
            value={value.duration}
            onChange={(e) => updateField('duration', Math.max(1, parseInt(e.target.value) || 1))}
            disabled={readOnly}
            style={{
              ...styles.input,
              opacity: readOnly ? 0.6 : 1,
            }}
            aria-label="Event duration in days"
          />
          <span style={styles.text}>{value.duration === 1 ? 'day' : 'days'}</span>
        </div>
      )}

      {/* Human-Readable Summary */}
      <div style={styles.summary} aria-live="polite">
        {getHumanReadableSummary(value)}
      </div>
    </div>
  )
}

export default RecurrenceEditor
