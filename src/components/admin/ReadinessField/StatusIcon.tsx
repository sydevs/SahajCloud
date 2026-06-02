'use client'

import React from 'react'

interface StatusIconProps {
  passed: boolean
  title?: string
}

export const StatusIcon: React.FC<StatusIconProps> = ({ passed, title }) => {
  const color = passed
    ? 'var(--theme-success-500, #10b981)'
    : 'var(--theme-error-500, #ef4444)'
  const label = passed ? 'Passing' : 'Failing'
  return (
    <span
      role="img"
      aria-label={label}
      title={title ?? label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {passed ? (
          <path
            d="M3 8.5L6.5 12L13 5"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <line
              x1="4"
              y1="4"
              x2="12"
              y2="12"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="12"
              y1="4"
              x2="4"
              y2="12"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </span>
  )
}
