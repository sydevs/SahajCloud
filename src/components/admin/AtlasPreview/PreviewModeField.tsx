'use client'

import type { UIFieldClientComponent } from 'payload'

import { ReactSelect, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { originOf } from '@/lib/utilities/url'

import { ResetColors } from '../ColorField/ResetColors'

import './PreviewModeField.scss'

/** ⚠ Pinned to the atlas's `startClientsPreview` (sydevs/SahajAtlasWeb#392). */
const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'

type Mode = 'dark' | 'light'

const OPTIONS: { label: string; value: Mode }[] = [
  { label: 'Map Preview: Light', value: 'light' },
  { label: 'Map Preview: Dark', value: 'dark' },
]

/**
 * Switches the preview between the atlas's light and dark looks, beside the
 * button that resets the colours.
 *
 * Not stored: it is a way of looking at the service's colours, not a setting
 * the service has. The mode is re-posted on every iframe load, because a reload
 * — a save, a region change — starts the atlas back on its own default.
 */
export const PreviewModeField: UIFieldClientComponent = () => {
  const { iframeRef, url } = useLivePreviewContext()
  const [mode, setMode] = useState<Mode>('light')

  // ⚠ Keyed on the panel's `url`, not on the ref alone. `autoOpen` opens the panel
  // after this field has mounted, so an effect depending only on stable values
  // runs while there is no iframe and never attaches — leaving the atlas on its
  // own theme until the first change, with the control claiming otherwise.
  useEffect(() => {
    const frame = iframeRef?.current
    if (!frame) return

    // The iframe's own origin, read at send time: a reload can land elsewhere.
    const post = () => {
      const origin = originOf(frame.src)
      if (origin) frame.contentWindow?.postMessage({ mode, type: PREVIEW_MODE_MESSAGE }, origin)
    }

    post()
    frame.addEventListener('load', post)

    return () => frame.removeEventListener('load', post)
  }, [iframeRef, mode, url])

  return (
    <div className="field-type preview-controls">
      <ReactSelect
        isClearable={false}
        isSearchable={false}
        onChange={(option) => setMode((option as { value: Mode }).value)}
        options={OPTIONS}
        value={OPTIONS.find((option) => option.value === mode)}
      />
      <ResetColors />
    </div>
  )
}

export default PreviewModeField
