'use client'

import React from 'react'

import { erroredBannerStyle } from './styles'

interface ErroredStatusProps {
  error: string
}

export const ErroredStatus: React.FC<ErroredStatusProps> = ({ error }) => (
  <div role="alert" style={erroredBannerStyle}>
    <strong>Group failed to evaluate.</strong>
    <div style={{ marginTop: 'calc(var(--base) * 0.25)' }}>{error}</div>
  </div>
)
