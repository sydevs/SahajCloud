import type { ContactAdminResponse } from './responseTypes'
import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { parseBody, requireActiveClient } from '@/lib/endpoints'
import {
  antiSpamErrorResponse,
  checkEmailAllowed,
  checkNoUrls,
  verifyTurnstileOrFail,
} from '@/lib/endpoints/antiSpamGuard'
import { sendContactAdmin } from '@/lib/notifications/sendContactAdmin'
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

    // Cheap sync anti-spam checks first (shared with the write-guard plugin's
    // collection coverage — same codes, same copy): no links in the free-text
    // message, and no throwaway reply-to address. `context.error` is exempt —
    // a crash report legitimately contains URLs.
    const noUrls = checkNoUrls({ message })
    if (!noUrls.ok) return antiSpamErrorResponse(noUrls)
    const emailAllowed = checkEmailAllowed(email)
    if (!emailAllowed.ok) return antiSpamErrorResponse(emailAllowed)

    // Then the captcha: Cloudflare's verdict (forged / expired / replayed) is a
    // 403 with a distinguishable code so the caller resets its widget; our own
    // failure (unset secret, unreachable Cloudflare) is a 500 that never passes
    // and carries no code. Both mappings live in the shared guard.
    const verification = await verifyTurnstileOrFail(req, turnstileToken)
    if (!verification.ok) return antiSpamErrorResponse(verification)

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
