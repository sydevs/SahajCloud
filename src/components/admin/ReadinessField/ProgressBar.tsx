'use client'

import type { SummaryTone } from './summary'

import React from 'react'

import { summaryTone } from './summary'

interface ProgressBarProps {
  passing: number
  total: number
  unit?: string
  /**
   * When provided, the fill color follows this tone (so the bar matches its
   * section's status icon). Otherwise the color is derived from the ratio.
   */
  tone?: SummaryTone
}

function toneToFill(tone: SummaryTone): string {
  switch (tone) {
    case 'success':
      return 'var(--theme-success-500, #10b981)'
    case 'danger':
      return 'var(--theme-error-500, #ef4444)'
    case 'warning':
      return 'var(--theme-warning-500, #f59e0b)'
    case 'neutral':
    default:
      return 'var(--theme-elevation-400)'
  }
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  passing,
  total,
  unit = 'ready',
  tone,
}) => {
  const percent = total === 0 ? 0 : Math.round((passing / total) * 100)
  const allPassing = total > 0 && passing === total
  const fillColor = toneToFill(tone ?? summaryTone(passing, total))

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.5)',
        marginTop: 'calc(var(--base) * 0.15)',
      }}
    >
      <div
        style={{
          flex: 1,
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
            background: fillColor,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <span
        style={{
          flexShrink: 0,
          fontSize: '1.25em',
          color: 'var(--theme-elevation-600)',
          whiteSpace: 'nowrap',
        }}
      >
        {allPassing ? (
          <>
            {passing} of {total} {unit}
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--theme-elevation-800)' }}>{passing}</strong> of {total}{' '}
            {unit}
          </>
        )}
      </span>
    </div>
  )
}
