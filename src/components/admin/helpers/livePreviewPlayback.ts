'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import { originOf } from '@/lib/utilities/url'

import { getCachedPlaybackTime, subscribePlaybackTime } from './playbackTimeStore'

/**
 * Hook to listen for playback time updates from the live preview iframe.
 *
 * Backed by a module-level singleton ([playbackTimeStore]) so the cached
 * value survives component remounts — required because the Frames /
 * Add New tabs each render in their own subtree and unmount when
 * inactive. Without the singleton, switching tabs while audio was paused
 * would reset the playhead state to 0.
 *
 * The subscription names the origin it will hear from — the live-preview
 * iframe's. `url` is a dependency because the iframe's `src` follows it, so
 * repointing the panel re-subscribes against the new origin. With no iframe
 * there is no subscription at all, which is the closed side of failing closed.
 */
export const usePlaybackTime = (): number => {
  const [time, setTime] = useState<number>(getCachedPlaybackTime)
  const { iframeRef, url } = useLivePreviewContext()

  useEffect(() => {
    setTime(getCachedPlaybackTime())

    const origin = originOf(iframeRef.current?.src ?? url)
    if (!origin) return

    return subscribePlaybackTime(setTime, origin)
  }, [iframeRef, url])

  return time
}

/**
 * Hook to send seek commands to the live preview iframe
 * Sends SEEK_TO_TIME messages via PostMessage API
 *
 * The iframe comes from the live-preview context's own `iframeRef`. The
 * `document.querySelector('iframe[src*="/preview/embed"]')` this replaced was
 * standing in for that ref, and matched on a URL shape only the We Meditate
 * preview happens to use.
 */
export const useSeekToTime = (): ((timestamp: number) => void) => {
  const { iframeRef } = useLivePreviewContext()

  return useCallback(
    (timestamp: number) => {
      const iframe = iframeRef.current
      const targetOrigin = originOf(iframe?.src)

      if (!iframe?.contentWindow || !targetOrigin) return
      iframe.contentWindow.postMessage({ type: 'SEEK_TO_TIME', timestamp }, targetOrigin)
    },
    [iframeRef],
  )
}
