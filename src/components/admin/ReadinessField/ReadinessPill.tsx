'use client'

import type { SummaryTone } from './summary'

import React from 'react'

import { toneToColor } from './summary'

interface ReadinessPillProps {
  tone: SummaryTone
  size?: 'default' | 'large'
}

function getIcon(tone: SummaryTone, size: number): React.ReactNode {
  switch (tone) {
    case 'success':
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height={size}
          viewBox="0 0 10 10"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1.5 5L3.5 7.5L8.5 2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      )
    case 'warning':
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height={size}
          viewBox="0 0 10 10"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1 A4 4 0 0 1 5 9 Z" fill="currentColor" />
        </svg>
      )
    case 'danger':
      return (
        <svg
          aria-hidden="true"
          fill="none"
          height={size}
          viewBox="0 0 10 10"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 2L8 8M8 2L2 8"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      )
    case 'neutral':
      return (
        <svg
          aria-hidden="true"
          height={size}
          viewBox="0 0 10 10"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="5" cy="5" fill="currentColor" r="2.5" />
        </svg>
      )
  }
}

const ARIA_LABELS: Record<SummaryTone, string> = {
  success: 'All passing',
  warning: 'Partially ready',
  danger: 'Not ready',
  neutral: 'Not started',
}

export const ReadinessPill: React.FC<ReadinessPillProps> = ({ tone, size = 'default' }) => {
  const { bg, fg, border } = toneToColor(tone)
  const pillSize = size === 'large' ? 30 : 20
  const iconSize = size === 'large' ? 15 : 10
  return (
    <span
      aria-label={ARIA_LABELS[tone]}
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${pillSize}px`,
        height: `${pillSize}px`,
        borderRadius: '50%',
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        flexShrink: 0,
      }}
    >
      {getIcon(tone, iconSize)}
    </span>
  )
}
