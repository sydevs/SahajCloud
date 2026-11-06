import type { Tone } from './tones'

import React from 'react'

import { TONE_COLORS } from './tones'

/**
 * How far along the thing a badge numbers is: `solid` once it has an answer,
 * `outline` while it is still to come, `dashed` when it is out of reach.
 */
export type NumberBadgeFill = 'solid' | 'outline' | 'dashed'

/**
 * A small numbered circle in one tone, for a list of steps read in order.
 *
 * Decorative: the number repeats the list's own order, so it is hidden from
 * assistive technology and the label beside it carries the meaning.
 */
export function NumberBadge({
  value,
  tone = 'neutral',
  fill = 'solid',
}: {
  value: React.ReactNode
  tone?: Tone
  fill?: NumberBadgeFill
}): React.ReactElement {
  const color = TONE_COLORS[tone]

  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        display: 'inline-grid',
        placeItems: 'center',
        width: '20px',
        height: '20px',
        border: `1.5px ${fill === 'dashed' ? 'dashed' : 'solid'} ${color}`,
        borderRadius: '50%',
        background: fill === 'solid' ? color : 'transparent',
        color: fill === 'solid' ? 'var(--theme-elevation-0)' : color,
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {value}
    </span>
  )
}
