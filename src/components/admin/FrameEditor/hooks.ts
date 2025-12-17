'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

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
 * Hook to auto-enable live preview when component mounts
 */
export const useLivePreviewAuto = (): void => {
  const { setIsLivePreviewing } = useLivePreviewContext()

  useEffect(() => {
    setIsLivePreviewing(true)
  }, [setIsLivePreviewing])
}
