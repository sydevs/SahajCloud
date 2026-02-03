/**
 * Shared styles for EventTimingField components
 *
 * Uses PayloadCMS CSS variables for theme consistency.
 */

import type { CSSProperties } from 'react'

/**
 * Style definitions for EventTimingEditor component
 */
export const eventTimingEditorStyles = {
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
  select: {
    padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    cursor: 'pointer',
    minWidth: '120px',
  },
  timezoneSelect: {
    padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    cursor: 'pointer',
    minWidth: '200px',
    maxWidth: '280px',
  },
  input: {
    padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    width: '80px',
  },
  dateInput: {
    padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    minWidth: '140px',
  },
  timeInput: {
    padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.6)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--theme-input-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    color: 'var(--theme-elevation-800)',
    minWidth: '100px',
  },
  weekdayContainer: {
    display: 'flex',
    gap: 'calc(var(--base) * 0.25)',
    flexWrap: 'wrap' as const,
  },
  weekdayButton: {
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: 'calc(var(--base) * 2)',
    height: 'calc(var(--base) * 2)',
    padding: 0,
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 'var(--style-radius-s)',
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    fontWeight: 500 as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
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
