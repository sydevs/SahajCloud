import type { Endpoint } from 'payload'

import { z } from 'zod'

import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'
import { isValidProject } from '@/plugins/access'
import { setImpersonatedProject } from '@/plugins/login'
import { reportHandlerFailure } from '@/plugins/sentry/handlerFailure'

const bodySchema = z.object({
  // `null` is the admin "All Content" view. A slug selects a project.
  // `isValidProject` checks the slug exists, not that the caller holds it; `''`
  // is no slug. Nothing here needs to — see the grant note below.
  //
  // The refine sits on the field, so its predicate narrows `parsed.data`.
  currentProject: z.string().nullable().refine(isValidProject, { message: 'Invalid project.' }),
})

/**
 * POST /api/managers/set-project
 *
 * Self-only write path for the sidebar Current Project selector. Persists ONLY
 * `currentProject` on the **authenticated manager's own** document, so it skips
 * the generic `PATCH /api/managers/:id` pipeline — full-document validation plus
 * the per-field access resolution across every Managers field — that dominates
 * the perceived project-switch latency (#532).
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard is for public API
 * `clients`; this serves an authenticated admin-panel `manager` acting on
 * itself (self-scoped via `req.user.id`, never an arbitrary id). For the same
 * reason it is absent from the OpenAPI client spec — `managers` is admin-only /
 * in no project, so it exposes no public paths. `currentProject` is purely
 * presentational (it drives `admin.hidden` nav visibility, not access grants),
 * so this write can never widen what the caller may see.
 */
export const setProject: Endpoint = {
  path: '/set-project',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied
    const managerId = req.user!.id

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { currentProject } = parsed.data

    // Support acting as this manager: the choice lives in the impersonation
    // cookie, so the manager's own row keeps the project they left it on.
    const impersonatedCookie = await setImpersonatedProject(req, currentProject)
    if (impersonatedCookie) {
      return Response.json(
        { ok: true, currentProject },
        { headers: { 'Set-Cookie': impersonatedCookie } },
      )
    }

    try {
      const updated = await req.payload.update({
        collection: 'managers',
        id: managerId,
        data: { currentProject },
        // Self-scoped: `id` is the caller's own document, so elevate past the
        // per-field access pipeline — that's the whole point of this endpoint.
        overrideAccess: true,
        depth: 0,
        req,
      })
      return Response.json({ ok: true, currentProject: updated.currentProject ?? null })
    } catch (error) {
      // Not `readFailureResponse`: that surfaces an `APIError`'s own status, and
      // `payload.update` can throw a localised `ValidationError` — this write's
      // answer is uniform by design. The report is the one every site makes.
      reportHandlerFailure({
        error,
        extra: { managerId },
        handler: 'managers/set-project',
        logger: req.payload.logger,
        message: 'setProject: failed to persist currentProject',
        status: 500,
      })
      return errorResponse('Failed to change project.', 500)
    }
  },
}
