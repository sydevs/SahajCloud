import React from 'react'

export type ProgressTone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_COLORS: Record<ProgressTone, string> = {
  success: 'var(--theme-success-500)',
  warning: 'var(--theme-warning-500)',
  danger: 'var(--theme-error-500)',
  neutral: 'var(--theme-elevation-400)',
}

/**
 * A determinate progress bar: a native `<progress>`, which carries its value to
 * assistive technology as no styled div does, coloured through `accent-color`.
 *
 * ⚠ **`max={0}` is invalid, and leaving both attributes off draws an
 * indeterminate bar**, so a total of nothing is drawn as none of one.
 */
export function Progress({
  value,
  max,
  tone = 'success',
  label,
}: {
  value: number
  max: number
  tone?: ProgressTone
  label: string
}): React.ReactElement {
  return (
    <progress
      aria-label={label}
      max={max > 0 ? max : 1}
      style={{ width: '100%', height: 'calc(var(--base) * 0.4)', accentColor: TONE_COLORS[tone] }}
      value={max > 0 ? value : 0}
    />
  )
}
