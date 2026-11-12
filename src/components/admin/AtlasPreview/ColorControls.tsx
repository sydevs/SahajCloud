'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Button, useField, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import { readableTextOn } from '@/lib/branding/themeColors'
import { BRAND_COLOR_LABELS, isBrandColor, type BrandColorColumn } from '@/lib/clients/appearance'
import { originOf } from '@/lib/utilities/url'

import { readSwatch, type Swatch } from './paletteReport'

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

  const swatches = COLUMNS.map((column) => {
    const swatch = readSwatch(report, column, fields[column].value)

    return swatch ? { column, ...swatch } : null
  })
  // All three or none: a colour the report has not caught up with yet would
  // leave a gap that reads as a colour visitors do not see.
  const complete = swatches.every((swatch) => swatch !== null)
  const shown = complete && swatches.some((swatch) => swatch.adjusted) ? swatches : null
  const suggestions = (shown ?? []).filter((swatch) => swatch.suggested)
  const anyCustom = COLUMNS.some((column) => isBrandColor(fields[column].value))

  // ⚠ Keyed on the panel's `url`, not on the ref alone. `autoOpen` opens the panel
  // after this field has mounted, so an effect depending only on stable values
  // runs while there is no iframe and never attaches.
  useEffect(() => {
    const frame = iframeRef?.current
    if (!frame) return

    // The iframe's own origin, read at send time: a reload can land elsewhere.
    const post = () => {
      const origin = originOf(frame.src)
      if (origin) frame.contentWindow?.postMessage({ mode, type: PREVIEW_MODE_MESSAGE }, origin)
    }

    // ⚠ **Sent again on the atlas's first message after each load**, not on the load
    // alone. The atlas listens only once it has verified its preview token, which
    // is after `load`, so a mode posted then is dropped and the map keeps the
    // viewer's system theme while the toggle says otherwise. Its first message is
    // the earliest proof it is listening; answering only the first keeps the
    // repaint each mode change causes from echoing back forever.
    let heard = false
    const onLoad = () => {
      heard = false
      post()
    }
    const onMessage = (event: MessageEvent) => {
      if (heard || event.source !== frame.contentWindow) return
      heard = true
      post()
    }

    post()
    frame.addEventListener('load', onLoad)
    window.addEventListener('message', onMessage)

    return () => {
      frame.removeEventListener('load', onLoad)
      window.removeEventListener('message', onMessage)
    }
  }, [iframeRef, mode, url])

  return (
    <div className="field-type color-controls">
      <div className="color-controls__row">
        <ToggleGroup
          aria-label="Map preview"
          onChange={(next) => setMode(next as Mode)}
          options={MODES}
          value={mode}
        />
        {/* Clears rather than writing the defaults: an unset colour follows a
            later change to the defaults, and a copied one would not. */}
        {anyCustom ? (
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() => COLUMNS.forEach((column) => fields[column].setValue(null))}
            size="medium"
          >
            Reset colors
          </Button>
        ) : null}
      </div>
      {shown ? (
        <AdjustedBanner
          onUse={
            suggestions.length > 0
              ? () => suggestions.forEach((item) => fields[item.column].setValue(item.suggested))
              : null
          }
          swatches={shown}
        />
      ) : null}
    </div>
  )
}

/**
 * All three colours as visitors see them, the adjusted ones marked, each
 * adjustment as a bullet, and the one action that takes them all.
 */
function AdjustedBanner({
  onUse,
  swatches,
}: {
  onUse: (() => void) | null
  swatches: Array<Swatch & { column: BrandColorColumn }>
}) {
  return (
    <Banner className="color-controls__banner" type="info">
      <strong>Colors are being adjusted for visibility</strong>
      <div className="color-controls__swatches">
        {swatches.map((item) => (
          <span
            aria-label={`${BRAND_COLOR_LABELS[item.column]} ${item.light}${item.adjusted ? ', adjusted' : ''}`}
            className="color-controls__swatch"
            key={item.column}
            role="img"
            style={{ backgroundColor: item.light, color: readableTextOn(item.light) }}
          >
            {item.adjusted ? <span className="color-controls__mark">!</span> : null}
          </span>
        ))}
      </div>
      <ul>
        {swatches
          .filter((item) => item.adjusted)
          .map((item) => (
            <li key={item.column}>
              {BRAND_COLOR_LABELS[item.column]} {item.light}
              {item.reasons.length > 0 ? ` — ${item.reasons.join(' and ')}` : ''}
            </li>
          ))}
      </ul>
      {onUse ? (
        <Button buttonStyle="secondary" margin={false} onClick={onUse} size="small">
          Use adjusted colors
        </Button>
      ) : null}
    </Banner>
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
