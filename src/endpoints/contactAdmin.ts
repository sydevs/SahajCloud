import type { ContactAdminError, ContactAdminResponse } from './responseTypes'
import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { parseBody, requireActiveClient } from '@/lib/endpoints'
import { sendContactAdmin } from '@/lib/notifications/sendContactAdmin'
import { verifyTurnstileToken } from '@/lib/turnstile/verifyTurnstile'
import { assertClientOriginAllowed } from '@/plugins/usage'

/**
 * Every bound is explicit: this is a public write path, so an unbounded field is
 * an unbounded email body (and an unbounded siteverify payload). `message` has a
 * floor as well as a ceiling — a two-character "hi" is noise, not a report.
 */
const bodySchema = z.object({
  message: z.string().trim().min(10).max(5000),
  email: z.string().email().max(254).optional(),
  // The caller's own label for the channel, e.g. "Issue report" (Atlas) — this
  // and `context` are what keep the endpoint reusable: WeMeditateWeb sends its
  // own label and its own context values with no schema change.
  subject: z.string().trim().max(200).optional(),
  turnstileToken: z.string().max(2048),
  context: z
    .object({
      path: z.string().max(500).optional(),
      hostUrl: z.string().max(500).optional(),
      locale: z.string().max(20).optional(),
      error: z.string().max(2000).optional(),
      userAgent: z.string().max(500).optional(),
    })
    .optional(),
})

/** Subject label used when the caller doesn't send one. */
const DEFAULT_SUBJECT = 'Message'

/**
 * POST /api/contact-admin
 *
 * A shared, general-purpose channel for client apps to send us a message on a
 * viewer's behalf — the Atlas widget's "Report an issue" form (sydevs/SahajAtlasWeb#79)
 * first, WeMeditateWeb's contact surfaces next. Email only: nothing is persisted
 * and there is no admin UI (#602), so the send *is* the deliverable.
 *
 * Registered at the config root rather than on a collection (the only such
 * endpoint) because a contact message belongs to no collection — see
 * `.claude/rules/endpoints.md`.
 *
 * Flow: published-client auth → origin allowlist → body validation → Turnstile
 * verification → send. Verification runs before any email work so a forged or
 * replayed token costs us nothing.
 *
 * Two gates differ from the collection endpoints, both because this handler
 * touches no collection and so runs none of the usage plugin's beforeOperation
 * hooks:
 *
 * - **Origin** is enforced by calling `assertClientOriginAllowed` directly. The
 *   `clients` collection is excluded from the usage plugin, so even a client
 *   re-read wouldn't have triggered it.
 * - **Usage tracking / rate limiting** don't apply here either. Cloudflare edge
 *   rate limiting still fronts this route like every other request, and the
 *   captcha is the real abuse gate.
 *
 * Returns `ContactAdminResponse` (`{ ok: true }`) on success.
 */
export const contactAdmin: Endpoint = {
  path: '/contact-admin',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    try {
      assertClientOriginAllowed(req)
    } catch (error) {
      if (error instanceof APIError) {
        return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
      }
      throw error
    }

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { message, email, subject, turnstileToken, context } = parsed.data

    // Cloudflare sets CF-Connecting-IP at the edge; it's absent for a direct
    // origin hit, which siteverify tolerates (remoteip is optional).
    const remoteIp = req.headers?.get?.('cf-connecting-ip')
    const verification = await verifyTurnstileToken(turnstileToken, remoteIp)

    if (!verification.success) {
      if (verification.reason === 'rejected') {
        // Cloudflare's verdict: forged, expired, or already redeemed (tokens are
        // single-use, so a replay lands here). A distinguishable code lets the
        // caller reset its widget and let the sender retry.
        req.payload.logger.warn({
          msg: 'contactAdmin: Turnstile token rejected',
          clientId: req.user?.id,
          errorCodes: verification.errorCodes,
        })
        const body: ContactAdminError = {
          errors: [
            { message: 'Captcha verification failed. Please try again.', code: 'captcha_failed' },
          ],
        }
        return Response.json(body, { status: 403 })
      }

      // Our own failure — an unset secret or an unreachable Cloudflare. Never
      // pass on it (that would silently disable the gate), and don't tell a
      // public caller which it was.
      req.payload.logger.error({
        msg: 'contactAdmin: Turnstile verification could not be completed',
        clientId: req.user?.id,
        reason: verification.reason,
      })
      return Response.json(
        { errors: [{ message: 'Could not verify the captcha. Please try again later.' }] },
        { status: 500 },
      )
    }

    try {
      await sendContactAdmin({
        payload: req.payload,
        clientName: typeof req.user?.name === 'string' ? req.user.name : 'Unknown service',
        message,
        subject: subject || DEFAULT_SUBJECT,
        senderEmail: email,
        context,
        receivedAt: new Date().toISOString(),
      })
    } catch (error) {
      // The email is the deliverable — a failed send is a failed request, not a
      // silent drop. 502: we accepted the message but the upstream mail provider
      // didn't, so the caller can tell the sender it didn't go through.
      req.payload.logger.error({
        msg: 'contactAdmin: message email failed to send',
        clientId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { errors: [{ message: 'Could not deliver your message. Please try again later.' }] },
        { status: 502 },
      )
    }

    const body: ContactAdminResponse = { ok: true }
    return Response.json(body)
  },
}
