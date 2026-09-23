import type { Endpoint } from 'payload'

import { APIError, Forbidden } from 'payload'

import { validationFieldErrors } from '@/lib/events/validationFailure'

import { actorFromUser, applyVerification } from '../lifecycle/verify'

/**
 * POST /api/events/:id/verify
 *
 * The admin "Verify" button (in the verification notice banner). Requires an
 * authenticated manager; the write runs with `overrideAccess: false` so the
 * access plugin enforces that this manager may update the event (its manager,
 * a region manager, or an admin). Runs the shared verify op (method
 * `verify-action`).
 *
 * Answers 422 with the field errors when the event's stored data fails
 * validation, and keeps 403 for an access failure — two different failures.
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
      // Classify, never assume. This catch answered 403 for every failure, so
      // invalid stored data told a manager who may edit the event to ask for
      // access they already have (#842) — and so would a database outage. The
      // write keeps validating on purpose: the data is fixed first, then the
      // event is verified.
      const fieldErrors = validationFieldErrors(error)
      if (fieldErrors) {
        return Response.json(
          { errors: fieldErrors.map(({ path, message }) => ({ path, message })) },
          { status: 422 },
        )
      }
      if (error instanceof Forbidden) {
        return Response.json(
          { errors: [{ message: 'You are not allowed to verify this event.' }] },
          { status: 403 },
        )
      }
      // Anything else is ours, not the caller's. `isPublic` is Payload's own
      // answer to whether a message may be shown, so nothing else is echoed.
      const status = error instanceof APIError ? error.status : 500
      const message =
        error instanceof APIError && error.isPublic
          ? error.message
          : 'Could not verify this event. Please try again.'
      return Response.json({ errors: [{ message }] }, { status })
    }
  },
}
