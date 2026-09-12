import type { PayloadRequest } from 'payload'

import { reportRejectedCredential } from '@/plugins/sentry/credentialRejection'

/**
 * Published-client auth guard shared by the public client endpoints.
 *
 * Returns a `403` {@link Response} when the request is **not** authenticated as
 * a published `clients` user, or `null` when the caller is allowed through.
 * Publish/unpublish is the auth gate: a draft (unpublished) client is denied.
 * This is the single source for the guard's shape and message — handlers
 * short-circuit on a non-null return:
 *
 * ```typescript
 * const denied = requireActiveClient(req)
 * if (denied) return denied
 * ```
 *
 * ⚠ **This 403 is RETURNED, never thrown**, so Payload's root `afterError` hook
 * never sees it and cannot report a rejected key here. Fifteen handlers
 * short-circuit on this one seam, `/api/atlas/seo` and `/api/atlas/sitemap`
 * among them, so it reports for all of them (#743). A denial that presented no
 * credential stays silent — `reportRejectedCredential` decides.
 */
export function requireActiveClient(req: PayloadRequest): Response | null {
  if (req.user?.collection !== 'clients' || req.user._status !== 'published') {
    reportRejectedCredential(req)
    return Response.json(
      { errors: [{ message: 'You are not allowed to perform this action.' }] },
      { status: 403 },
    )
  }
  return null
}
