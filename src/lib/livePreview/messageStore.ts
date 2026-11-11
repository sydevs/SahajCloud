/**
 * A message the live-preview iframe sends, cached per document and fanned out to
 * every field listening for it.
 *
 * Module-level because the fields that want one answer are siblings in a tabs
 * field, and Payload unmounts the inactive subtree: per-component state would
 * blank on every tab switch, and a remount must not blank a value that is still
 * true. The window listener attaches on first subscribe and stays — a UI
 * singleton, not a leak.
 *
 * ⚠ **A subscriber names the origin it will hear from, and hears from no other.**
 * A message accepted from any origin lets any page able to reach this window
 * decide what the panel reports: where a frame lands, or what a manager is told
 * their colours look like. The send side derives its `targetOrigin` from the
 * iframe; this is the receive side, and it ties the permission to a mounted
 * component rather than to a flag nobody clears.
 *
 * ⚠ **The cache is keyed by document, because a message carries no id** — the
 * subscriber supplies its own. Without that key, opening document B after A
 * serves A's value under B's fields.
 */

/** Which document a cached value describes, as the admin route names it. */
export type DocumentKey = number | string

export interface PreviewMessageStore<T> {
  /** The last value for `document`, or the empty one — never another document's. */
  get: (document: DocumentKey) => T
  /** Clear the cache, the subscribers and the listener. Tests only. */
  reset: () => void
  /** Listen for the message, from `origin` alone. Re-subscribe when it changes. */
  subscribe: (cb: (value: T) => void, origin: string, document: DocumentKey) => () => void
}

interface PreviewMessageStoreConfig<T> {
  /** What a reader gets for a document no message has described. */
  empty: T
  /**
   * Narrow the message's own payload, or answer `null` to ignore it.
   *
   * The shape crossed a window boundary, so it is narrowed rather than cast: a
   * field rendering an unchecked one would throw inside its render and take the
   * whole field down with it.
   */
  read: (data: Record<string, unknown>) => null | T
  /** The `data.type` this store answers to. */
  type: string
}

export function createPreviewMessageStore<T>({
  empty,
  read,
  type,
}: PreviewMessageStoreConfig<T>): PreviewMessageStore<T> {
  interface Subscription {
    cb: (value: T) => void
    document: DocumentKey
    origin: string
  }

  let cached: { document: DocumentKey; value: T } | null = null
  const subscriptions = new Set<Subscription>()
  let listenerAttached = false

  const handleMessage = (event: MessageEvent): void => {
    if (event.data?.type !== type) return

    const listening = [...subscriptions].filter((entry) => entry.origin === event.origin)
    if (listening.length === 0) return

    const value = read(event.data)
    if (value === null) return

    cached = { document: listening[0]!.document, value }
    listening.forEach((entry) => entry.cb(value))
  }

  return {
    get: (document) => (cached?.document === document ? cached.value : empty),

    reset: () => {
      cached = null
      subscriptions.clear()
      if (listenerAttached && typeof window !== 'undefined') {
        window.removeEventListener('message', handleMessage)
      }
      listenerAttached = false
    },

    subscribe: (cb, origin, document) => {
      if (!listenerAttached && typeof window !== 'undefined') {
        listenerAttached = true
        window.addEventListener('message', handleMessage)
      }

      const entry: Subscription = { cb, document, origin }
      subscriptions.add(entry)

      return () => {
        subscriptions.delete(entry)
      }
    },
  }
}
