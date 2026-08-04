import type { PayloadRequest } from 'payload'

/**
 * Run `load` at most once per request, keyed by `key` on `req.context`.
 *
 * The **promise** is memoized, not its resolved value. A bulk operation can
 * issue many hooks concurrently, and a resolved-value cache stampedes under
 * that concurrency — every caller clears the "not cached yet" check before the
 * first load settles, so each issues its own query. Storing the promise
 * synchronously (no `await` between the check and the store) means every later
 * caller awaits the same one, collapsing the load to exactly one.
 *
 * A failed load is evicted so a later read in the same request can retry;
 * callers already awaiting the in-flight promise still reject together, which
 * is correct — that load did fail.
 *
 * Extracted from the Events title-template loader (#605), now shared with the
 * listing-quality report's own per-request loads (#609).
 */
export function memoizeOnRequest<T>(
  req: PayloadRequest,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  let inFlight = ctx[key] as Promise<T> | undefined
  if (!inFlight) {
    inFlight = load()
    ctx[key] = inFlight
    req.context = ctx
    void inFlight.catch(() => {
      if (ctx[key] === inFlight) delete ctx[key]
    })
  }
  return inFlight
}
