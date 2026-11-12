'use client'

import type { TextFieldClientComponent } from 'payload'

import {
  Button,
  FieldDescription,
  FieldError,
  FieldLabel,
  useField,
  useLivePreviewContext,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import { isBrandColor } from '@/lib/clients/appearance'
import { originOf } from '@/lib/utilities/url'

import { readAdjustment, type ColorAdjustment } from './paletteReport'

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
  const adjustment = usePreviewAdjustment(name, value)

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

      {adjustment ? (
        <div
          className="field-description"
          style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--base)' }}
        >
          <span
            aria-hidden
            style={{
              backgroundColor: adjustment.light,
              borderRadius: 'var(--style-radius-s)',
              display: 'inline-block',
              height: '1em',
              width: '1em',
            }}
          />
          <span>
            Visitors see {adjustment.light}
            {adjustment.reasons.length > 0 ? ` — ${adjustment.reasons.join(', ')}` : ''}
          </span>
          {adjustment.suggested && !readOnly ? (
            <Button
              buttonStyle="secondary"
              margin={false}
              onClick={() => setValue(adjustment.suggested)}
              size="small"
            >
              Use this colour
            </Button>
          ) : null}
        </div>
      ) : null}
      {fallback ? (
        <div className="field-description" style={{ display: 'flex', gap: 'var(--base)' }}>
          {unset ? (
            <span>Atlas default ({fallback.toUpperCase()})</span>
          ) : (
            <span>Custom ({value?.toUpperCase()})</span>
          )}
        </div>
      ) : null}
      <FieldDescription description={description} path={name} />
    </div>
  )
}

/**
 * What the atlas preview reports about this picker's colour, or `null` while it
 * reports nothing — no preview open, or a colour it left as entered.
 *
 * ⚠ **The sender is checked when each message arrives**, against the preview
 * iframe as it is then. Nothing about the frame is captured at mount, so a panel
 * that opens after this field, reloads or is repointed needs no re-subscribe.
 */
function usePreviewAdjustment(
  fieldName: string,
  value: null | string | undefined,
): ColorAdjustment | null {
  const { iframeRef } = useLivePreviewContext()
  const [message, setMessage] = useState<unknown>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef?.current

      if (!frame?.contentWindow || event.source !== frame.contentWindow) return
      if (event.origin !== originOf(frame.src)) return

      setMessage(event.data)
    }

    window.addEventListener('message', onMessage)

    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef])

  return readAdjustment(message, fieldName, value)
}

export default ColorField
