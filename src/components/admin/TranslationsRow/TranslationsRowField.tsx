'use client'

import type { JSONFieldClientComponent } from 'payload'

import { Collapsible, FieldError, FieldLabel, useField, useLocale } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { Fragment, useCallback, useMemo } from 'react'

import { AutoGrowTextarea } from './AutoGrowTextarea'
import { TranslationsRow } from './TranslationsRow'
import { useEnglishTranslation } from './useEnglishTranslation'

import './styles.css'

interface SchemaEntry {
  key: string
  description: string
  section?: string
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

  /**
   * Consecutive entries sharing a `section` become one group, in schema order
   * (which is authored to match the screen). Keys with no section stay
   * ungrouped and, by convention, come first.
   */
  const sections = useMemo(() => {
    const out: { name?: string; entries: SchemaEntry[] }[] = []
    for (const entry of schemaEntries) {
      const last = out[out.length - 1]
      if (last && last.name === entry.section) last.entries.push(entry)
      else out.push({ name: entry.section, entries: [entry] })
    }
    return out
  }, [schemaEntries])

  const handleChange = useCallback(
    (key: string, next: string) => {
      setValue({ ...(value ?? {}), [key]: next })
    },
    [setValue, value],
  )

  const renderRow = useCallback(
    (entry: SchemaEntry) => {
      const englishValue = isEnglish ? '' : (englishMap?.[entry.key] ?? '')
      const currentValue = value?.[entry.key] ?? ''
      return (
        <TranslationsRow
          key={entry.key}
          title={toWords(entry.key.replace(/_/g, '-'))}
          description={entry.description || undefined}
          englishValue={englishValue}
          isEnglish={isEnglish}
          isLoadingEnglish={isLoading}
          isErrorEnglish={isError}
        >
          <AutoGrowTextarea
            value={currentValue}
            onChange={(next) => handleChange(entry.key, next)}
            readOnly={readOnly}
            placeholder={
              englishValue ? `Enter translation — "${englishValue}"` : 'Enter translation…'
            }
            ariaLabel={`Translation for ${entry.key}`}
          />
        </TranslationsRow>
      )
    },
    [englishMap, handleChange, isEnglish, isError, isLoading, readOnly, value],
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
          sections.map((section) => {
            const rows = section.entries.map((entry) => renderRow(entry))
            // Unsectioned keys render bare; a section gets Payload's own
            // Collapsible, the same grouping element the admin uses elsewhere.
            if (!section.name) return <Fragment key="__unsectioned">{rows}</Fragment>
            return (
              <Collapsible key={section.name} header={section.name} initCollapsed={false}>
                {rows}
              </Collapsible>
            )
          })
        )}
      </div>
    </div>
  )
}

export default TranslationsRowField
