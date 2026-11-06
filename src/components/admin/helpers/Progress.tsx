import type { Tone } from './tones'

import React from 'react'

import { TONE_COLORS } from './tones'

/**
 * A determinate progress bar: a thin rounded track, filled in its tone.
 *
 * Drawn as divs rather than a native `<progress>`, whose track and fill each
 * browser paints its own way, and given the `progressbar` role so assistive
 * technology still reads its value. A total of nothing is drawn empty.
 */
export function Progress({
  value,
  max,
  tone = 'success',
  label,
}: {
  value: number
  max: number
  tone?: Tone
  label: string
}): React.ReactElement {
  const percent = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0

  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={max > 0 ? value : 0}
      role="progressbar"
      style={{
        flex: 1,
        width: '100%',
        height: '6px',
        borderRadius: '3px',
        background: 'var(--theme-elevation-200)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '3px',
          background: TONE_COLORS[tone],
          transition: 'width 0.2s ease',
        }}
      />
    </div>
  )
}
