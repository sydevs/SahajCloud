'use client'

import type { LengthStatus } from './lengthStatus'

import { WarningIcon } from '@payloadcms/ui'
import React from 'react'

export interface TranslationsRowProps {
  title: string
  description?: string
  englishValue: string
  isEnglish: boolean
  isLoadingEnglish?: boolean
  isErrorEnglish?: boolean
  /** Live character-length status for the current value(s); `null` = no limit. */
  length?: LengthStatus | null
  children: React.ReactNode
}

export const TranslationsRow: React.FC<TranslationsRowProps> = ({
  title,
  description,
  englishValue,
  isEnglish,
  isLoadingEnglish,
  isErrorEnglish,
  length,
  children,
}) => {
  let englishCell: React.ReactNode = null
  if (!isEnglish) {
    if (isLoadingEnglish) {
      englishCell = (
        <div className="translations-row__english translations-row__english--placeholder">
          Loading...
        </div>
      )
    } else if (isErrorEnglish) {
      englishCell = (
        <div className="translations-row__english translations-row__english--placeholder">
          Reference unavailable
        </div>
      )
    } else {
      englishCell = (
        <div className="translations-row__english">
          {englishValue ? `English: "${englishValue}"` : ''}
        </div>
      )
    }
  }

  return (
    <div className="translations-row">
      <div className="translations-row__header">
        <div className="translations-row__title">{title}</div>
        {description && <div className="translations-row__description">{description}</div>}
      </div>
      <div className="translations-row__input-cell">
        {children}
        {/* Advisory only — the value still saves when over the limit. Shows the
            limit as a reference until exceeded, then the live count + a warning
            so the translator can see how far over they are. */}
        {length && (
          <div
            className={['translations-row__length', length.over && 'translations-row__length--over']
              .filter(Boolean)
              .join(' ')}
          >
            {length.over && <WarningIcon />}
            {length.over
              ? `${length.length} / ${length.maxLength} characters`
              : `max ${length.maxLength} characters`}
          </div>
        )}
        {englishCell}
      </div>
    </div>
  )
}
