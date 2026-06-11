import type { Endpoint } from 'payload'

import { actorFromUser, applyVerification } from '../lifecycle/verify'

/**
 * POST /api/events/:id/verify
 *
 * The admin "Verify" button (in the verification notice banner). Requires an
 * authenticated manager; the write runs with `overrideAccess: false` so the
 * access plugin enforces that this manager may update the event (its manager,
 * a region manager, or an admin). Runs the shared verify op (method
 * `verify-action`).
 */
export const verifyEventAction: Endpoint = {
  path: '/:id/verify',
  method: 'post',
  handler: async (req) => {
    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id)) {
      return Response.json({ errors: [{ message: 'Invalid event id.' }] }, { status: 400 })
    }
    if (req.user?.collection !== 'managers') {
      return Response.json(
        { errors: [{ message: 'You must be signed in to verify this event.' }] },
        { status: 401 },
      )
    }

    try {
      await applyVerification({
        payload: req.payload,
        eventId: id,
        method: 'verify-action',
        by: actorFromUser(req.user),
        req,
        overrideAccess: false,
      })
      return Response.json({ ok: true })
    } catch (error) {
      req.payload.logger.warn({
        msg: 'verifyEventAction: verification failed',
        eventId: id,
        userId: req.user.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { errors: [{ message: 'You are not allowed to verify this event.' }] },
        { status: 403 },
      )
    }
  },
}
