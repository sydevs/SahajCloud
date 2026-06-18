/**
 * `fetch` bounded by a timeout.
 *
 * The platform `fetch` has no default timeout, so a stalled upstream (a
 * Cloudflare API, Mapbox, Nirmala Vidya) can hang a request indefinitely. This
 * wraps `fetch` with an `AbortController` that fires after `timeoutMs`, turning
 * an indefinite hang into a prompt, catchable error. A caller-supplied `signal`
 * is still honoured — whichever fires first wins.
 *
 * It does NOT retry: retrying non-idempotent calls (e.g. uploads) risks
 * duplicates/double-charges, so retry policy is left to the call site.
 */

/** Default timeout for small JSON API calls. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000

export interface FetchWithTimeoutInit extends RequestInit {
  /** Abort the request after this many ms (default {@link DEFAULT_FETCH_TIMEOUT_MS}). */
  timeoutMs?: number
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: callerSignal, ...rest } = init

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  // Propagate a caller-supplied abort into our controller.
  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timed out after ${timeoutMs}ms`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}
