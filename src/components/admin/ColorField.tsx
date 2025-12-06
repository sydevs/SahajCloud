'use client'

import type { TextFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback } from 'react'

/**
 * Color Field Component
 *
 * A simple color picker field using native HTML color input.
 * Integrates with PayloadCMS field system via useField hook.
 *
 * Usage in collection config:
 * ```typescript
 * {
 *   name: 'color',
 *   type: 'text',
 *   admin: {
 *     components: {
 *       Field: '@/components/admin/ColorField',
 *     },
 *   },
 * }
 * ```
 */
export const ColorField: TextFieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    required,
    admin: { description, className, style } = {},
  } = field

  const { value, setValue, showError } = useField<string>({ path: name })

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!readOnly) {
        setValue(e.target.value)
      }
    },
    [readOnly, setValue],
  )

  const fieldClasses = ['field-type', 'text', className, showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  return (
    <div className={fieldClasses} id={fieldId} style={style}>
      <FieldLabel label={label} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <input
          type="color"
          value={value || '#000000'}
          onChange={handleChange}
          disabled={readOnly}
          style={{
            width: '100%',
            height: '40px',
            padding: '4px',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
            cursor: readOnly ? 'not-allowed' : 'pointer',
            backgroundColor: 'var(--theme-input-bg)',
          }}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default ColorField
