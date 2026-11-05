'use client'

import type { TextFieldClientComponent } from 'payload'

import { SelectInput, useAllFormFields, useField } from '@payloadcms/ui'
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
 * ⚠ **A `text` field rendering Payload's own `SelectInput`, not a `select`
 * field.** A select field's options are static config, and these are whatever
 * the widget has reported, so the field component has to stay — but the input
 * is the built-in one, markup and sizing included. A bare `ReactSelect` inside
 * `field-type text` markup picked up the text input's height rules and drew
 * taller than every other select.
 *
 * ⚠ **The custom `Description` arrives through `useField`'s `customComponents`**,
 * as it does for Payload's own fields. Rendering `FieldDescription` instead
 * shows the static description and never mounts `./Description`.
 *
 * When nothing has been reported the select is read-only and the description
 * says why: an empty list here is the expected state for a service whose site
 * has not upgraded the widget yet, not a fault.
 */
const CanonicalEmbedPicker: TextFieldClientComponent = ({
  field,
  path: pathFromProps,
  readOnly,
}) => {
  const { label, required, admin: { description } = {} } = field
  const {
    customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
    path,
    setValue,
    showError,
    value,
  } = useField<string>({ potentiallyStalePath: pathFromProps })
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
    <SelectInput
      AfterInput={AfterInput}
      BeforeInput={BeforeInput}
      Description={model.emptyReason ? undefined : Description}
      description={model.emptyReason ?? description}
      Error={Error}
      isClearable
      Label={Label}
      label={label}
      name={path}
      onChange={(option) => setValue((option as { value?: string } | null)?.value ?? '')}
      options={options}
      path={path}
      readOnly={readOnly || model.emptyReason !== null}
      required={required}
      showError={showError}
      value={value ?? ''}
    />
  )
}

export default CanonicalEmbedPicker
