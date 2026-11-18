'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useLivePreviewContext } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

import { composePanelUrl, panelNoticeUrl } from '@/components/admin/helpers/panelUrl'
import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import { isLivePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'
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
  const { iframeRef, isLivePreviewing, previewWindowType, setURL, url } = useLivePreviewContext()
  const [mode, setMode] = useState<Mode>('light')
  /** Whether the atlas has answered since the frame last loaded. */
  const heard = useRef(false)

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
   * ⚠ **`heard` outlives the effect, and only a `load` clears it.** Payload
   * renders the iframe once and never unmounts it on close — "defer load and
   * never unmount" (`providers/LivePreview/index.js`) — so reopening the panel
   * brings back a frame that has already loaded and already spoken. There is no
   * second `load` and no second message, so a clock restarted on that frame
   * would expire over a working map, with no way back.
   *
   * Two states leave no frame to watch: the panel closed, and the preview moved
   * to a popup, which returns `null` for the whole window
   * (`elements/LivePreview/Window`). Keying on both is also what attaches this
   * to a panel opened after the field mounted.
   *
   * Showing the notice costs the live map until the tab is left and returned
   * to, or the document saved. That is the price of the panel explaining
   * itself where the other four refusals do, rather than a banner beside it,
   * and it is what `ATLAS_SILENCE_MS` is sized against: navigating the frame
   * away ends any chance of a late message.
   */
  useEffect(() => {
    const frame = iframeRef?.current
    // Already explaining itself — this notice, or the document's own refusal.
    if (!frame || !url || isLivePreviewUnavailableUrl(url)) return
    if (!isLivePreviewing || previewWindowType !== 'iframe') return

    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = () => {
      clearTimeout(timer)
      if (heard.current) return
      timer = setTimeout(
        () => composePanelUrl(setURL, panelNoticeUrl('atlas-unreachable')),
        ATLAS_SILENCE_MS,
      )
    }
    const onLoad = () => {
      heard.current = false
      wait()
    }
    const onMessage = (event: MessageEvent) => {
      if (!isFromPreviewFrame(event, frame)) return
      heard.current = true
      clearTimeout(timer)
    }

    wait()
    frame.addEventListener('load', onLoad)
    window.addEventListener('message', onMessage)

    return () => {
      clearTimeout(timer)
      frame.removeEventListener('load', onLoad)
      window.removeEventListener('message', onMessage)
    }
  }, [iframeRef, isLivePreviewing, previewWindowType, setURL, url])

  // A new address in the frame is a page that has not spoken yet. Its own
  // effect, so re-running the watch above for any other reason keeps the answer.
  useEffect(() => {
    heard.current = false
  }, [url])

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
