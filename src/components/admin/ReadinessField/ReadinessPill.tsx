'use client'

import type { SummaryTone } from './summary'

import { Pill } from '@payloadcms/ui'
import React from 'react'

interface ReadinessPillProps {
  tone: SummaryTone
}

const ICONS: Record<SummaryTone, React.ReactNode> = {
  success: (
    <svg
      aria-hidden="true"
      fill="none"
      height="10"
      viewBox="0 0 10 10"
      width="10"
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
  ),
  warning: (
    <svg
      aria-hidden="true"
      fill="none"
      height="10"
      viewBox="0 0 10 10"
      width="10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 1 A4 4 0 0 1 5 9 Z" fill="currentColor" />
    </svg>
  ),
  danger: (
    <svg
      aria-hidden="true"
      fill="none"
      height="10"
      viewBox="0 0 10 10"
      width="10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  ),
  neutral: (
    <svg
      aria-hidden="true"
      height="10"
      viewBox="0 0 10 10"
      width="10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="5" cy="5" fill="currentColor" r="2.5" />
    </svg>
  ),
}

const ARIA_LABELS: Record<SummaryTone, string> = {
  success: 'All passing',
  warning: 'Partially ready',
  danger: 'Not ready',
  neutral: 'Not started',
}

const PILL_STYLES: Record<SummaryTone, string> = {
  success: 'success',
  warning: 'warning',
  danger: 'error',
  neutral: 'light-gray',
}

export const ReadinessPill: React.FC<ReadinessPillProps> = ({ tone }) => (
  <Pill
    aria-label={ARIA_LABELS[tone]}
    icon={ICONS[tone]}
    pillStyle={PILL_STYLES[tone]}
    size="small"
  />
)
