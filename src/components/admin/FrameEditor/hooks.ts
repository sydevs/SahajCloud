'use client'

import { useLivePreviewContext, useLocale } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'

import { originOf } from '@/lib/utilities/url'
import type { Frame } from '@/payload-types'


import { getCachedPlaybackTime, subscribePlaybackTime } from './playbackTimeStore'
import { framesByNarratorKey } from './utils'

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

/**
 * SWR fetcher with error handling and proper typing
 */
const frameFetcher = async (url: string): Promise<{ docs?: Frame[] }> => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<{ docs?: Frame[] }>
}

/**
 * Hook to fetch and cache available frames for a narrator
 * Uses SWR for automatic caching, deduplication, and revalidation
 *
 * The active admin locale is part of the URL, and so of the SWR key. The
 * endpoint's role gate resolves the manager's roles at `req.locale`, and a
 * request naming no locale resolves to the default one — denying any manager
 * whose roles live only elsewhere (#701). Carrying the locale in the key also
 * makes a locale switch refetch for free.
 */
export const useAvailableFrames = (
  narratorId: string | null,
): {
  frames: Frame[]
  isLoading: boolean
  isError: boolean
  error: string | null
} => {
  const { code } = useLocale()

  const { data, error, isLoading } = useSWR(
    framesByNarratorKey(narratorId, code),
    frameFetcher,
    {
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: false, // Don't refetch on network reconnect
      dedupingInterval: 300000, // 5 minutes - deduplication window
    },
  )

  return {
    frames: data?.docs || [],
    isLoading,
    isError: !!error,
    error: error instanceof Error ? error.message : null,
  }
}
