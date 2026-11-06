'use client'

import React from 'react'

import type { Tone } from '@/components/admin/helpers/tones'
import { ratioTone } from '@/components/admin/helpers/tones'
import { Progress } from '@/components/admin/Progress'

interface ProgressBarProps {
  passing: number
  total: number
  unit?: string
  /**
   * When provided, the fill color follows this tone (so the bar matches its
   * section's status icon). Otherwise the color is derived from the ratio.
   */
  tone?: Tone
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  passing,
  total,
  unit = 'ready',
  tone,
}) => {
  const allPassing = total > 0 && passing === total

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.5)',
        marginTop: 'calc(var(--base) * 0.15)',
      }}
    >
      <Progress label={unit} max={total} tone={tone ?? ratioTone(passing, total)} value={passing} />
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
