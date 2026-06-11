import type { Endpoint } from 'payload'

import { verifyVerifyToken } from '@/lib/eventVerification/token'

import { applyVerification } from '../lifecycle/verify'

/** Escape interpolated text so the confirmation page can't be an XSS vector. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Minimal self-contained confirmation page (the link opens logged-out). `title`
 * and `message` are escaped, so the helper stays safe even if a future caller
 * passes dynamic (event- or token-derived) text — today they're static copy.
 */
function htmlPage(title: string, message: string, status: number): Response {
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#1a1a1a;text-align:center"><h1 style="font-size:1.4rem">${safeTitle}</h1><p style="color:#555;line-height:1.5">${safeMessage}</p></body></html>`
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/**
 * GET /api/events/:id/verify?token=…
 *
 * The tokenized "Verify" link in a reminder email — works logged-out. The
 * signed token ({ eventId, managerId, exp }, 10-day expiry) is the
 * authorization, so the verify op runs with `overrideAccess: true`. Runs the
 * shared verify op (method `email-link`) and renders a small confirmation page.
 *
 * Authorization tradeoff (accepted): the token is bound to `eventId` but is
 * reusable within its 10-day TTL and carries no per-cycle nonce, so a
 * forwarded/leaked reminder email lets any holder verify + re-publish *that one
 * event* as the named manager. This is a deliberate, low-stakes capability —
 * verifying is idempotent and exposes no data beyond the event — not an
 * oversight. The `claims.eventId === id` check below keeps a token scoped to
 * its single event.
 */
export const verifyEventLink: Endpoint = {
  path: '/:id/verify',
  method: 'get',
  handler: async (req) => {
    const id = Number(req.routeParams?.id)
    const token = typeof req.query?.token === 'string' ? req.query.token : ''

    const claims = verifyVerifyToken(token, req.payload.secret)
    if (!Number.isInteger(id) || !claims || claims.eventId !== id) {
      return htmlPage(
        'Link invalid or expired',
        'This verification link is no longer valid. Please sign in to verify the event, or wait for the next reminder email.',
        400,
      )
    }

    try {
      // Resolve the manager's display name for the log's `by` entry.
      const manager = await req.payload
        .findByID({ collection: 'managers', id: claims.managerId, depth: 0, overrideAccess: true })
        .catch(() => null)
      const name =
        (manager?.name as string | undefined) ||
        (manager?.email as string | undefined) ||
        `#${claims.managerId}`

      await applyVerification({
        payload: req.payload,
        eventId: id,
        method: 'email-link',
        by: { id: claims.managerId, name },
        overrideAccess: true,
      })
      return htmlPage(
        'Event verified',
        'Thank you — this event has been verified and will stay listed. You can close this page.',
        200,
      )
    } catch (error) {
      req.payload.logger.warn({
        msg: 'verifyEventLink: verification failed',
        eventId: id,
        managerId: claims.managerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return htmlPage(
        'Could not verify',
        'Something went wrong verifying this event. Please try again from the admin panel.',
        500,
      )
    }
  },
}
