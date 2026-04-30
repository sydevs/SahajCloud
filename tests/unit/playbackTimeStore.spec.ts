/**
 * @vitest-environment jsdom
 *
 * Tests for the FrameEditor playback-time singleton.
 *
 * The store backs `usePlaybackTime` and must survive component remounts
 * so a frame inserted while audio is paused (after a tab switch) lands
 * at the actual playhead, not 0:00 — the bug from #328.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetPlaybackTimeStoreForTests,
  getCachedPlaybackTime,
  subscribePlaybackTime,
} from '@/components/admin/FrameEditor/playbackTimeStore'

const dispatchPlaybackUpdate = (currentTime: unknown) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'PLAYBACK_TIME_UPDATE', currentTime },
    }),
  )
}

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
    subscribePlaybackTime(cb)

    dispatchPlaybackUpdate(90)

    expect(getCachedPlaybackTime()).toBe(90)
    expect(cb).toHaveBeenCalledExactlyOnceWith(90)
  })

  it('preserves the cached time across "remounts" (subscribe → unsubscribe → resubscribe)', () => {
    const firstSubscriber = vi.fn()
    const unsubscribe = subscribePlaybackTime(firstSubscriber)
    dispatchPlaybackUpdate(45)
    unsubscribe()

    // Simulate the tab-switch case from #328: the first component
    // unmounts, audio is paused (no more messages), then a sibling
    // component mounts. It must see the last known playhead.
    const secondSubscriber = vi.fn()
    subscribePlaybackTime(secondSubscriber)

    expect(getCachedPlaybackTime()).toBe(45)
  })

  it('stops notifying a subscriber after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = subscribePlaybackTime(cb)
    dispatchPlaybackUpdate(10)
    expect(cb).toHaveBeenCalledExactlyOnceWith(10)

    unsubscribe()
    dispatchPlaybackUpdate(20)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(getCachedPlaybackTime()).toBe(20)
  })

  it('fans updates out to multiple subscribers', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribePlaybackTime(a)
    subscribePlaybackTime(b)

    dispatchPlaybackUpdate(7)

    expect(a).toHaveBeenCalledExactlyOnceWith(7)
    expect(b).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('ignores unrelated message types (e.g. payload-live-preview traffic)', () => {
    const cb = vi.fn()
    subscribePlaybackTime(cb)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'payload-live-preview', ready: true },
      }),
    )
    window.dispatchEvent(
      new MessageEvent('message', { data: 'string-payload' }),
    )
    window.dispatchEvent(new MessageEvent('message', { data: null }))

    expect(cb).not.toHaveBeenCalled()
    expect(getCachedPlaybackTime()).toBe(0)
  })

  it('ignores messages with non-finite or non-numeric currentTime', () => {
    const cb = vi.fn()
    subscribePlaybackTime(cb)

    dispatchPlaybackUpdate('30')
    dispatchPlaybackUpdate(NaN)
    dispatchPlaybackUpdate(Infinity)
    dispatchPlaybackUpdate(undefined)

    expect(cb).not.toHaveBeenCalled()
    expect(getCachedPlaybackTime()).toBe(0)
  })

  it('attaches the window listener only once across many subscribers', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    subscribePlaybackTime(vi.fn())
    subscribePlaybackTime(vi.fn())
    subscribePlaybackTime(vi.fn())

    const messageCalls = addSpy.mock.calls.filter(([type]) => type === 'message')
    expect(messageCalls).toHaveLength(1)

    addSpy.mockRestore()
  })
})
