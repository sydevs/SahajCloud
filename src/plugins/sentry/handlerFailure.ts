/**
 * The one report behind every failure a handler answers by **returning** a
 * response (#1182). `captureFailure` is its sibling for a failure that was
 * **thrown** and routed; both report through `capture`, the single body.
 *
 * ⚠ **`status` is the policy, not a label.** The status the caller is about to
 * answer with decides whether anything is reported at all: a 5xx is an
 * incident, and a 4xx is a caller's mistake (#670). That rule used to be a
 * paragraph repeated at twelve sites, each free to get it wrong; here it is one
 * comparison every site runs. A site answering 2xx after recording an upstream
 * failure says `report: true`, which is the only way past it.
 *
 * ⚠ **This reports and answers nothing.** The response stays the caller's,
 * because the four shapes answer four different consumers — the JSON envelope
 * `errorResponse` builds, the HTML document the Atlas widget frames, the plain
 * text R2 delivery serves, and the `{ status, body }` Cloudflare retries on.
 * `readFailureResponse` (`@/lib/endpoints`) fuses this with the envelope for
 * the one composition that recurs.
 */
import type { CaptureLevel, CaptureSourceTag } from './capture'
import type { Payload } from 'payload'

import { capture } from './capture'

/**
 * `capture_source: 'handler'` says the handler reported for itself, because no
 * `afterError` hook and no `onRequestError` saw the response it returned.
 */
const CAPTURE_SOURCE: CaptureSourceTag = 'handler'

export interface HandlerFailure {
  error?: unknown
  extra?: Record<string, unknown>
  /**
   * Which route — `atlas/seo`, `clients/report`. A captured exception is titled
   * by the driver's own message and says nothing about where it came from.
   */
  handler: string
  /** Overrides the `error` a 5xx implies, for a deployment gap that only alerts in production. */
  level?: CaptureLevel
  /** Opt-in log mirror. A site writing its own line leaves it out. */
  logger?: Pick<Payload['logger'], 'error' | 'info' | 'warn'>
  /** What happened. The log line's `msg`, and the Sentry title where there is no exception. */
  message: string
  /** Overrides what `status` decides. */
  report?: boolean
  /** What the caller is about to answer with. */
  status: number
}

/** Report a returned failure. Answers whether an event was sent. */
export const reportHandlerFailure = (failure: HandlerFailure): boolean => {
  const { error, extra, handler, level, logger, message, report, status } = failure
  if (!(report ?? status >= 500)) return false

  const args = {
    extra,
    level: level ?? 'error',
    logger,
    tags: { capture_source: CAPTURE_SOURCE, handler },
  }
  return error === undefined ? capture({ ...args, message }) : capture({ ...args, error, message })
}
