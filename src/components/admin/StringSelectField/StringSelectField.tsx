'use client'

import type { TextFieldClientComponent } from 'payload'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  useField,
} from '@payloadcms/ui'
import React from 'react'

import { getCountryOptions, getRegionOptions, type GeographyOption } from '@/lib/geography'

interface StringSelectCustom {
  source?: 'country' | 'region'
  /** For `region`: the sibling field name holding the country code (default 'country'). */
  dependsOn?: string
}

/** Replace the last segment of a dotted path (e.g. `address.region` → `address.country`). */
function toSiblingPath(path: string, siblingName: string): string {
  const parts = path.split('.')
  parts[parts.length - 1] = siblingName
  return parts.join('.')
}

/**
 * Searchable dropdown backed by a plain `text` column (no Postgres enum) — a
 * thin wrapper around Payload's `ReactSelect`. Mode comes from `admin.custom`:
 *
 *  - `{ source: 'country' }` — the full country list.
 *  - `{ source: 'region', dependsOn: 'country' }` — subdivisions of the sibling
 *    country; disabled with a "Select a country first" placeholder until one is
 *    chosen. The sibling path is derived from this field's own path, so it works
 *    nested inside a group (e.g. `address`).
 */
export const StringSelectField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { label, localized, required, admin: { description, custom } = {} } = field
  const config = (custom ?? {}) as StringSelectCustom
  const isRegion = config.source === 'region'

  const { value, setValue, showError } = useField<string | null>({ path })

  // Read the sibling country reactively. In country mode this resolves to our
  // own path (the value is unused) so the hook is still called unconditionally.
  const dependencyPath = isRegion ? toSiblingPath(path, config.dependsOn ?? 'country') : path
  const { value: countryValue } = useField<string | null>({ path: dependencyPath })

  const options: GeographyOption[] = isRegion ? getRegionOptions(countryValue) : getCountryOptions()
  const disabled = Boolean(readOnly) || (isRegion && !countryValue)
  const selected = options.find((option) => option.value === value) ?? null

  const fieldClasses = [
    'field-type',
    'select',
    'string-select',
    showError && 'error',
    disabled && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fieldClasses} id={`field-${path.replace(/\./g, '__')}`}>
      <FieldLabel label={label} localized={localized} path={path} required={required} />
      <div className="field-type__wrap">
        <FieldError path={path} showError={showError} />
        <ReactSelect
          options={options as unknown as ReactSelectOption[]}
          value={(selected ?? undefined) as unknown as ReactSelectOption | undefined}
          onChange={(option) =>
            setValue((option as unknown as GeographyOption | null)?.value ?? null)
          }
          disabled={disabled}
          isClearable={!required}
          placeholder={isRegion && !countryValue ? 'Select a country first' : undefined}
        />
        <FieldDescription description={description} path={path} />
      </div>
    </div>
  )
}

export default StringSelectField
