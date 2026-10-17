'use client'

import { type RefObject, useEffect, useRef } from 'react'

/** How long a manual scroll stops the transcript from following the playhead. */
const MANUAL_SCROLL_PAUSE_MS = 5000

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])

/**
 * Scroll the playing phrase into view when it moves off screen.
 *
 * A wheel, touch or scroll key pauses that for a few seconds, so following
 * never fights an editor reading elsewhere. Those events are the signal
 * because the scroll this hook starts fires none of them, while a plain
 * `scroll` listener could not tell the two apart.
 *
 * ⚠ `' '` is deliberately not a scroll key here, although it scrolls a page:
 * every phrase is a `role="button"` that takes Space to play from, so reading
 * it as a manual scroll would stand following down on each one pressed.
 *
 * `enabled` is false while there is nothing to follow. The hook is called
 * above the component's early returns, as the rules require, so without it
 * every meditation with no transcript would still listen on `window`.
 */
export function useFollowPlayhead(
  container: RefObject<HTMLElement | null>,
  activeIndex: number,
  enabled: boolean,
): void {
  const pausedUntil = useRef(0)

  useEffect(() => {
    if (!enabled) return
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
  }, [enabled])

  useEffect(() => {
    if (!enabled || Date.now() < pausedUntil.current) return
    const phrase = container.current?.querySelector('[aria-current="true"]')
    if (!phrase) return
    const { top, bottom } = phrase.getBoundingClientRect()
    if (top >= 0 && bottom <= window.innerHeight) return
    phrase.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [container, activeIndex, enabled])
}
