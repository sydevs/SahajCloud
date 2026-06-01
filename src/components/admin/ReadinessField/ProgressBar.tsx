'use client'

import React from 'react'

interface ProgressBarProps {
  passing: number
  total: number
  unit?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ passing, total, unit = 'ready' }) => {
  const percent = total === 0 ? 0 : Math.round((passing / total) * 100)
  const allPassing = total > 0 && passing === total
  const fillColor = allPassing
    ? 'var(--theme-success-500, #10b981)'
    : passing === 0
      ? 'var(--theme-error-500, #ef4444)'
      : 'var(--theme-warning-500, #f59e0b)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.5)',
        marginTop: 'calc(var(--base) * 0.25)',
      }}
    >
      <div
        style={{
          flex: 1,
          height: '3px',
          borderRadius: '2px',
          background: 'var(--theme-elevation-100)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: '2px',
            background: fillColor,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <span
        style={{
          flexShrink: 0,
          fontSize: 'calc(var(--base-body-size) * 0.85px)',
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
