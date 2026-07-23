'use client'

import React from 'react'

import { AutoGrowTextarea } from './AutoGrowTextarea'
import { EnglishReference } from './EnglishReference'
import { pluralExampleForCategory } from './plural'

export interface PluralInputsProps {
  /** Base key; each category is stored at `<baseKey>_<category>`. */
  baseKey: string
  /** Locale being edited — drives the category labels' example counts. */
  localeCode: string
  /** The categories this locale uses (already ordered), from `plural.ts`. */
  categories: string[]
  isEnglish: boolean
  values: Record<string, string>
  englishMap: Record<string, string> | null
  isLoadingEnglish?: boolean
  isErrorEnglish?: boolean
  readOnly?: boolean
  onChange: (storageKey: string, next: string) => void
}

/**
 * The specialized plural interface: one labeled input per CLDR category the
 * current locale uses. Each label names the category and, where a whole number
 * selects it, an example count ("the count it is for"). The row's single length
 * counter (in `TranslationsRow`) spans all of these.
 */
export const PluralInputs: React.FC<PluralInputsProps> = ({
  baseKey,
  localeCode,
  categories,
  isEnglish,
  values,
  englishMap,
  isLoadingEnglish,
  isErrorEnglish,
  readOnly,
  onChange,
}) => {
  return (
    <div className="translations-row__plural">
      {categories.map((category) => {
        const storageKey = `${baseKey}_${category}`
        const example = pluralExampleForCategory(localeCode, category)
        return (
          <div key={category} className="translations-row__plural-item">
            <div className="translations-row__plural-label">
              <span className="translations-row__plural-cat">{category}</span>
              {example !== null && (
                <span className="translations-row__plural-eg">e.g. {example}</span>
              )}
            </div>
            <AutoGrowTextarea
              value={values[storageKey] ?? ''}
              onChange={(next) => onChange(storageKey, next)}
              readOnly={readOnly}
              placeholder="Enter translation..."
              ariaLabel={`Translation for ${storageKey} (${category})`}
            />
            <EnglishReference
              value={isEnglish ? '' : (englishMap?.[storageKey] ?? '')}
              isEnglish={isEnglish}
              isLoading={isLoadingEnglish}
              isError={isErrorEnglish}
            />
          </div>
        )
      })}
    </div>
  )
}
