/**
 * Shared styles for ScheduleField components
 *
 * Uses PayloadCMS CSS variables for theme consistency.
 * Most form elements now use PayloadCMS UI components (ReactSelect, DatePicker, Pill).
 */

import type { CSSProperties } from 'react'

/**
 * Base input style shared across native input elements (time, number)
 */
const baseInputStyle = {
  padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  fontFamily: 'var(--font-body)',
  backgroundColor: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-elevation-800)',
} as const

/**
 * Style definitions for ScheduleEditor component
 */
export const scheduleEditorStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.75)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.5)',
  },
  sectionDivider: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.5)',
    paddingTop: 'calc(var(--base) * 0.5)',
    marginTop: 'calc(var(--base) * 0.25)',
    borderTop: '1px solid var(--theme-elevation-100)',
  },
  row: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: 'calc(var(--base) * 0.5)',
    flexWrap: 'wrap' as const,
  },
  label: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontWeight: 500 as const,
    color: 'var(--theme-elevation-800)',
    minWidth: '80px',
  },
  input: {
    ...baseInputStyle,
    width: '80px',
  },
  timeInput: {
    ...baseInputStyle,
    minWidth: '100px',
  },
  weekdayContainer: {
    display: 'flex',
    gap: 'calc(var(--base) * 0.25)',
    flexWrap: 'wrap' as const,
  },
  summary: {
    padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.75)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-s)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-700)',
    fontStyle: 'italic' as const,
  },
  text: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-600)',
  },
  optionalText: {
    fontSize: 'calc(var(--base-body-size) * 0.9px)',
    color: 'var(--theme-elevation-400)',
    fontStyle: 'italic' as const,
  },
} as const satisfies Record<string, CSSProperties>
