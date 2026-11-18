'use client'

import type { LivePreviewURLType } from 'payload'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useRef } from 'react'

import { composePanelUrl, panelNoticeUrl } from '@/components/admin/helpers/panelUrl'
import { isLivePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

/**
 * How long the panel waits to hear from the page before it says so.
 *
 * It has to clear a cold boot plus the preview token's verification, and
 * over-waiting only delays an explanation while under-waiting replaces a
 * working page with one.
 */
export const PREVIEW_SILENCE_MS = 12_000

/** A panel already explaining itself needs no second explanation. */
const watchable = (url: LivePreviewURLType): boolean =>
  Boolean(url && !isLivePreviewUnavailableUrl(url))

/**
 * Says why a live-preview panel is blank, in place of the blank rectangle.
 *
 * A frame that never completes Payload's handshake is a frame nobody can see
 * into: an ad blocker or privacy extension, a network block, or the consumer
 * site being down. The panel is pointed at the explanation page instead — the
 * same place every other refusal lands. `previewNoticePlugin` mounts it on
 * every entity declaring `admin.livePreview`.
 *
 * Showing the notice costs the live page until the document is reloaded, which
 * is what {@link PREVIEW_SILENCE_MS} is sized against: navigating the frame away
 * ends any chance of a late handshake.
 */
export function LivePreviewNotice() {
  const { appIsReady, iframeRef, isLivePreviewing, previewWindowType, setAppIsReady, setURL, url } =
    useLivePreviewContext()

  const clearedFor = useRef(url)

  /**
   * ⚠ **Payload clears `appIsReady` for an address it was asked to show, not
   * for one the server resolved.** The context's `setURL` clears it
   * (`@payloadcms/ui/dist/providers/LivePreview/index.js:91-103`), but the URL
   * a save re-resolves reaches the provider through the raw state setter beside
   * it (`:107-111`), so a frame that spoke once would vouch for every later
   * address.
   *
   * Clearing it here rather than patching the provider keeps the change to the
   * one reader that needs it. Payload's own reader, which posts form state,
   * then posts into a frame mid-reload — which is upstream's behaviour today,
   * with or without this.
   */
  useEffect(() => {
    if (clearedFor.current === url) return
    clearedFor.current = url
    // A popup is not reloaded by an address change, so nothing would re-arm it.
    if (watchable(url) && appIsReady && previewWindowType === 'iframe') setAppIsReady(false)
  }, [appIsReady, previewWindowType, setAppIsReady, url])

  useEffect(() => {
    if (!watchable(url) || !isLivePreviewing || appIsReady) return
    // A popup leaves no frame to watch, and repointing the panel is not its
    // remedy.
    if (previewWindowType !== 'iframe') return

    // ⚠ **Restarted by each `load`**, so the budget bounds silence from a frame
    // that has settled rather than the whole load: a slow network buys itself
    // more time instead of being called blocked. A blocked frame may fire no
    // `load` at all, which is the case this clock is for.
    const frame = iframeRef?.current
    let timer: ReturnType<typeof setTimeout>
    const wait = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () => composePanelUrl(setURL, panelNoticeUrl('preview-unreachable')),
        PREVIEW_SILENCE_MS,
      )
    }

    wait()
    frame?.addEventListener('load', wait)

    return () => {
      clearTimeout(timer)
      frame?.removeEventListener('load', wait)
    }
  }, [appIsReady, iframeRef, isLivePreviewing, previewWindowType, setURL, url])

  return null
}

export default LivePreviewNotice
