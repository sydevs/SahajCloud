import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'
import type { LocaleCode } from '@/lib/locales'
import { hasPermission } from '@/plugins/access'

import { applyReview, type ReviewAction } from '../lifecycle/review'

/**
 * POST /api/event-submissions/:id/review — the admin Accept/Reject buttons'
 * backend (the EventSubmissionSaveButton component). Manager-only, gated on
 * the same `event-submissions: update` permission that lets a manager see the
 * collection at all — NOT a client endpoint, so it deliberately skips
 * `requireActiveClient` and is not published in the OpenAPI spec (same stance
 * as the events verify action).
 *
 * Body: `{ action: 'accept' | 'reject' | 'reopen' }`. Response:
 * `{ ok, status, eventId? }`. `reopen` returns a spam/rejected submission to
 * `pending` — every status transition stays in `applyReview` rather than
 * letting the admin form PATCH `status` directly.
 */
export const reviewSubmission: Endpoint = {
  path: '/:id/review',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    // `locale` is required, not optional: a manager's roles are per-locale, so a
    // check with no locale grants them nothing and every non-admin 403s here (#665).
    if (
      !hasPermission({
        user: req.user,
        collection: 'event-submissions',
        operation: 'update',
        locale: req.locale === 'all' ? 'union' : (req.locale as LocaleCode | undefined),
      })
    ) {
      return Response.json(
        { errors: [{ message: 'You do not have permission to review submissions.' }] },
        { status: 403 },
      )
    }

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ errors: [{ message: 'Invalid submission id.' }] }, { status: 400 })
    }

    const body = req.json ? await req.json().catch(() => null) : null
    const action = (body as { action?: string } | null)?.action
    if (action !== 'accept' && action !== 'reject' && action !== 'reopen') {
      return Response.json(
        { errors: [{ message: 'action must be "accept", "reject" or "reopen".' }] },
        { status: 400 },
      )
    }

    try {
      const result = await applyReview({
        payload: req.payload,
        submissionId: id,
        action: action as ReviewAction,
        managerId: typeof req.user?.id === 'number' ? req.user.id : null,
        req,
      })
      return Response.json({ ok: true, status: result.status, eventId: result.eventId ?? null })
    } catch (error) {
      if (error instanceof APIError) {
        const code = (error.data as { code?: string } | undefined)?.code
        return Response.json(
          { errors: [{ message: error.message, ...(code ? { code } : {}) }] },
          { status: error.status },
        )
      }
      req.payload.logger.error({
        msg: 'reviewSubmission: review failed',
        submissionId: id,
        action,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { errors: [{ message: 'Could not apply the review. Please try again.' }] },
        { status: 500 },
      )
    }
  },
}
