'use client'

import { useEffect, useRef, useState } from 'react'

import { estimatePlaybackTime, nextPlaybackReport, type PlaybackReport } from './transcriptModel'

/** Fine enough for a word of about a third of a second. */
const TICK_MS = 100

/**
 * The preview playhead, smoothed between the whole seconds it reports, so a
 * word highlight can move word by word rather than once a second.
 */
export function useSmoothPlaybackTime(reported: number): number {
  const report = useRef<PlaybackReport>({ time: reported, at: 0, playing: false })
  const [time, setTime] = useState(reported)

  useEffect(() => {
    report.current = nextPlaybackReport(report.current, reported, performance.now())
    setTime(reported)
  }, [reported])

  useEffect(() => {
    const timer = setInterval(() => {
      if (report.current.playing) setTime(estimatePlaybackTime(report.current, performance.now()))
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return time
}
