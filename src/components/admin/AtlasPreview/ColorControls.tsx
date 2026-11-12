'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, Tooltip, useField, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import { BRAND_COLOR_LABELS, isBrandColor, type BrandColorColumn } from '@/lib/clients/appearance'
import { originOf } from '@/lib/utilities/url'

import { readAdjustment, type ColorAdjustment } from './paletteReport'

import './ColorControls.scss'

/** ⚠ Pinned to the atlas's `startClientsPreview` (sydevs/SahajAtlasWeb#392). */
const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'

type Mode = 'dark' | 'light'

const MODES: { label: string; value: Mode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const COLUMNS = Object.keys(BRAND_COLOR_LABELS) as BrandColorColumn[]

/**
 * Everything under the three colour pickers, in one place: which colours the
 * atlas adjusts, the preview's light/dark switch, and the two colour actions.
 *
 * Stores nothing. The mode is a way of looking at the colours, not a setting.
 */
export const ColorControls: UIFieldClientComponent = () => {
  const { iframeRef, url } = useLivePreviewContext()
  const [mode, setMode] = useState<Mode>('light')
  const report = usePreviewReport()
  const fields = {
    color1: useField<null | string>({ path: 'color1' }),
    color2: useField<null | string>({ path: 'color2' }),
    color3: useField<null | string>({ path: 'color3' }),
  }

  const adjusted = COLUMNS.flatMap((column) => {
    const adjustment = readAdjustment(report, column, fields[column].value)

    return adjustment ? [{ column, ...adjustment }] : []
  })
  const suggestions = adjusted.filter((item) => item.suggested)
  const anyCustom = COLUMNS.some((column) => isBrandColor(fields[column].value))

  // ⚠ Keyed on the panel's `url`, not on the ref alone. `autoOpen` opens the panel
  // after this field has mounted, so an effect depending only on stable values
  // runs while there is no iframe and never attaches — leaving the atlas on its
  // own theme until the first change, with the control claiming otherwise.
  useEffect(() => {
    const frame = iframeRef?.current
    if (!frame) return

    // The iframe's own origin, read at send time: a reload can land elsewhere.
    // Re-posted on every load, because a reload starts the atlas on its default.
    const post = () => {
      const origin = originOf(frame.src)
      if (origin) frame.contentWindow?.postMessage({ mode, type: PREVIEW_MODE_MESSAGE }, origin)
    }

    post()
    frame.addEventListener('load', post)

    return () => frame.removeEventListener('load', post)
  }, [iframeRef, mode, url])

  return (
    <div className="field-type color-controls">
      {adjusted.length > 0 ? <AdjustedSummary adjusted={adjusted} /> : null}
      <div className="color-controls__row">
        <ToggleGroup
          aria-label="Map preview"
          onChange={(next) => setMode(next as Mode)}
          options={MODES}
          value={mode}
        />
        <div className="color-controls__actions">
          {suggestions.length > 0 ? (
            <Button
              buttonStyle="secondary"
              margin={false}
              onClick={() =>
                suggestions.forEach((item) => fields[item.column].setValue(item.suggested))
              }
              size="small"
            >
              Use adjusted colors
            </Button>
          ) : null}
          {/* Clears rather than writing the defaults: an unset colour follows a
              later change to the defaults, and a copied one would not. */}
          {anyCustom ? (
            <Button
              buttonStyle="secondary"
              margin={false}
              onClick={() => COLUMNS.forEach((column) => fields[column].setValue(null))}
              size="small"
            >
              Reset colors
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** One line for every adjusted colour, with every reason in a single tooltip. */
function AdjustedSummary({
  adjusted,
}: {
  adjusted: Array<ColorAdjustment & { column: BrandColorColumn }>
}) {
  const [show, setShow] = useState(false)

  return (
    <div
      className="color-controls__summary"
      onBlur={() => setShow(false)}
      onFocus={() => setShow(true)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      tabIndex={0}
    >
      <span>Visitors see adjusted colors</span>
      {adjusted.map((item) => (
        <span
          aria-label={`${BRAND_COLOR_LABELS[item.column]} ${item.light}`}
          className="color-controls__swatch"
          key={item.column}
          role="img"
          style={{ backgroundColor: item.light }}
        />
      ))}
      <Tooltip alignCaret="left" position="bottom" show={show}>
        {adjusted.map((item) => (
          <div key={item.column}>
            {BRAND_COLOR_LABELS[item.column]} {item.light}
            {item.reasons.length > 0 ? ` — ${item.reasons.join(' and ')}` : ''}
          </div>
        ))}
      </Tooltip>
    </div>
  )
}

/**
 * The preview's latest palette report, or `null` before one arrives.
 *
 * ⚠ **The sender is checked as each message arrives**, against the preview
 * iframe as it is then. Nothing about the frame is captured at mount, so a panel
 * that opens after this field, reloads or is repointed needs no re-subscribe.
 */
function usePreviewReport(): unknown {
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

  return message
}

export default ColorControls
