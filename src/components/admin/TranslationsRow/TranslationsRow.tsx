'use client'

import React from 'react'

export interface TranslationsRowProps {
  title: string
  description?: string
  englishValue: string
  isEnglish: boolean
  isLoadingEnglish?: boolean
  isErrorEnglish?: boolean
  children: React.ReactNode
}

export const TranslationsRow: React.FC<TranslationsRowProps> = ({
  title,
  description,
  englishValue,
  isEnglish,
  isLoadingEnglish,
  isErrorEnglish,
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
    <div className="translations-row" data-locale={isEnglish ? 'en' : 'other'}>
      <div className="translations-row__header">
        <div className="translations-row__title">{title}</div>
        {description && <div className="translations-row__description">{description}</div>}
      </div>
      {englishCell}
      <div className="translations-row__input-cell">{children}</div>
    </div>
  )
}
