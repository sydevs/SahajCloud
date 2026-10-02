'use client'

import { type RefObject, useEffect, useRef } from 'react'

/** How long a manual scroll stops the transcript from following the playhead. */
const MANUAL_SCROLL_PAUSE_MS = 5000

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * Keep the playing phrase in view: when `activeIndex` moves to a phrase off
 * screen, scroll it to the middle.
 *
 * A wheel, touch or scroll key pauses that for a few seconds, so following
 * never fights an editor reading elsewhere. Those events are the signal
 * because the scroll this hook starts fires none of them, while a plain
 * `scroll` listener could not tell the two apart.
 */
export function useFollowPlayhead(
  container: RefObject<HTMLElement | null>,
  activeIndex: number,
): void {
  const pausedUntil = useRef(0)

  useEffect(() => {
    const pause = () => {
      pausedUntil.current = Date.now() + MANUAL_SCROLL_PAUSE_MS
    }
    const pauseOnKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) pause()
    }
    window.addEventListener('wheel', pause, { passive: true })
    window.addEventListener('touchmove', pause, { passive: true })
    window.addEventListener('keydown', pauseOnKey)
    return () => {
      window.removeEventListener('wheel', pause)
      window.removeEventListener('touchmove', pause)
      window.removeEventListener('keydown', pauseOnKey)
    }
  }, [])

  useEffect(() => {
    if (activeIndex < 0 || Date.now() < pausedUntil.current) return
    const phrase = container.current?.querySelector('[aria-current="true"]')
    if (!phrase) return
    const { top, bottom } = phrase.getBoundingClientRect()
    if (top >= 0 && bottom <= window.innerHeight) return
    phrase.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [container, activeIndex])
}
