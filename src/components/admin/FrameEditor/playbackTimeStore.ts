/**
 * Module-level store for the live-preview playback time.
 *
 * The playhead a newly inserted frame is written at. The store, its origin
 * filter and its cache are `./messageStore`; what belongs here is the
 * message's own shape.
 */

import { createPreviewMessageStore } from './messageStore'

/**
 * The FrameEditor has always held one playhead per window, not per document.
 *
 * shortcut: a meditation opened after another serves the previous playhead until
 * the preview sends its next message — upgrade to the document's own id once a
 * frame can be inserted before that first message arrives.
 */
const PER_WINDOW = 'playhead'

const store = createPreviewMessageStore<number>({
  empty: 0,
  read: (data) =>
    typeof data.currentTime === 'number' && Number.isFinite(data.currentTime)
      ? data.currentTime
      : null,
  type: 'PLAYBACK_TIME_UPDATE',
})

export const getCachedPlaybackTime = (): number => store.get(PER_WINDOW)

/**
 * Listen for the playhead, from `origin` alone. Pass the live-preview
 * iframe's origin — `originOf(iframe.src)`. Re-subscribe when it changes.
 */
export const subscribePlaybackTime = (cb: (time: number) => void, origin: string): (() => void) =>
  store.subscribe(cb, origin, PER_WINDOW)

/**
 * Test-only reset hook. Not exported from any barrel — accessed by
 * tests via the direct module path.
 */
export const __resetPlaybackTimeStoreForTests = store.reset
