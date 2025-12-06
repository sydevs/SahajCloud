'use client'

import type { TextFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import { FieldDescription } from '@payloadcms/ui/fields/FieldDescription'
import { FieldLabel } from '@payloadcms/ui/fields/FieldLabel'
import React, { useCallback } from 'react'

/**
 * Custom color picker field component for PayloadCMS.
 * Uses native HTML color input with hex text input.
 */
const ColorPicker: TextFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, required, admin } = field
  const description = admin?.description

  const { setValue, value } = useField<string>({ path: name })
  const isReadonly = Boolean(readOnly)

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isReadonly) {
        setValue(e.target.value)
      }
    },
    [isReadonly, setValue],
  )

  return (
    <div className="field-type text" style={{ marginBottom: 'var(--base)' }}>
      <FieldLabel label={label} path={name} required={required} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--base) * 0.5)',
          marginTop: 'calc(var(--base) * 0.25)',
        }}
      >
        <input
          type="color"
          value={value || '#000000'}
          onChange={handleColorChange}
          disabled={isReadonly}
          style={{
            width: '40px',
            height: '40px',
            padding: '0',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
            cursor: isReadonly ? 'not-allowed' : 'pointer',
            backgroundColor: 'transparent',
          }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={handleColorChange}
          placeholder="#000000"
          readOnly={isReadonly}
          style={{
            flex: 1,
            padding: 'calc(var(--base) * 0.5)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
            backgroundColor: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'calc(var(--base-body-size) * 1px)',
          }}
        />
        {value && (
          <div
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: value,
              borderRadius: 'var(--style-radius-s)',
              border: '1px solid var(--theme-elevation-150)',
              flexShrink: 0,
            }}
            title={`Preview: ${value}`}
          />
        )}
      </div>
      {description && <FieldDescription description={description} path={name} />}
    </div>
  )
}

export default ColorPicker
