'use client'

import { DatePicker, Pill, ReactSelect, type ReactSelectOption } from '@payloadcms/ui'
import React, { useCallback, useMemo } from 'react'

import type { ScheduleUIState, ScheduleComplexity, RecurrenceType } from '@/types/schedule'
import { getAvailableTimezones } from '@/types/schedule'

import { scheduleEditorStyles as styles } from './styles'
import {
  WEEKDAY_LABELS,
  WEEKDAY_FULL_LABELS,
  WEEK_NUMBER_LABELS,
  getOrdinalSuffix,
  getScheduleSummary,
  weekLabelIndexToRRule,
  rruleWeekToLabelIndex,
} from './utils'

/**
 * Option type for ReactSelect with explicit label property
 * Extends PayloadCMS ReactSelectOption for type safety
 */
type SelectOption = ReactSelectOption & { label: string }

/**
 * Helper to format date string to Date object for DatePicker
 */
function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr) return undefined
  // Parse YYYY-MM-DD format, use noon to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

/**
 * Helper to format Date object to YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Props for ScheduleEditor component
 */
export interface ScheduleEditorProps {
  value: ScheduleUIState
  onChange: (value: ScheduleUIState) => void
  complexity: ScheduleComplexity
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
 * ScheduleEditor Component
 *
 * A pure UI component for editing schedule patterns with:
 * - Start date and time
 * - Timezone selector
 * - Optional end time (standard/advanced complexity)
 * - Recurrence patterns
 *
 * Has zero PayloadCMS dependencies - can be tested and used independently.
 *
 * All styling uses PayloadCMS CSS variables for theme consistency.
 */
export const ScheduleEditor: React.FC<ScheduleEditorProps> = ({
  value,
  onChange,
  complexity,
  readOnly = false,
  'aria-label': ariaLabel,
}) => {
  // Get timezone options for ReactSelect
  const timezoneOptions: SelectOption[] = useMemo(
    () =>
      getAvailableTimezones().map((tz) => ({
        value: tz,
        label: tz.replace(/_/g, ' '),
      })),
    [],
  )

  // Month day options (1-31)
  const monthDayOptions: SelectOption[] = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => ({
        value: i + 1,
        label: getOrdinalSuffix(i + 1),
      })),
    [],
  )

  // Monthly mode options
  const monthlyModeOptions: SelectOption[] = useMemo(
    () => [
      { value: 'date', label: 'By date' },
      { value: 'weekday', label: 'By weekday' },
    ],
    [],
  )

  // Week number options (1st, 2nd, 3rd, 4th, Last)
  const weekNumberOptions: SelectOption[] = useMemo(
    () => WEEK_NUMBER_LABELS.map((label, index) => ({ value: index, label })),
    [],
  )

  // Weekday options for monthly by weekday
  const weekdayOptions: SelectOption[] = useMemo(
    () => WEEKDAY_FULL_LABELS.map((label, index) => ({ value: index, label })),
    [],
  )

  // Ending type options
  const endingTypeOptions: SelectOption[] = useMemo(
    () => [
      { value: 'never', label: 'Never' },
      { value: 'count', label: 'After' },
      { value: 'until', label: 'On date' },
    ],
    [],
  )

  // Helper to update a single field
  const updateField = useCallback(
    <K extends keyof ScheduleUIState>(field: K, fieldValue: ScheduleUIState[K]) => {
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
    (feature: 'endTime' | 'interval' | 'biweekly' | 'monthlyWeekday'): boolean => {
      switch (feature) {
        case 'endTime':
          // End time is available in standard and advanced
          return complexity !== 'simple'
        case 'interval':
          // Show interval for all recurrence types in standard/advanced
          return complexity !== 'simple'
        case 'biweekly':
          // Bi-weekly is available in standard and advanced
          return complexity !== 'simple'
        case 'monthlyWeekday':
          // Monthly by weekday is advanced only
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

  return (
    <div style={styles.container} aria-label={ariaLabel} role="group">
      {/* Start Date */}
      <div style={styles.row}>
        <span style={styles.label}>Start Date:</span>
        <DatePicker
          value={parseDateString(value.startDate)}
          onChange={(date) => updateField('startDate', date ? formatDateString(date) : '')}
          readOnly={readOnly}
          placeholder="Select start date"
        />
      </div>

      {/* Start Time */}
      <div style={styles.row}>
        <span style={styles.label}>Start Time:</span>
        <input
          type="time"
          value={value.startTime}
          onChange={(e) => updateField('startTime', e.target.value)}
          disabled={readOnly}
          style={{
            ...styles.timeInput,
            opacity: readOnly ? 0.6 : 1,
          }}
          aria-label="Start time"
        />
      </div>

      {/* End Time (optional, standard/advanced only) */}
      {showFeature('endTime') && (
        <div style={styles.row}>
          <span style={styles.label}>End Time:</span>
          <input
            type="time"
            value={value.endTime}
            onChange={(e) => updateField('endTime', e.target.value)}
            disabled={readOnly}
            style={{
              ...styles.timeInput,
              opacity: readOnly ? 0.6 : 1,
            }}
            aria-label="End time"
          />
          <span style={styles.optionalText}>(optional, same day)</span>
        </div>
      )}

      {/* Timezone Selector (always visible) */}
      <div style={styles.row}>
        <span style={styles.label}>Timezone:</span>
        <div style={{ minWidth: '200px', maxWidth: '280px' }}>
          <ReactSelect
            options={timezoneOptions}
            value={timezoneOptions.find((opt) => opt.value === value.timezone)}
            onChange={(opt) => {
              const selected = opt as SelectOption | null
              if (selected) updateField('timezone', selected.value as string)
            }}
            disabled={readOnly}
            isClearable={false}
            isSearchable={true}
          />
        </div>
      </div>

      {/* Divider before recurrence section */}
      <div style={styles.sectionDivider}>
        {/* Recurrence Type Selector */}
        <div style={styles.row}>
          <span style={styles.label}>Repeats:</span>
          <div style={{ minWidth: '160px' }}>
            <ReactSelect
              options={availableTypes}
              value={availableTypes.find((opt) => opt.value === value.recurrenceType)}
              onChange={(opt) => {
                const selected = opt as SelectOption | null
                if (selected) handleRecurrenceTypeChange(selected.value as RecurrenceType)
              }}
              disabled={readOnly}
              isClearable={false}
              isSearchable={false}
            />
          </div>
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
                  <Pill
                    key={index}
                    pillStyle={isSelected ? 'dark' : 'light-gray'}
                    onClick={readOnly ? undefined : () => handleWeekdayToggle(index)}
                    aria-label={WEEKDAY_FULL_LABELS[index]}
                    aria-checked={isSelected}
                    size="small"
                  >
                    {label}
                  </Pill>
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
                <div style={{ minWidth: '80px' }}>
                  <ReactSelect
                    options={monthDayOptions}
                    value={monthDayOptions.find((opt) => opt.value === value.monthDay)}
                    onChange={(opt) => {
                      const selected = opt as SelectOption | null
                      if (selected) updateField('monthDay', selected.value as number)
                    }}
                    disabled={readOnly}
                    isClearable={false}
                    isSearchable={false}
                  />
                </div>
                <span style={styles.text}>of each month</span>
              </div>
            )}

            {/* Monthly mode toggle (advanced only) */}
            {showFeature('monthlyWeekday') && (
              <>
                <div style={styles.row}>
                  <span style={styles.label}>Mode:</span>
                  <div style={{ minWidth: '120px' }}>
                    <ReactSelect
                      options={monthlyModeOptions}
                      value={monthlyModeOptions.find((opt) => opt.value === value.monthlyMode)}
                      onChange={(opt) => {
                        const selected = opt as SelectOption | null
                        if (selected) updateField('monthlyMode', selected.value as 'date' | 'weekday')
                      }}
                      disabled={readOnly}
                      isClearable={false}
                      isSearchable={false}
                    />
                  </div>
                </div>

                {/* Monthly by weekday (e.g., 2nd Tuesday) */}
                {value.monthlyMode === 'weekday' && (
                  <div style={styles.row}>
                    <span style={styles.label}>On the:</span>
                    <div style={{ minWidth: '80px' }}>
                      <ReactSelect
                        options={weekNumberOptions}
                        value={weekNumberOptions.find(
                          (opt) => opt.value === rruleWeekToLabelIndex(value.weekNumber),
                        )}
                        onChange={(opt) => {
                          const selected = opt as SelectOption | null
                          if (selected)
                            updateField('weekNumber', weekLabelIndexToRRule(selected.value as number))
                        }}
                        disabled={readOnly}
                        isClearable={false}
                        isSearchable={false}
                      />
                    </div>
                    <div style={{ minWidth: '120px' }}>
                      <ReactSelect
                        options={weekdayOptions}
                        value={weekdayOptions.find((opt) => opt.value === value.weekdayOfMonth)}
                        onChange={(opt) => {
                          const selected = opt as SelectOption | null
                          if (selected) updateField('weekdayOfMonth', selected.value as number)
                        }}
                        disabled={readOnly}
                        isClearable={false}
                        isSearchable={false}
                      />
                    </div>
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
              <div style={{ minWidth: '100px' }}>
                <ReactSelect
                  options={endingTypeOptions}
                  value={endingTypeOptions.find((opt) => opt.value === value.endingType)}
                  onChange={(opt) => {
                    const selected = opt as SelectOption | null
                    if (selected)
                      updateField('endingType', selected.value as 'never' | 'count' | 'until')
                  }}
                  disabled={readOnly}
                  isClearable={false}
                  isSearchable={false}
                />
              </div>

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
                <DatePicker
                  value={parseDateString(value.untilDate)}
                  onChange={(date) => updateField('untilDate', date ? formatDateString(date) : '')}
                  readOnly={readOnly}
                  placeholder="Select end date"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Human-Readable Summary */}
      <div style={styles.summary} aria-live="polite">
        {getScheduleSummary(value)}
      </div>
    </div>
  )
}

export default ScheduleEditor
