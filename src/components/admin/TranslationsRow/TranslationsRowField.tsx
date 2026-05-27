'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldError, FieldLabel, useField, useLocale } from '@payloadcms/ui'
import React, { useCallback, useMemo } from 'react'

import { TranslationsRow } from './TranslationsRow'
import { useEnglishTranslation } from './useEnglishTranslation'

interface SchemaEntry {
  key: string
  description: string
}

function toTitleCase(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: 'calc(var(--base) * 0.4)',
  background: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-text)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  fontFamily: 'inherit',
}

const inputReadOnlyStyle: React.CSSProperties = {
  ...inputBaseStyle,
  background: 'var(--theme-elevation-50)',
  cursor: 'not-allowed',
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

export const TranslationsRowField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, localized, required, admin: { custom } = {} } = field

  const schemaEntries = useMemo<SchemaEntry[]>(
    () => (custom?.schemaEntries as SchemaEntry[] | undefined) ?? [],
    [custom?.schemaEntries],
  )
  const globalSlug = (custom?.globalSlug as string | undefined) ?? null

  const { value, setValue, showError } = useField<Record<string, string>>()
  const locale = useLocale()
  const isEnglish = locale?.code === 'en'

  const { data, isLoading, isError } = useEnglishTranslation(isEnglish ? null : globalSlug)
  const englishMap = (data && typeof data === 'object' ? (data as Record<string, unknown>)[name] : null) as
    | Record<string, string>
    | null

  const handleChange = useCallback(
    (key: string, next: string) => {
      setValue({ ...(value ?? {}), [key]: next })
    },
    [setValue, value],
  )

  return (
    <div
      className={['field-type', 'json', showError && 'error', readOnly && 'read-only']
        .filter(Boolean)
        .join(' ')}
    >
      <FieldLabel label={label} localized={localized} path={name} required={required} />
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        {schemaEntries.length === 0 ? (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-elevation-500)',
            }}
          >
            No translation keys defined in schema.
          </div>
        ) : (
          <div style={wrapStyle}>
            {schemaEntries.map((entry) => {
              const englishValue = isEnglish ? '' : englishMap?.[entry.key] ?? ''
              const currentValue = value?.[entry.key] ?? ''
              return (
                <TranslationsRow
                  key={entry.key}
                  title={toTitleCase(entry.key)}
                  description={entry.description || undefined}
                  englishValue={englishValue}
                  isEnglish={isEnglish}
                  isLoadingEnglish={isLoading}
                  isErrorEnglish={isError}
                >
                  <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => handleChange(entry.key, e.target.value)}
                    disabled={readOnly}
                    style={readOnly ? inputReadOnlyStyle : inputBaseStyle}
                    aria-label={`Translation for ${entry.key}`}
                    placeholder={
                      isEnglish ? 'Enter translation...' : englishValue || 'Enter translation...'
                    }
                  />
                </TranslationsRow>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default TranslationsRowField
