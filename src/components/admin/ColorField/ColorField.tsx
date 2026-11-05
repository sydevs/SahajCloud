'use client'

import type { TextFieldClientComponent } from 'payload'

import { Button, FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback } from 'react'

/**
 * Whether a colour carries a hue, as the Atlas widget reads one.
 *
 * ⚠ Mirrors `isBrandSeed` and `MIN_BRAND_SATURATION` in SahajAtlasWeb's
 * `src/config/theme/palette.ts`: the widget treats black, white and grey as
 * unset, and every service imported before `fallback` existed stores `#000000`.
 * So an achromatic value here is shown as the default, because that is what
 * visitors see.
 */
function hasHue(hex: string): boolean {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!match) return false
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : match[1]
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return false
  const lightness = (max + min) / 2
  const saturation = (max - min) / (1 - Math.abs(2 * lightness - 1))
  return saturation * 100 >= 5
}

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
  const {
    name,
    label,
    localized,
    required,
    admin: { description, className, style, custom } = {},
  } = field
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
  const unset = Boolean(fallback) && (!value || !hasHue(value))
  const shown = unset && fallback ? fallback : value || '#000000'

  return (
    <div className={fieldClasses} id={fieldId} style={style}>
      <FieldLabel label={label} localized={localized} path={name} required={required} />

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

      {fallback ? (
        <div className="field-description" style={{ display: 'flex', gap: 'var(--base)' }}>
          {unset ? (
            <span>Atlas default ({fallback.toUpperCase()})</span>
          ) : (
            <>
              <span>Custom ({value?.toUpperCase()})</span>
              {readOnly ? null : (
                <Button buttonStyle="none" margin={false} onClick={() => setValue(null)}>
                  Use the default
                </Button>
              )}
            </>
          )}
        </div>
      ) : null}
      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default ColorField
