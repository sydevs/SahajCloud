import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { capture, handlerTags } from '@/plugins/sentry/capture'

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
 * rides in the same bag as `msg` so a site names itself once. The `APIError`
 * arm stays silent: a gate refusing a caller's query is a 4xx, and a caller's
 * mistake is not an incident (#670).
 */
export function readFailureResponse(
  req: PayloadRequest,
  error: unknown,
  failure: string,
  log: { handler: string; msg: string } & Record<string, unknown>,
): Response {
  if (error instanceof APIError) return errorResponse(error.message, error.status)
  const { handler, msg, ...extra } = log
  capture({ error, message: msg, extra, logger: req.payload.logger, tags: handlerTags(handler) })
  return errorResponse(failure, 500)
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

  capture({
    message: 'client id is not an integer',
    extra: { clientId: req.user?.id },
    level: 'error',
    logger: req.payload.logger,
    tags: handlerTags(handler),
  })
  return { ok: false, response: errorResponse(failure, 500) }
}
