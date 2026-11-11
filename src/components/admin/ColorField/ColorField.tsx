'use client'

import type { TextFieldClientComponent } from 'payload'

import {
  Button,
  FieldDescription,
  FieldError,
  FieldLabel,
  useDocumentInfo,
  useField,
  useLivePreviewContext,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { isBrandColor } from '@/lib/clients/appearance'
import { originOf } from '@/lib/utilities/url'

import {
  ADJUSTMENT_REASONS,
  getCachedPaletteReport,
  ROLE_OF_FIELD,
  subscribePaletteReport,
  type PaletteReport,
  type RoleReport,
} from '../AtlasPreview/paletteReport'

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
  const adjustment = usePreviewAdjustment(name)

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

      {adjustment ? (
        <div className="field-description" style={{ display: 'flex', gap: 'var(--base)' }}>
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
            Visitors see {adjustment.light.toUpperCase()} —{' '}
            {adjustment.adjustedBy.map((check) => ADJUSTMENT_REASONS[check]).join(', ')}
          </span>
          {/* ⚠ Driven by `suggested`, never by `adjustedBy`: a role adjusted only
              by `panel-text` moves a ladder step no seed can express, so there is
              nothing to offer and no button. */}
          {adjustment.suggested && !readOnly ? (
            <Button
              buttonStyle="secondary"
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
 * What the atlas reported about this picker's own role, or `null` while it has
 * reported nothing — a service with no preview open shows no note at all.
 *
 * ⚠ **From the preview iframe's origin only.** The store names the origin, so
 * the permission belongs to a mounted component rather than to a flag nobody
 * clears (`docs/rules/admin-ui.md` § Frame editor).
 */
function usePreviewAdjustment(fieldName: string): null | RoleReport {
  const { iframeRef, url } = useLivePreviewContext()
  const { id } = useDocumentInfo()
  const role = ROLE_OF_FIELD[fieldName]
  const origin = originOf(iframeRef?.current?.src ?? '')
  const [report, setReport] = useState<PaletteReport>(() =>
    id == null ? {} : getCachedPaletteReport(id),
  )

  useEffect(() => {
    if (!origin || id == null) return

    setReport(getCachedPaletteReport(id))

    return subscribePaletteReport(setReport, origin, id)
    // `url` is what changes when the panel opens or is repointed, which is also
    // when `iframeRef.current` first exists.
  }, [id, origin, url])

  const adjustment = role ? report[role] : undefined

  return adjustment && adjustment.adjustedBy.length > 0 ? adjustment : null
}

export default ColorField
