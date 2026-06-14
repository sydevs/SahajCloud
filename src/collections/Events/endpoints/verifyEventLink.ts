import type { Endpoint } from 'payload'

import { verifyVerifyToken } from '@/lib/eventVerification/token'
import type { EmailBrand } from '@/plugins/email'
import { getEmailBrand } from '@/plugins/email'

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

/** Outcome → the emblem + accent the card uses. */
const TONES = {
  success: { emoji: '✅', accent: '#16a34a' },
  warning: { emoji: '⏰', accent: '#f59e0b' },
  error: { emoji: '⚠️', accent: '#ef4444' },
} as const

interface PageOptions {
  title: string
  message: string
  status: number
  tone: keyof typeof TONES
}

/**
 * Build the self-contained, Sahaj Atlas–branded confirmation page (the link
 * opens logged-out, so it can't rely on the admin shell). Mirrors the reminder
 * email's gradient header + card. `title`/`message` are escaped, so it stays
 * safe even if a future caller passes dynamic (event- or token-derived) text —
 * today they're static copy. Exported (pure) so it can be previewed/tested.
 */
export function buildConfirmationHtml(
  brand: EmailBrand,
  { title, message, tone }: Omit<PageOptions, 'status'>,
): string {
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)
  const safeBrand = escapeHtml(brand.productName)
  const { emoji, accent } = TONES[tone]
  const { primary, light } = brand.colors

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><div style="max-width:520px;margin:0 auto;padding:40px 20px"><div style="border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="text-align:center;padding:30px;background-color:${primary};background-image:linear-gradient(135deg, ${primary} 0%, ${light} 100%)"><img alt="${safeBrand}" width="48" height="48" src="${brand.iconUrl}" style="display:block;margin:0 auto 12px;padding:8px;border-radius:50%;background-color:#ffffff;object-fit:contain"><h1 style="color:#ffffff;margin:0;font-size:22px">${safeBrand}</h1></div><div style="background-color:#ffffff;padding:36px 30px;text-align:center"><div style="font-size:44px;line-height:1;margin-bottom:12px">${emoji}</div><h2 style="margin:0 0 12px;font-size:20px;color:${accent}">${safeTitle}</h2><p style="margin:0;color:#555;line-height:1.6;font-size:15px">${safeMessage}</p></div></div></div></body></html>`
}

/** Wrap {@link buildConfirmationHtml} in a `text/html` Response at `status`. */
function htmlPage(brand: EmailBrand, options: PageOptions): Response {
  return new Response(buildConfirmationHtml(brand, options), {
    status: options.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
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
    // Events are Sahaj Atlas — brand the page to match the reminder email.
    const brand = getEmailBrand('sahaj-atlas')

    const claims = verifyVerifyToken(token, req.payload.secret)
    if (!Number.isInteger(id) || !claims || claims.eventId !== id) {
      return htmlPage(brand, {
        title: 'Link invalid or expired',
        message:
          'This verification link is no longer valid. Please sign in to verify the event, or wait for the next reminder email.',
        status: 400,
        tone: 'warning',
      })
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
      return htmlPage(brand, {
        title: 'Event verified',
        message:
          'Thank you — this event has been verified and will stay listed. You can close this page.',
        status: 200,
        tone: 'success',
      })
    } catch (error) {
      req.payload.logger.warn({
        msg: 'verifyEventLink: verification failed',
        eventId: id,
        managerId: claims.managerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return htmlPage(brand, {
        title: 'Could not verify',
        message:
          'Something went wrong verifying this event. Please try again from the admin panel.',
        status: 500,
        tone: 'error',
      })
    }
  },
}
