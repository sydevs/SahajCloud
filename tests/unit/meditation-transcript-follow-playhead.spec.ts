/**
 * @vitest-environment jsdom
 *
 * `useFollowPlayhead` — the one module here whose whole behaviour lives
 * between mounts: three `window` listeners, their removal, and a timer the
 * component cannot observe. No pure spec can state any of it.
 *
 * `scrollIntoView` and `getBoundingClientRect` are both stubbed, because jsdom
 * implements neither layout nor scrolling. What is asserted is therefore which
 * calls the hook makes, never where a browser would scroll to.
 */
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFollowPlayhead } from '@/components/admin/MeditationTranscript/useFollowPlayhead'

const scrollIntoView = vi.fn()

/** Off screen by default, so the hook has a reason to scroll. */
let rect = { top: -500, bottom: -400 }

const addEventListener = vi.spyOn(window, 'addEventListener')
const removeEventListener = vi.spyOn(window, 'removeEventListener')

const listenedEvents = (spy: typeof addEventListener) =>
  spy.mock.calls.map(([type]) => type).filter((type) => type !== 'message')

/** Mounts the hook over a container holding one marked phrase. */
function Harness({ activeIndex, enabled }: { activeIndex: number; enabled: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  useFollowPlayhead(container, activeIndex, enabled)
  return createElement('div', { ref: container }, [
    createElement('span', { 'aria-current': 'true', key: 'current' }, 'spoken'),
  ])
}

describe('useFollowPlayhead', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    scrollIntoView.mockClear()
    addEventListener.mockClear()
    removeEventListener.mockClear()
    rect = { top: -500, bottom: -400 }

    Element.prototype.scrollIntoView = scrollIntoView
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return { ...rect, left: 0, right: 0, height: 100, width: 100, x: 0, y: 0 } as DOMRect
    }
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    container.remove()
  })

  const mount = (activeIndex: number, enabled = true) => {
    act(() => {
      root.render(createElement(Harness, { activeIndex, enabled }))
    })
  }

  const unmount = () => {
    act(() => root.unmount())
  }

  it('scrolls the marked phrase into view when it is off screen', () => {
    mount(0)

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: 'center',
      behavior: 'smooth',
    })

    unmount()
  })

  it('leaves a phrase already in view alone', () => {
    rect = { top: 100, bottom: 200 }
    mount(0)

    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount()
  })

  it('does nothing when no phrase is marked', () => {
    act(() => {
      root.render(createElement(() => {
        const empty = useRef<HTMLDivElement>(null)
        useFollowPlayhead(empty, -1, true)
        return createElement('div', { ref: empty })
      }))
    })

    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount()
  })

  it('listens for a manual scroll, and stops on unmount', () => {
    mount(0)

    expect(listenedEvents(addEventListener)).toEqual(['wheel', 'touchmove', 'keydown'])
    expect(listenedEvents(removeEventListener)).toEqual([])

    unmount()

    expect(listenedEvents(removeEventListener)).toEqual(['wheel', 'touchmove', 'keydown'])
  })

  it('listens for nothing while there is no transcript to follow', () => {
    mount(0, false)

    expect(listenedEvents(addEventListener)).toEqual([])
    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount()
  })

  it('stands down for a few seconds after a wheel, so it never fights a reader', () => {
    mount(0)
    scrollIntoView.mockClear()

    act(() => {
      window.dispatchEvent(new window.WheelEvent('wheel'))
    })
    mount(1)

    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount()
  })

  it.each(['ArrowDown', 'PageUp', 'End'])('stands down after %s', (key) => {
    mount(0)
    scrollIntoView.mockClear()

    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key }))
    })
    mount(1)

    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount()
  })

  /**
   * ⚠ Space scrolls a page, but every phrase is a `role="button"` that takes
   * Space to play from — so reading it as a manual scroll would stand
   * following down on each phrase an editor keys.
   */
  it('keeps following after Space, which is a phrase’s own play key', () => {
    mount(0)
    scrollIntoView.mockClear()

    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }))
    })
    mount(1)

    expect(scrollIntoView).toHaveBeenCalledOnce()

    unmount()
  })
})
