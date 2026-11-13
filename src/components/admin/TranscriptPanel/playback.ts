'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/helpers/livePreviewPlayback'

import { exactSecond, seekSecond } from './transcriptModel'

/**
 * Where a recording is playing, and how to play it from a phrase. The
 * transcript reads along with whichever clock it is handed: a meditation's live
 * preview, or a player beside the transcript on a file.
 */
export type Playback = {
  /** The playhead, in seconds. */
  seconds: number
  playFrom: (seconds: number) => void
  /** The second a phrase starting at `timeMs` plays from. */
  startOf: (timeMs: number) => number
}

/** A meditation's clock: the live preview's player, in whole seconds. */
export function useLivePreviewPlayback(): Playback {
  const seconds = usePlaybackTime()
  const playFrom = useSeekToTime()
  return useMemo(() => ({ playFrom, seconds, startOf: seekSecond }), [playFrom, seconds])
}

/**
 * The events that move the playhead. `timeupdate` alone misses a seek while
 * paused, and `emptied` is a new source starting from nothing.
 */
const MEDIA_EVENTS = ['timeupdate', 'seeked', 'loadedmetadata', 'emptied'] as const

/**
 * A file's clock: the `<audio>` or `<video>` element `mediaRef` is attached
 * to. A callback ref, because the element mounts only once the file has
 * loaded, and an effect keyed on a ref object would never see it arrive; the
 * ref object beside it is what a seek writes to, since the element held in
 * state may not be mutated.
 */
export function useMediaPlayback(): {
  mediaRef: (element: HTMLMediaElement | null) => void
  playback: Playback
} {
  const element = useRef<HTMLMediaElement | null>(null)
  const [media, setMedia] = useState<HTMLMediaElement | null>(null)
  const [seconds, setSeconds] = useState(0)

  const mediaRef = useCallback((node: HTMLMediaElement | null) => {
    element.current = node
    setMedia(node)
  }, [])

  useEffect(() => {
    if (!media) return
    const update = () => setSeconds(media.currentTime)
    for (const type of MEDIA_EVENTS) media.addEventListener(type, update)
    return () => {
      for (const type of MEDIA_EVENTS) media.removeEventListener(type, update)
    }
  }, [media])

  const playFrom = useCallback((at: number) => {
    const node = element.current
    if (!node) return
    node.currentTime = at
    setSeconds(at)
    // Refused only by an autoplay policy, which a click on a phrase satisfies.
    node.play().catch(() => undefined)
  }, [])

  const playback = useMemo(() => ({ playFrom, seconds, startOf: exactSecond }), [playFrom, seconds])
  return { mediaRef, playback }
}
