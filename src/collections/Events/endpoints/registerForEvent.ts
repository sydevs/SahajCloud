import type { EventRegistrationError, EventRegistrationResponse } from './responseTypes'
import type { Endpoint, PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { APIError } from 'payload'
import { z } from 'zod'

import { parseBody, requireActiveClient } from '@/lib/endpoints'
import { DEFAULT_LOCALE, isValidLocale } from '@/lib/locales'
import { resolveRegistrationRecipient } from '@/lib/notifications/registrationRecipient'
import type { EmailClient } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendRegistrationConfirmation } from '@/lib/notifications/sendRegistrationConfirmation'
import { sendRegistrationNotification } from '@/lib/notifications/sendRegistrationNotification'
import { evaluateRegistrationGate } from '@/lib/registrations/gating'
import { buildRegistrationAnswers } from '@/lib/registrations/questions'
import { resolveEmailStrings } from '@/lib/translations/emailStrings'
import { relationId } from '@/lib/utilities/relationId'
import { asTrustedReq } from '@/plugins/usage/hooks'

const bodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(200),
  startingAt: z.string().datetime().optional(),
  // Language for the confirmation email (and #589's reminders). Validated
  // against the configured app locales — an unknown code is rejected rather
  // than silently defaulting, so a widget bug is visible instead of shipping
  // every registrant English.
  locale: z.string().refine(isValidLocale, 'unsupported locale').optional(),
  // Raw registrant answers, keyed by the event's enabled registration questions
  // (EVENT_REGISTRATION_QUESTIONS names, e.g. priorExperience / referralSource) —
  // resolved to their labels by buildRegistrationAnswers for the manager notice.
  // Bounded so a public caller can't persist unbounded JSON via the widget.
  questions: z
    .record(z.string(), z.unknown())
    .refine((q) => JSON.stringify(q).length <= 10_000, 'questions payload is too large')
    .optional(),
  // Mailing-list consent (opt-in). When true, stamp `mailingListSubscribedAt` on
  // the registration; absent/false leaves it unset. Sent by the Atlas widget's
  // consent checkbox (sydevs/SahajAtlasWeb#25).
  subscribe: z.boolean().optional(),
})

/**
 * Load the branding fields for the client service the registration came through.
 *
 * `req.user` is the authenticated client, but its `logo` is an unpopulated id —
 * the email needs the Image's `filename` to build a delivery URL, so this
 * re-reads at `depth: 1`. Bounded by a `select` per `.claude/rules/endpoints.md`,
 * and wrapped in `asTrustedReq` so the client-query gate doesn't reject an
 * internal read the caller never asked for.
 *
 * Returns `null` on any failure — an unbranded email beats no email.
 *
 * **Invariant: `clientId` must be the authenticated client's own id**
 * (`req.user.id`, the sole caller below). `overrideAccess` is required because
 * the `clients` collection is unreadable by API clients — the same reason the
 * `users` upsert in the handler elevates — so it reads a service's *own*
 * branding, never another's. Do not pass an id sourced from the request body.
 */
async function loadEmailClient(
  req: PayloadRequest,
  clientId: number | undefined,
): Promise<EmailClient | null> {
  if (clientId == null) return null
  try {
    return await req.payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 1,
      select: {
        name: true,
        color1: true,
        color2: true,
        logo: true,
        websiteUrl: true,
        supportEmail: true,
      },
      overrideAccess: true,
      req: asTrustedReq(req),
    })
  } catch (error) {
    req.payload.logger.warn({
      msg: 'registerForEvent: could not load client branding; using default brand',
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * POST /api/events/:id/register
 *
 * The widget's write path (`:id` is the event id). The `sahaj-atlas-client` role
 * is read-only and the `users` collection is admin-only, so a registration can't
 * be created by a frontend-only flow — this endpoint owns it. Gated by a
 * published client key (`requireActiveClient`); the event-existence read below is
 * an ordinary client read, so Cloudflare edge rate limiting + the usage plugin's
 * tracking cover abuse exactly as they do for every other client request.
 * Per-origin `allowedDomains` enforcement also applies: the events lookup runs the
 * usage plugin's `validateClientOriginHook`, which 403s a disallowed Origin/Referer
 * (surfaced verbatim by the catch below).
 *
 * Flow: parse the `:id` + body → confirm the event is one the client may see
 * (published + project-visible) → upsert the registrant `user` by normalized
 * email with elevated access (`users` is admin-only) → create the `registration`
 * (event + user + startingAt + questions + a fresh uuid, plus the originating
 * `client` and `locale`, and `mailingListSubscribedAt` when the registrant opted
 * in via `subscribe`) → send the branded confirmation email.
 * Returns `EventRegistrationResponse`.
 *
 * The send is best-effort by design (#582): the registrant is already
 * registered when it runs, so a failure is logged and the response stays 201.
 */
export const registerForEvent: Endpoint = {
  path: '/:id/register',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const eventId = Number(req.routeParams?.id)
    if (!Number.isInteger(eventId)) {
      return Response.json({ errors: [{ message: 'Invalid event id.' }] }, { status: 400 })
    }

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { email, name, startingAt, questions, subscribe, locale } = parsed.data
    const registrantLocale = locale ?? DEFAULT_LOCALE

    try {
      // Only register for an event this client may actually read (published +
      // project-visible). asTrustedReq skips the select requirement; the
      // overrideAccess:false access filter makes arbitrary/unpublished ids 404.
      const { docs: eventDocs } = await req.payload.find({
        collection: 'events',
        where: { id: { equals: eventId } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
        req: asTrustedReq(req),
      })
      if (eventDocs.length === 0) {
        return Response.json(
          { errors: [{ message: 'Event not found or not open for registration.' }] },
          { status: 404 },
        )
      }
      const event = eventDocs[0]

      // State-based gating: an event the client *can* read may still be closed
      // to new registrations (external mode / ended / a started course / full).
      // Refuse with a machine-readable `code` the widget maps to its UI. Capacity
      // is checked against a live count (the denormalized `registrationsFull` flag
      // is only the read-time hint); registrations are admin-only, hence the
      // elevated count. The count→create window isn't transactional, so a burst of
      // concurrent registrations can overshoot the limit by a few — an acceptable
      // soft cap here (a meditation class, not ticketed inventory); a hard cap
      // would need a row lock or DB constraint.
      const { totalDocs: registrationCount } = await req.payload.count({
        collection: 'registrations',
        where: { event: { equals: eventId } },
        overrideAccess: true,
        req,
      })
      const rejection = evaluateRegistrationGate({ event, registrationCount, now: new Date() })
      if (rejection) {
        const body: EventRegistrationError = {
          errors: [{ message: rejection.message, code: rejection.code }],
        }
        return Response.json(body, { status: rejection.status })
      }

      // Upsert the registrant by normalized email. `users` is admin-only, so the
      // client can't touch it directly — elevate via overrideAccess.
      const normalizedEmail = email.toLowerCase()
      const { docs: userDocs } = await req.payload.find({
        collection: 'users',
        where: { email: { equals: normalizedEmail } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req: asTrustedReq(req),
      })
      let userId = userDocs[0]?.id
      if (userId == null) {
        try {
          const created = await req.payload.create({
            collection: 'users',
            data: { name, email: normalizedEmail },
            overrideAccess: true,
            req,
          })
          userId = created.id
        } catch (createError) {
          // A concurrent registration with the same email can create the user
          // between our find and create (email is unique) — re-find rather than 500.
          const { docs: raced } = await req.payload.find({
            collection: 'users',
            where: { email: { equals: normalizedEmail } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req: asTrustedReq(req),
          })
          if (raced[0]?.id == null) throw createError
          userId = raced[0].id
        }
      }

      const clientId = typeof req.user?.id === 'number' ? req.user.id : undefined

      const registration = await req.payload.create({
        collection: 'registrations',
        data: {
          event: eventId,
          user: userId,
          startingAt,
          questions,
          uuid: randomUUID(),
          // Provenance for this and every later email about the registration.
          client: clientId,
          locale: registrantLocale,
          // Record consent at registration time; omit when not opted in.
          mailingListSubscribedAt: subscribe ? new Date().toISOString() : undefined,
        },
        overrideAccess: true,
        req,
      })

      // The registrant is already registered — a failed send must not undo that
      // or surface as an error, so this is logged and swallowed. Awaited rather
      // than fire-and-forget: a floating promise can be killed by the serverless
      // runtime when the response returns, dropping the email silently.
      try {
        // The client read and the translations read are independent, so they
        // overlap rather than run back to back. The second result is discarded
        // here on purpose: `resolveEmailStrings` memoizes its in-flight promise
        // on `req.context`, so the call inside the send below reuses this one.
        const [emailClient] = await Promise.all([
          loadEmailClient(req, clientId),
          resolveEmailStrings({ payload: req.payload, locale: registrantLocale, req }),
        ])

        await sendRegistrationConfirmation({
          payload: req.payload,
          event,
          client: emailClient,
          registrantName: name,
          registrantEmail: normalizedEmail,
          locale: registrantLocale,
          registrationUuid: registration.uuid,
          req,
        })
      } catch (sendError) {
        req.payload.logger.error({
          msg: 'registerForEvent: confirmation email failed; registration kept',
          registrationId: registration.id,
          clientId,
          eventId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        })
      }

      // Notify the event manager — or a per-event override address — that a
      // registration came in. Independent of the confirmation above and equally
      // best-effort: a failure here must not undo the registration or change the
      // 201. The event was read at depth 0, so `manager` is a bare id; resolve it
      // separately (as the verification path does) rather than re-reading the
      // event at a higher depth, which the confirmation send also relies on.
      try {
        const managerId = relationId(event.manager)
        const manager = managerId
          ? await req.payload
              .findByID({
                collection: 'managers',
                id: managerId,
                depth: 0,
                overrideAccess: true,
                req: asTrustedReq(req),
              })
              .catch(() => null)
          : null

        const recipient = resolveRegistrationRecipient(event, manager)
        // Only `Immediate` delivers here; summary cadences are the digest run's
        // job (follow-up ticket), and `Never` / no recipient send nothing.
        if (recipient && recipient.frequency === 'Immediate') {
          await sendRegistrationNotification({
            payload: req.payload,
            recipient,
            event,
            registrantName: name,
            registrantEmail: normalizedEmail,
            startingAt,
            // Forward the registrant's answers to the event's questions, labelled.
            answers: buildRegistrationAnswers(questions),
          })
        }
      } catch (notifyError) {
        req.payload.logger.error({
          msg: 'registerForEvent: manager registration notification failed; registration kept',
          registrationId: registration.id,
          eventId,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        })
      }

      const body: EventRegistrationResponse = {
        ok: true,
        registration: { id: registration.id, uuid: registration.uuid },
      }
      return Response.json(body, { status: 201 })
    } catch (error) {
      // validateClientOriginHook throws APIError(403) for a disallowed origin (and
      // query validation could throw 400) from the reads above — surface its
      // status + message verbatim rather than masking it as a 500.
      if (error instanceof APIError) {
        return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
      }
      req.payload.logger.error({
        msg: 'registerForEvent: registration failed',
        clientId: req.user?.id,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { errors: [{ message: 'Failed to register for this event.' }] },
        { status: 500 },
      )
    }
  },
}
