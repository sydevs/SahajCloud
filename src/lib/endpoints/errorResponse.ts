import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

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
 * logged and answered as a 500 carrying `failure`.
 */
export function readFailureResponse(
  req: PayloadRequest,
  error: unknown,
  failure: string,
  log: { msg: string } & Record<string, unknown>,
): Response {
  if (error instanceof APIError) return errorResponse(error.message, error.status)
  req.payload.logger.error({
    ...log,
    error: error instanceof Error ? error.message : String(error),
  })
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
): { ok: true; clientId: number } | { ok: false; response: Response } {
  const clientId = Number(req.user?.id)
  if (Number.isInteger(clientId)) return { ok: true, clientId }

  req.payload.logger.error({
    msg: 'client id is not an integer',
    clientId: req.user?.id,
  })
  return { ok: false, response: errorResponse(failure, 500) }
}
