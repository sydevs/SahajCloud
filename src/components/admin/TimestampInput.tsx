'use client'

import type { NumberFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

function secondsToHHMMSS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function hhmmssToSeconds(time: string): number | null {
  const match = time.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/)
  if (!match) return null
  return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10)
}

export const TimestampInput: NumberFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, localized, required, admin: { description, className } = {} } = field

  const { value, setValue, showError } = useField<number | null>()

  // Local display string for the input
  const [displayValue, setDisplayValue] = useState<string>(
    typeof value === 'number' ? secondsToHHMMSS(value) : '',
  )

  // Sync displayValue when value changes externally (form reset, programmatic update)
  useEffect(() => {
    setDisplayValue(typeof value === 'number' ? secondsToHHMMSS(value) : '')
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setDisplayValue(raw)

      const seconds = hhmmssToSeconds(raw)
      if (seconds !== null) {
        setValue(seconds)
      }
    },
    [setValue],
  )

  const handleBlur = useCallback(() => {
    // On blur, reformat to canonical HH:MM:SS if the value is valid
    if (typeof value === 'number') {
      setDisplayValue(secondsToHHMMSS(value))
    }
  }, [value])

  const fieldClasses = [
    'field-type',
    'text',
    className,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fieldClasses} style={mergeFieldStyles(field.admin)}>
      <FieldLabel htmlFor={fieldId(name)} label={label} localized={localized} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <input
          id={fieldId(name)}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="HH:MM:SS"
          disabled={readOnly}
          style={{
            width: '100%',
            padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.5)',
            fontSize: 'var(--admin-body-size)',
            backgroundColor: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
          }}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TimestampInput
