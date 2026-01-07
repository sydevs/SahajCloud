'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { Frame } from '@/payload-types'

/**
 * Hook to listen for playback time updates from the live preview iframe
 * Receives PLAYBACK_TIME_UPDATE messages via PostMessage API
 */
export const usePlaybackTime = (): number => {
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAYBACK_TIME_UPDATE') {
        setCurrentPlaybackTime(event.data.currentTime)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return currentPlaybackTime
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
 * Module-level cache for available frames by narrator ID
 * Persists across component remounts but clears on page navigation
 */
const frameCache = new Map<string, Frame[]>()

/**
 * Hook to fetch and cache available frames for a narrator
 * Uses module-level cache to avoid re-fetching when switching tabs
 */
export const useAvailableFrames = (
  narratorId: string | null,
): {
  frames: Frame[]
  isLoading: boolean
  isError: boolean
} => {
  // Initialize from cache if available
  const [frames, setFrames] = useState<Frame[]>(() =>
    narratorId ? frameCache.get(narratorId) || [] : [],
  )
  const [isLoading, setIsLoading] = useState(narratorId ? !frameCache.has(narratorId) : false)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!narratorId) {
      setFrames([])
      setIsLoading(false)
      return
    }

    // Use cached data if available
    if (frameCache.has(narratorId)) {
      setFrames(frameCache.get(narratorId)!)
      setIsLoading(false)
      return
    }

    // Fetch and cache
    setIsLoading(true)
    fetch(`/api/frames/by-narrator/${narratorId}`)
      .then((res) => res.json() as Promise<{ docs?: Frame[] }>)
      .then((data) => {
        const docs = data.docs || []
        frameCache.set(narratorId, docs)
        setFrames(docs)
        setIsLoading(false)
      })
      .catch(() => {
        setIsError(true)
        setIsLoading(false)
      })
  }, [narratorId])

  return { frames, isLoading, isError }
}
