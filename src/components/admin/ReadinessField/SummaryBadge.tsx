'use client'

import React from 'react'

import { summaryTone, toneToColor, type SummaryTone } from './summary'

interface SummaryBadgeProps {
  passing: number
  total: number
  /** Prefix shown before the ratio (e.g. "optional"). */
  prefix?: string
  /** Force a tone instead of deriving from passing/total. */
  tone?: SummaryTone
  /** When true, render without a colored background — used for inline group rows. */
  subtle?: boolean
}

/**
 * Colored badge of the form `passing / total`. Tone derives from the ratio:
 * green = all passing, red = none passing, amber = mixed, neutral = empty.
 */
export const SummaryBadge: React.FC<SummaryBadgeProps> = ({
  passing,
  total,
  prefix,
  tone,
  subtle = false,
}) => {
  const resolvedTone = tone ?? summaryTone(passing, total)
  const { bg, fg, border } = toneToColor(resolvedTone)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 'calc(var(--base) * 0.1) calc(var(--base) * 0.35)',
        background: subtle ? 'transparent' : bg,
        color: fg,
        border: subtle ? 'none' : `1px solid ${border}`,
        borderRadius: 'var(--style-radius-s)',
        fontSize: 'calc(var(--base-body-size) * 0.85px)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {prefix ? `${prefix}: ` : null}
      {passing}/{total}
    </span>
  )
}
