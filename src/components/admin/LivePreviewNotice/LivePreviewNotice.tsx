'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useRef } from 'react'

import { composePanelUrl, panelNoticeUrl } from '@/components/admin/helpers/panelUrl'
import { panelUrlSubscribes } from '@/lib/livePreview/scope'
import { isLivePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

/**
 * How long the panel waits to hear from the page before it says so.
 *
 * It has to clear a cold boot plus the preview token's verification, and
 * over-waiting only delays an explanation while under-waiting replaces a
 * working page with one.
 */
export const PREVIEW_SILENCE_MS = 12_000

/**
 * Says why a live-preview panel is blank, in place of the blank rectangle.
 *
 * A frame that never completes Payload's handshake is a frame nobody can see
 * into: an ad blocker or privacy extension, a network block, or the consumer
 * site being down. The panel is pointed at the explanation page instead — the
 * same place every other refusal lands.
 *
 * `previewNoticePlugin` mounts it on every entity declaring `admin.livePreview`,
 * so no surface declares anything, and `appIsReady` is the signal because every
 * consumer that subscribes sends the handshake that sets it.
 *
 * Showing the notice costs the live page until the document is reloaded, which
 * is what {@link PREVIEW_SILENCE_MS} is sized against: navigating the frame away
 * ends any chance of a late handshake.
 */
export function LivePreviewNotice() {
  const { appIsReady, iframeRef, isLivePreviewing, previewWindowType, setAppIsReady, setURL, url } =
    useLivePreviewContext()

  /** The address the latch below was last cleared for. */
  const clearedFor = useRef(url)

  /**
   * ⚠ **Payload re-arms the latch for an address it was asked to show, not for
   * one the server resolved.** The context's `setURL` clears `appIsReady`
   * (`@payloadcms/ui/dist/providers/LivePreview/index.js:91-103`), but a URL
   * re-resolved by a save reaches the provider through the raw state setter
   * beside it (`:107-111`), so a frame that spoke once would vouch for every
   * later address. Clearing it here is what that setter's own docblock
   * promises, and the frame is reloading at this moment anyway.
   *
   * Only an address change, and only for the panel. A popup is not reloaded by
   * one, so clearing it there would stop Payload posting form state with
   * nothing to re-arm it — and clearing it on a mount would retract a
   * handshake the panel had already heard.
   */
  useEffect(() => {
    if (clearedFor.current === url) return
    clearedFor.current = url
    if (previewWindowType === 'iframe') setAppIsReady(false)
  }, [previewWindowType, setAppIsReady, url])

  useEffect(() => {
    // Already explaining itself, or a preview whose page answers nothing.
    if (!url || isLivePreviewUnavailableUrl(url) || !panelUrlSubscribes(url)) return
    // A closed panel and a popup both leave no frame to watch, and a frame that
    // has spoken needs no asking.
    if (!isLivePreviewing || previewWindowType !== 'iframe' || appIsReady) return

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
