'use client'

import React from 'react'

interface ExternalLinkIconProps {
  size?: number
  style?: React.CSSProperties
}

export const ExternalLinkIcon: React.FC<ExternalLinkIconProps> = ({ size = 12, style }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.5"
    style={style}
    viewBox="0 0 12 12"
    width={size}
  >
    <path d="M4 1h7v7" />
    <path d="M11 1L4.5 7.5" />
  </svg>
)
