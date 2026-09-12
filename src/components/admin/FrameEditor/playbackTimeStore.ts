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
 * ⚠ **It answers to one origin only.** This playhead timestamps every frame
 * inserted from the "Add New" tab, so a message accepted from any origin lets
 * any page that can reach this window move where a frame lands. The send side
 * has always derived its `targetOrigin` from the iframe; the receive side
 * checks the same origin, published by `usePlaybackTime` from the live-preview
 * `iframeRef`. It fails closed: with no origin published, nothing is accepted.
 */

type Subscriber = (time: number) => void

let cachedPlaybackTime = 0
const subscribers = new Set<Subscriber>()
let listenerAttached = false
let allowedOrigin: string | null = null

/** The origin of a preview iframe's `src`, or `null` when there isn't one. */
export const previewOriginOf = (src: null | string | undefined): null | string => {
  if (!src) return null
  try {
    const { origin } = new URL(src)
    // 'null' is what an opaque origin (a `data:` or `javascript:` src)
    // stringifies to. Accepting it would match every other opaque origin.
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/**
 * Names the one origin `PLAYBACK_TIME_UPDATE` is accepted from. Published by
 * `usePlaybackTime` whenever the live-preview iframe points somewhere new.
 */
export const setPlaybackTimeOrigin = (origin: null | string): void => {
  allowedOrigin = origin
}

const handleMessage = (event: MessageEvent): void => {
  if (!allowedOrigin || event.origin !== allowedOrigin) return
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
  allowedOrigin = null
  subscribers.clear()
  if (listenerAttached && typeof window !== 'undefined') {
    window.removeEventListener('message', handleMessage)
  }
  listenerAttached = false
}
