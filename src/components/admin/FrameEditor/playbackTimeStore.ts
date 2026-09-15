/**
 * Module-level store for the live-preview playback time.
 *
 * The PayloadCMS admin renders the FrameEditor's "Frames" and "Add New"
 * tabs as siblings inside a tabs field; switching tabs unmounts the
 * inactive subtree. Without a shared store, each remount resets local
 * React state to 0, so a frame inserted while audio was paused would
 * land at 0:00 instead of the current playhead.
 *
 * The store keeps the latest `PLAYBACK_TIME_UPDATE` value cached at
 * module scope and fans it out to all subscribers. The window listener
 * is attached lazily on first subscribe and then left attached for the
 * lifetime of the document — it's a UI singleton, not a leak.
 *
 * ⚠ **A subscriber names the origin it will hear from, and hears from no
 * other.** This playhead is the timestamp a newly inserted frame is written
 * at, so a message accepted from any origin let any page able to reach this
 * window decide where a frame lands. The send side has always derived its
 * `targetOrigin` from the iframe; the receive side now matches each message's
 * origin against the subscriptions, which ties the permission to a mounted
 * component rather than to a flag nobody clears.
 */

type Subscriber = (time: number) => void

interface Subscription {
  cb: Subscriber
  /** The live-preview iframe's origin, as of this subscription. */
  origin: string
}

let cachedPlaybackTime = 0
const subscriptions = new Set<Subscription>()
let listenerAttached = false

const handleMessage = (event: MessageEvent): void => {
  if (event.data?.type !== 'PLAYBACK_TIME_UPDATE') return
  const next = event.data.currentTime
  if (typeof next !== 'number' || !Number.isFinite(next)) return

  const listening = [...subscriptions].filter((entry) => entry.origin === event.origin)
  if (listening.length === 0) return

  cachedPlaybackTime = next
  listening.forEach((entry) => entry.cb(next))
}

const ensureListener = (): void => {
  if (listenerAttached) return
  if (typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('message', handleMessage)
}

export const getCachedPlaybackTime = (): number => cachedPlaybackTime

/**
 * Listen for the playhead, from `origin` alone. Pass the live-preview
 * iframe's origin — `originOf(iframe.src)`. Re-subscribe when it changes.
 */
export const subscribePlaybackTime = (cb: Subscriber, origin: string): (() => void) => {
  ensureListener()
  const entry: Subscription = { cb, origin }
  subscriptions.add(entry)
  return () => {
    subscriptions.delete(entry)
  }
}

/**
 * Test-only reset hook. Not exported from any barrel — accessed by
 * tests via the direct module path.
 */
export const __resetPlaybackTimeStoreForTests = (): void => {
  cachedPlaybackTime = 0
  subscriptions.clear()
  if (listenerAttached && typeof window !== 'undefined') {
    window.removeEventListener('message', handleMessage)
  }
  listenerAttached = false
}
