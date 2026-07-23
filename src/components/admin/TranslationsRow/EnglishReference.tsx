'use client'

import React from 'react'

export interface EnglishReferenceProps {
  /** The English value to show as a reference; empty renders nothing. */
  value: string
  /** Editing English itself — no reference is shown. */
  isEnglish: boolean
  isLoading?: boolean
  isError?: boolean
}

/**
 * The muted "English: …" reference shown under a non-English input. Shared by
 * the single-input row and each plural sub-input so they read identically.
 */
export const EnglishReference: React.FC<EnglishReferenceProps> = ({
  value,
  isEnglish,
  isLoading,
  isError,
}) => {
  if (isEnglish) return null
  if (isLoading) {
    return (
      <div className="translations-row__english translations-row__english--placeholder">
        Loading...
      </div>
    )
  }
  if (isError) {
    return (
      <div className="translations-row__english translations-row__english--placeholder">
        Reference unavailable
      </div>
    )
  }
  if (!value) return null
  return <div className="translations-row__english">{`English: "${value}"`}</div>
}
