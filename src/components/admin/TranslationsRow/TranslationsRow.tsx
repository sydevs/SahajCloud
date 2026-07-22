'use client'

import type { BudgetStatus } from './charBudget'

import { WarningIcon } from '@payloadcms/ui'
import React from 'react'

export interface TranslationsRowProps {
  title: string
  description?: string
  englishValue: string
  isEnglish: boolean
  isLoadingEnglish?: boolean
  isErrorEnglish?: boolean
  /** Live character-budget status for the current value; `null` = no budget. */
  budget?: BudgetStatus | null
  children: React.ReactNode
}

export const TranslationsRow: React.FC<TranslationsRowProps> = ({
  title,
  description,
  englishValue,
  isEnglish,
  isLoadingEnglish,
  isErrorEnglish,
  budget,
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
        {/* Advisory only — the value still saves when over budget. Shows the
            budget as a reference until exceeded, then the live count + a
            warning so the translator can see how far over they are. */}
        {budget && (
          <div
            className={['translations-row__budget', budget.over && 'translations-row__budget--over']
              .filter(Boolean)
              .join(' ')}
          >
            {budget.over && <WarningIcon />}
            {budget.over
              ? `${budget.length} / ${budget.budget} characters`
              : `max ${budget.budget} characters`}
          </div>
        )}
        {englishCell}
      </div>
    </div>
  )
}
