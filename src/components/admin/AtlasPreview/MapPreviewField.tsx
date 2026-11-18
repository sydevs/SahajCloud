'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { composePanelUrl } from '@/components/admin/helpers/panelUrl'
import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import {
  isLivePreviewUnavailableUrl,
  livePreviewUnavailableUrl,
} from '@/lib/livePreview/unavailable'
import { originOf } from '@/lib/utilities/url'

import { isFromPreviewFrame } from './paletteReport'

/** ⚠ Pinned to the atlas's `startClientsPreview` (sydevs/SahajAtlasWeb#392). */
const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'

/**
 * How long the panel waits to hear from the atlas before it says so.
 *
 * The clock is restarted by each `load`, so this bounds silence from a frame
 * that has settled rather than the whole load — a slow network buys itself more
 * time instead of being called blocked. It has to clear a cold boot plus the
 * preview token's verification, and over-waiting only delays an explanation
 * while under-waiting replaces a working map with one.
 */
export const ATLAS_SILENCE_MS = 12_000

type Mode = 'dark' | 'light'

const MODES: { label: string; value: Mode }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

/**
 * Shows the preview in the atlas's light or dark look, and says so when nothing
 * ever arrives from the atlas.
 *
 * Stores nothing: the mode is a way of looking at the colours, not a setting.
 */
export const MapPreviewField: UIFieldClientComponent = () => {
  const { iframeRef, setURL, url } = useLivePreviewContext()
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

  /**
   * A frame that never speaks is a frame nobody can see into: an extension or a
   * network blocking sahajatlas.com, or the atlas itself down. Either way the
   * panel holds a blank rectangle with nothing to say, so it is pointed at the
   * explanation page instead — the same place every other refusal lands.
   *
   * ⚠ **Its own effect.** The mode effect above re-runs on every toggle, and a
   * clock restarted there would read a silent atlas as reachable each time.
   *
   * There is no way back: navigating the frame away ends any chance of a late
   * message, which is what `ATLAS_SILENCE_MS` is sized against. Leaving the tab
   * and returning restores the panel, as does a save.
   */
  useEffect(() => {
    const frame = iframeRef?.current
    // Already explaining itself — this notice, or the document's own refusal.
    if (!frame || !url || isLivePreviewUnavailableUrl(url)) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const notice = livePreviewUnavailableUrl('atlas-unreachable')
        composePanelUrl(setURL, new URL(notice, window.location.origin).toString())
      }, ATLAS_SILENCE_MS)
    }
    const onMessage = (event: MessageEvent) => {
      if (isFromPreviewFrame(event, frame)) clearTimeout(timer)
    }

    wait()
    frame.addEventListener('load', wait)
    window.addEventListener('message', onMessage)

    return () => {
      clearTimeout(timer)
      frame.removeEventListener('load', wait)
      window.removeEventListener('message', onMessage)
    }
  }, [iframeRef, setURL, url])

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
