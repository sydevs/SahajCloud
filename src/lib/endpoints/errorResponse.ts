import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { reportHandlerFailure } from '@/plugins/sentry/handlerFailure'

/**
 * The refusal envelope every public endpoint answers with — the shape
 * `parseQuery` returns for a 400 and `requireActiveClient` for a 403.
 *
 * ⚠ **One definition, because four drifting copies is how a "standard" stops
 * being one.**
 */
export function errorResponse(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}

/**
 * The answer for a read that threw: an `APIError` — the client-query gates the
 * forwarded reads run — keeps its status and message, and anything else is
 * logged, reported, and answered as a 500 carrying `failure`.
 *
 * ⚠ **The 500 is RETURNED, never thrown**, so Payload's root `afterError` hook
 * and Next's `onRequestError` both miss it and this is the only thing that can
 * report it (#1182). `log.handler` names the route for the Sentry tag, and
 * rides in the same bag as `msg` so a site names itself once.
 *
 * Both arms go through `reportHandlerFailure`, which decides from the status
 * alone whether anything is reported — so the gate's 4xx stays silent without a
 * second rule written here (#670), and an `APIError` that carries a 500 of its
 * own is reported rather than slipping past on its class.
 *
 * ⚠ **Only a 4xx `APIError` speaks for itself.** Payload marks a 500 `APIError`
 * `isPublic: false` and its own `routeError` withholds the message, so
 * surfacing one here would hand an API client a driver's text that nothing else
 * in the app discloses. A 5xx answers `failure`, whatever threw it.
 */
export function readFailureResponse(
  req: PayloadRequest,
  error: unknown,
  failure: string,
  log: { handler: string; msg: string } & Record<string, unknown>,
): Response {
  const { handler, msg, ...extra } = log
  const refusal =
    error instanceof APIError && error.status < 500
      ? { message: error.message, status: error.status }
      : { message: failure, status: 500 }

  reportHandlerFailure({
    error,
    extra,
    handler,
    logger: req.payload.logger,
    message: msg,
    status: refusal.status,
  })
  return errorResponse(refusal.message, refusal.status)
}

/**
 * The caller's own client id as an integer, or the refusal to answer with.
 *
 * ⚠ **An unusable id has to fail loudly, and that is the whole reason this is
 * not a `?? 0`.** Payload types `id` as `string | number` (its Mongo adapter
 * uses strings) while this database is Postgres, and `CanonicalOwner.clientId`
 * is a number — so a string id matches no owner and the answer becomes "you own
 * nothing", which is **indistinguishable from the legitimate empty one**. A
 * consumer told it owns nothing publishes an empty sitemap, which is how a site
 * asks to be de-indexed.
 *
 * Call it only after `requireActiveClient` has established a published client.
 */
export function requireIntegerClientId(
  req: PayloadRequest,
  failure: string,
  handler: string,
): { ok: true; clientId: number } | { ok: false; response: Response } {
  const clientId = Number(req.user?.id)
  if (Number.isInteger(clientId)) return { ok: true, clientId }

  reportHandlerFailure({
    extra: { clientId: req.user?.id },
    handler,
    logger: req.payload.logger,
    message: 'client id is not an integer',
    status: 500,
  })
  return { ok: false, response: errorResponse(failure, 500) }
}
