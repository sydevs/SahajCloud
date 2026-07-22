'use client'

import type { LengthStatus } from './lengthStatus'

import { FieldDescription, WarningIcon } from '@payloadcms/ui'
import React from 'react'

export interface TranslationsRowProps {
  title: string
  description?: string
  /** Field path — namespaces the rendered FieldDescription (required by it). */
  path: string
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
  path,
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
    } else if (englishValue) {
      englishCell = <div className="translations-row__english">{`English: "${englishValue}"`}</div>
    }
  }

  return (
    <div className="translations-row">
      <div className="translations-row__header">
        <div className="translations-row__title">{title}</div>
        {/* Payload's own field-description component, for a consistent look. */}
        <FieldDescription
          className="translations-row__description"
          description={description}
          path={path}
        />
      </div>
      <div className="translations-row__input-cell">
        {children}
        {/* Advisory only — the value still saves when over the limit. Reuses the
            field-description style, and stays one line high in both states (the
            icon is sized to the text line) so going over never shifts the row. */}
        {length && (
          <div
            className={[
              'field-description',
              'translations-row__length',
              length.over && 'translations-row__length--over',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {length.over && <WarningIcon />}
            <span>
              {length.over
                ? `${length.length} / ${length.maxLength} characters`
                : `max ${length.maxLength} characters`}
            </span>
          </div>
        )}
        {englishCell}
      </div>
    </div>
  )
}
