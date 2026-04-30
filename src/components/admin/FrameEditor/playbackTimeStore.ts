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
 */

type Subscriber = (time: number) => void

let cachedPlaybackTime = 0
const subscribers = new Set<Subscriber>()
let listenerAttached = false

const handleMessage = (event: MessageEvent): void => {
  if (event.data?.type !== 'PLAYBACK_TIME_UPDATE') return
  const next = event.data.currentTime
  if (typeof next !== 'number' || !Number.isFinite(next)) return
  cachedPlaybackTime = next
  subscribers.forEach((cb) => cb(next))
}

const ensureListener = (): void => {
  if (listenerAttached) return
  if (typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('message', handleMessage)
}

export const getCachedPlaybackTime = (): number => cachedPlaybackTime

export const subscribePlaybackTime = (cb: Subscriber): (() => void) => {
  ensureListener()
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

/**
 * Test-only reset hook. Not exported from any barrel — accessed by
 * tests via the direct module path.
 */
export const __resetPlaybackTimeStoreForTests = (): void => {
  cachedPlaybackTime = 0
  subscribers.clear()
  if (listenerAttached && typeof window !== 'undefined') {
    window.removeEventListener('message', handleMessage)
  }
  listenerAttached = false
}
