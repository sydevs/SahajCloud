'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField, useLocale, usePayloadAPI } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { TranslationsTable, type TranslationEntry } from './TranslationsTable'

export const TranslationsTableField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    localized,
    required,
    admin: { description, custom } = {},
  } = field

  const { value, setValue, showError } = useField<Record<string, string>>()
  const locale = useLocale()

  // Get schema entries from custom field config (memoized to avoid reference changes)
  const schemaEntries = useMemo(
    () => (custom?.schemaEntries as TranslationEntry[]) || [],
    [custom?.schemaEntries],
  )

  // Fetch English translations when not in English locale
  const globalSlug = custom?.globalSlug as string
  const isEnglish = locale?.code === 'en'

  const [{ data: englishData, isLoading, isError }] = usePayloadAPI(
    !isEnglish && globalSlug ? `/api/globals/${globalSlug}?locale=en&depth=0` : '',
  )

  // Merge English values into entries when available
  const entries = useMemo(() => {
    // Field name is the group slug (e.g., 'common', 'navigation')
    const fieldData = englishData?.[name] as Record<string, string> | undefined
    if (isEnglish || !fieldData) return schemaEntries
    return schemaEntries.map((entry) => ({
      ...entry,
      englishValue: fieldData[entry.key] || entry.key,
    }))
  }, [schemaEntries, isEnglish, englishData, name])

  // Handle value changes
  const handleChange = (newValue: Record<string, string>) => {
    setValue(newValue)
  }

  // Build CSS classes following PayloadCMS conventions
  const fieldClasses = ['field-type', 'json', showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  // Generate aria-label for accessibility
  const ariaLabel =
    typeof label === 'string'
      ? label
      : typeof label === 'object' && label !== null
        ? (label as Record<string, string>)['en'] || Object.values(label as Record<string, string>)[0] || name
        : name

  return (
    <div className={fieldClasses} id={fieldId} aria-label={ariaLabel}>
      <FieldLabel label={label} localized={localized} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        {isLoading && !isEnglish ? (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-elevation-500)',
            }}
          >
            Loading English translations...
          </div>
        ) : entries.length === 0 ? (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-elevation-500)',
            }}
          >
            No translation keys defined in schema.
          </div>
        ) : (
          <>
            {isError && !isEnglish && (
              <div
                style={{
                  padding: 'calc(var(--base) * 0.5)',
                  marginBottom: 'calc(var(--base) * 0.5)',
                  color: 'var(--theme-error-500)',
                  fontSize: '0.875rem',
                }}
              >
                Failed to load English translations. Reference values unavailable.
              </div>
            )}
            <TranslationsTable
              entries={entries}
              value={value || {}}
              onChange={handleChange}
              readOnly={readOnly}
              isEnglish={isEnglish}
            />
          </>
        )}
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TranslationsTableField
