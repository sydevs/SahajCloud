/**
 * @vitest-environment jsdom
 *
 * Tests for the FrameEditor playback-time singleton.
 *
 * The store backs `usePlaybackTime` and must survive component remounts
 * so a frame inserted while audio is paused (after a tab switch) lands
 * at the actual playhead, not 0:00 — the bug from #328.
 *
 * It also answers to exactly one origin, published from the live-preview
 * iframe. This playhead is the timestamp a newly inserted frame is written at,
 * so accepting `PLAYBACK_TIME_UPDATE` from anywhere let any page that can
 * reach this window decide where a frame lands (#708).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetPlaybackTimeStoreForTests,
  getCachedPlaybackTime,
  subscribePlaybackTime,
} from '@/components/admin/FrameEditor/playbackTimeStore'

const PREVIEW_ORIGIN = 'https://preview.example'

const dispatchPlaybackUpdate = (currentTime: unknown, origin: string = PREVIEW_ORIGIN) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'PLAYBACK_TIME_UPDATE', currentTime },
      origin,
    }),
  )
}

/** Subscribing to the preview origin, which is what every case but the gate does. */
const subscribe = (cb: (time: number) => void, origin = PREVIEW_ORIGIN) =>
  subscribePlaybackTime(cb, origin)

describe('playbackTimeStore', () => {
  beforeEach(() => {
    __resetPlaybackTimeStoreForTests()
  })

  afterEach(() => {
    __resetPlaybackTimeStoreForTests()
  })

  it('starts with cached time of 0', () => {
    expect(getCachedPlaybackTime()).toBe(0)
  })

  it('updates the cached time when a PLAYBACK_TIME_UPDATE message arrives', () => {
    const cb = vi.fn()
    subscribe(cb)

    dispatchPlaybackUpdate(90)

    expect(getCachedPlaybackTime()).toBe(90)
    expect(cb).toHaveBeenCalledExactlyOnceWith(90)
  })

  it('preserves the cached time across "remounts" (subscribe → unsubscribe → resubscribe)', () => {
    const firstSubscriber = vi.fn()
    const unsubscribe = subscribe(firstSubscriber)
    dispatchPlaybackUpdate(45)
    unsubscribe()

    // Simulate the tab-switch case from #328: the first component
    // unmounts, audio is paused (no more messages), then a sibling
    // component mounts. It must see the last known playhead.
    const secondSubscriber = vi.fn()
    subscribe(secondSubscriber)

    expect(getCachedPlaybackTime()).toBe(45)
  })

  it('stops notifying a subscriber after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = subscribe(cb)
    dispatchPlaybackUpdate(10)
    expect(cb).toHaveBeenCalledExactlyOnceWith(10)

    unsubscribe()
    dispatchPlaybackUpdate(20)
    expect(cb).toHaveBeenCalledTimes(1)
    // The cache follows live subscriptions, so an update arriving while
    // nothing is mounted is neither delivered nor kept. The window it can fall
    // in is one React commit — the gap between the outgoing tab unmounting and
    // the incoming one subscribing.
    expect(getCachedPlaybackTime()).toBe(10)
  })

  it('fans updates out to multiple subscribers', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribe(a)
    subscribe(b)

    dispatchPlaybackUpdate(7)

    expect(a).toHaveBeenCalledExactlyOnceWith(7)
    expect(b).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('ignores unrelated message types (e.g. payload-live-preview traffic)', () => {
    const cb = vi.fn()
    subscribe(cb)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'payload-live-preview', ready: true },
        origin: PREVIEW_ORIGIN,
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', { data: 'string-payload', origin: PREVIEW_ORIGIN }),
    )
    window.dispatchEvent(new MessageEvent('message', { data: null, origin: PREVIEW_ORIGIN }))

    expect(cb).not.toHaveBeenCalled()
    expect(getCachedPlaybackTime()).toBe(0)
  })

  it('ignores messages with non-finite or non-numeric currentTime', () => {
    const cb = vi.fn()
    subscribe(cb)

    dispatchPlaybackUpdate('30')
    dispatchPlaybackUpdate(NaN)
    dispatchPlaybackUpdate(Infinity)
    dispatchPlaybackUpdate(undefined)

    expect(cb).not.toHaveBeenCalled()
    expect(getCachedPlaybackTime()).toBe(0)
  })

  describe('origin gate', () => {
    it('ignores a PLAYBACK_TIME_UPDATE from any other origin', () => {
      const cb = vi.fn()
      subscribe(cb)

      dispatchPlaybackUpdate(120, 'https://evil.example')

      expect(cb).not.toHaveBeenCalled()
      expect(getCachedPlaybackTime()).toBe(0)
    })

    // Nothing mounted means nothing listening — the permission lives with the
    // subscription rather than with a flag somebody has to remember to clear.
    it('fails closed with no subscriber', () => {
      const unsubscribe = subscribe(vi.fn())
      unsubscribe()

      dispatchPlaybackUpdate(120)

      expect(getCachedPlaybackTime()).toBe(0)
    })

    it('follows the panel when the preview is repointed at another origin', () => {
      const cb = vi.fn()
      const unsubscribe = subscribe(cb)
      unsubscribe()
      subscribe(cb, 'https://other.example')

      dispatchPlaybackUpdate(30, PREVIEW_ORIGIN)
      expect(cb).not.toHaveBeenCalled()

      dispatchPlaybackUpdate(30, 'https://other.example')
      expect(cb).toHaveBeenCalledExactlyOnceWith(30)
    })
  })

  it('attaches the window listener only once across many subscribers', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    subscribe(vi.fn())
    subscribe(vi.fn())
    subscribe(vi.fn())

    const messageCalls = addSpy.mock.calls.filter(([type]) => type === 'message')
    expect(messageCalls).toHaveLength(1)

    addSpy.mockRestore()
  })
})
