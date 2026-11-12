'use client'

import type { TextFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback } from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import { isBrandColor } from '@/lib/clients/appearance'

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
 *       Field: '@/components/admin/ColorField/ColorField',
 *     },
 *   },
 * }
 * ```
 */
export const ColorField: TextFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, localized, required, admin: { description, className, custom } = {} } = field
  const fallback = (custom as { colorFallback?: string } | undefined)?.colorFallback

  const { value, setValue, showError } = useField<string>()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!readOnly) {
        setValue(e.target.value)
      }
    },
    [readOnly, setValue],
  )

  const fieldClasses = [
    'field-type',
    'text',
    className,
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`
  const unset = Boolean(fallback) && !isBrandColor(value)
  const shown = unset && fallback ? fallback : value || '#000000'

  return (
    <div className={fieldClasses} id={fieldId} style={mergeFieldStyles(field.admin)}>
      <div style={{ alignItems: 'baseline', display: 'flex', gap: 'calc(var(--base) / 3)' }}>
        <FieldLabel label={label} localized={localized} path={name} required={required} />
        {unset ? <span style={{ color: 'var(--theme-elevation-500)' }}>Default</span> : null}
      </div>

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <input
          type="color"
          value={shown}
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
