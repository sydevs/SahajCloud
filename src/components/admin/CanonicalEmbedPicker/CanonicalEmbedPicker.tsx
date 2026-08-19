'use client'

import type { TextFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, ReactSelect, useAllFormFields, useField } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'

import { buildPickerModel } from './model'

/**
 * Choose which reported embed owns the canonical URLs.
 *
 * The options come from the sibling `embedMetadata` JSON, read reactively via
 * `useAllFormFields` (same idiom as `ScheduleSummary`) so a report arriving
 * while the document is open shows up without a reload. Everything derived —
 * option status, cautions — comes from `./model`, which is where the logic is
 * tested.
 *
 * When nothing has been reported the field renders *why* rather than an empty
 * select: an empty list here is the expected state for a service whose site has
 * not upgraded the widget yet, not a fault.
 */
const CanonicalEmbedPicker: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { label, required, admin: { description } = {} } = field
  const { value, setValue, showError } = useField<string>({ path })
  const [formState] = useAllFormFields()

  const embedMetadata = formState['embedMetadata']?.value as EmbedMetadata | undefined

  const model = useMemo(
    () => buildPickerModel({ embedMetadata, embed: value, verification: null, now: new Date() }),
    [embedMetadata, value],
  )

  const options = model.options.map((option) => ({
    label: option.cautions.length > 0 ? `${option.label}  ⚠` : option.label,
    value: option.value,
  }))

  return (
    <div
      className={['field-type', 'text', showError && 'error', readOnly && 'read-only']
        .filter(Boolean)
        .join(' ')}
    >
      <FieldLabel label={label} path={path} required={required} />
      <div className="field-type__wrap">
        <FieldError path={path} showError={showError} />
        {model.emptyReason ? (
          <p style={{ color: 'var(--theme-elevation-600)', margin: 0 }}>{model.emptyReason}</p>
        ) : (
          <ReactSelect
            isClearable
            disabled={readOnly}
            onChange={(option) =>
              setValue((option as { value?: string } | null)?.value ?? '')
            }
            options={options}
            value={options.find((option) => option.value === value)}
          />
        )}
      </div>
      <FieldDescription description={description} path={path} />
    </div>
  )
}

export default CanonicalEmbedPicker
