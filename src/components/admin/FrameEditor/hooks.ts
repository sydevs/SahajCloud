'use client'

import { useLivePreviewContext, useLocale } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'

import type { Frame } from '@/payload-types'

import {
  getCachedPlaybackTime,
  subscribePlaybackTime,
} from './playbackTimeStore'
import { framesByNarratorKey } from './utils'

/**
 * Hook to listen for playback time updates from the live preview iframe.
 *
 * Backed by a module-level singleton ([playbackTimeStore]) so the cached
 * value survives component remounts — required because the Frames /
 * Add New tabs each render in their own subtree and unmount when
 * inactive. Without the singleton, switching tabs while audio was paused
 * would reset the playhead state to 0.
 */
export const usePlaybackTime = (): number => {
  const [time, setTime] = useState<number>(getCachedPlaybackTime)

  useEffect(() => {
    setTime(getCachedPlaybackTime())
    return subscribePlaybackTime(setTime)
  }, [])

  return time
}

/**
 * Hook to send seek commands to the live preview iframe
 * Sends SEEK_TO_TIME messages via PostMessage API
 */
export const useSeekToTime = (): ((timestamp: number) => void) => {
  const seekToTime = useCallback((timestamp: number) => {
    // Find the PayloadCMS live preview iframe
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="/preview/embed"]')

    if (iframe?.contentWindow && iframe.src) {
      // Derive target origin from iframe src (secure, no env needed)
      const targetOrigin = new URL(iframe.src).origin
      iframe.contentWindow.postMessage({ type: 'SEEK_TO_TIME', timestamp }, targetOrigin)
    }
  }, [])

  return seekToTime
}

/**
 * Hook to auto-enable live preview when component mounts
 */
export const useLivePreviewAuto = (): void => {
  const { setIsLivePreviewing } = useLivePreviewContext()

  useEffect(() => {
    setIsLivePreviewing(true)
  }, [setIsLivePreviewing])
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
