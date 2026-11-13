'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import { originOf } from '@/lib/utilities/url'

import { isFromPreviewFrame } from './paletteReport'

/** ⚠ Pinned to the atlas's `startClientsPreview` (sydevs/SahajAtlasWeb#392). */
const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'

type Mode = 'dark' | 'light'

const MODES: { label: string; value: Mode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

/**
 * Shows the preview in the atlas's light or dark look.
 *
 * Stores nothing: the mode is a way of looking at the colours, not a setting.
 */
export const MapPreviewField: UIFieldClientComponent = () => {
  const { iframeRef, url } = useLivePreviewContext()
  const [mode, setMode] = useState<Mode>('light')

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
      if (heard || !isFromPreviewFrame(event, frame)) return
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
    <div className="field-type">
      <FieldLabel label="Map Preview" />
      <ToggleGroup
        aria-label="Map Preview"
        onChange={(next) => setMode(next as Mode)}
        options={MODES}
        value={mode}
      />
    </div>
  )
}

export default MapPreviewField
