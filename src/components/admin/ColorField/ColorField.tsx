'use client'

import type { TextFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback } from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
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

  const unset = Boolean(fallback) && !isBrandColor(value)
  const shown = unset && fallback ? fallback : value || '#000000'

  return (
    <div className={fieldClasses} style={mergeFieldStyles(field.admin)}>
      <div style={{ alignItems: 'baseline', display: 'flex', gap: 'calc(var(--base) / 3)' }}>
        <FieldLabel
          htmlFor={fieldId(name)}
          label={label}
          localized={localized}
          required={required}
        />
        {unset ? <span style={{ color: 'var(--theme-elevation-500)' }}>Default</span> : null}
      </div>

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <input
          id={fieldId(name)}
          type="color"
          value={shown}
          onChange={handleChange}
          disabled={readOnly}
          // `formInput` sizes and paints it, focus and error affordances
          // included. A swatch only needs the room its padding takes back.
          style={{ padding: '4px', cursor: readOnly ? 'not-allowed' : 'pointer' }}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default ColorField
