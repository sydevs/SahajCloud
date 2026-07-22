'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldError, FieldLabel, useField, useLocale } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useCallback, useMemo } from 'react'

import { AutoGrowTextarea } from './AutoGrowTextarea'
import { lengthStatus } from './lengthStatus'
import { TranslationsRow } from './TranslationsRow'
import { useEnglishTranslation } from './useEnglishTranslation'

import './styles.css'

interface SchemaEntry {
  key: string
  description: string
  maxLength?: number
}

export const TranslationsRowField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, localized, required, admin: { custom } = {} } = field

  const schemaEntries = useMemo<SchemaEntry[]>(
    () => (custom?.schemaEntries as SchemaEntry[] | undefined) ?? [],
    [custom?.schemaEntries],
  )
  const globalSlug = (custom?.globalSlug as string | undefined) ?? null
  const parentGroup = (custom?.parentGroup as string | undefined) ?? null

  const { value, setValue, showError } = useField<Record<string, string>>()
  const locale = useLocale()
  const isEnglish = locale?.code === 'en'

  const { data, isLoading, isError } = useEnglishTranslation(isEnglish ? null : globalSlug)
  const englishMap = useMemo(() => {
    if (!data || typeof data !== 'object') return null
    const root = data as Record<string, unknown>
    const container = parentGroup
      ? (root[parentGroup] as Record<string, unknown> | undefined)
      : root
    return (container?.[name] ?? null) as Record<string, string> | null
  }, [data, name, parentGroup])

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
          schemaEntries.map((entry) => {
            const englishValue = isEnglish ? '' : (englishMap?.[entry.key] ?? '')
            const currentValue = value?.[entry.key] ?? ''
            return (
              <TranslationsRow
                key={entry.key}
                title={toWords(entry.key.replace(/_/g, '-'))}
                description={entry.description || undefined}
                path={`${name}.${entry.key}`}
                englishValue={englishValue}
                isEnglish={isEnglish}
                isLoadingEnglish={isLoading}
                isErrorEnglish={isError}
                length={lengthStatus(currentValue, entry.maxLength)}
              >
                <AutoGrowTextarea
                  value={currentValue}
                  onChange={(next) => handleChange(entry.key, next)}
                  readOnly={readOnly}
                  placeholder="Enter translation..."
                  ariaLabel={`Translation for ${entry.key}`}
                />
              </TranslationsRow>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TranslationsRowField
