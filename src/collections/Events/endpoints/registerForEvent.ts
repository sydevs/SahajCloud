import type { EventRegistrationResponse } from './responseTypes'
import type { Endpoint } from 'payload'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { parseBody, requireActiveClient } from '@/lib/endpoints'
import { asTrustedReq } from '@/plugins/usage/hooks'

const bodySchema = z.object({
  event: z.coerce.number().int().positive(),
  email: z.string().email(),
  name: z.string().trim().min(1),
  startingAt: z.string().datetime().optional(),
  // Raw registrant answers (keys: questions / experience / aspirations / referral).
  questions: z.record(z.string(), z.unknown()).optional(),
})

/**
 * POST /api/events/register
 *
 * The widget's write path. The `sahaj-atlas-client` role is read-only and the
 * `users` collection is admin-only, so a registration can't be created by a
 * frontend-only flow — this endpoint owns it. Gated by a published client key
 * (`requireActiveClient`); the event-existence read below is an ordinary client
 * read, so Cloudflare edge rate limiting + the usage plugin's tracking cover
 * abuse exactly as they do for every other client request. (Per-origin
 * `allowedDomains` enforcement is deferred to #509.)
 *
 * Flow: validate the body → confirm the event is one the client may see
 * (published + project-visible) → upsert the registrant `user` by normalized
 * email with elevated access (`users` is admin-only) → create the `registration`
 * (event + user + startingAt + questions + a fresh uuid). Returns
 * `EventRegistrationResponse`.
 */
export const registerForEvent: Endpoint = {
  path: '/register',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { event: eventId, email, name, startingAt, questions } = parsed.data

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
        const created = await req.payload.create({
          collection: 'users',
          data: { name, email: normalizedEmail },
          overrideAccess: true,
          req,
        })
        userId = created.id
      }

      const registration = await req.payload.create({
        collection: 'registrations',
        data: { event: eventId, user: userId, startingAt, questions, uuid: randomUUID() },
        overrideAccess: true,
        req,
      })

      const body: EventRegistrationResponse = {
        ok: true,
        registration: { id: registration.id, uuid: registration.uuid },
      }
      return Response.json(body, { status: 201 })
    } catch (error) {
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
