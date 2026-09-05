import type { Endpoint } from 'payload'

import { z } from 'zod'

import { parseBody, requireActiveManager } from '@/lib/endpoints'
import type { ProjectSlug } from '@/payload-types'
import { isValidProject } from '@/plugins/access'

const bodySchema = z
  .object({
    // `null` is the admin "All Content" view. A slug selects a project.
    // `isValidProject` rejects `''`, so the sentinel this field once carried
    // cannot return through the one path that writes it.
    currentProject: z.string().nullable(),
  })
  .refine(({ currentProject }) => isValidProject(currentProject), {
    message: 'Invalid project.',
    path: ['currentProject'],
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

    try {
      const updated = await req.payload.update({
        collection: 'managers',
        id: managerId,
        data: { currentProject: currentProject as ProjectSlug | null },
        // Self-scoped: `id` is the caller's own document, so elevate past the
        // per-field access pipeline — that's the whole point of this endpoint.
        overrideAccess: true,
        depth: 0,
        req,
      })
      return Response.json({ ok: true, currentProject: updated.currentProject ?? null })
    } catch (error) {
      req.payload.logger.error({
        msg: 'setProject: failed to persist currentProject',
        managerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return Response.json({ errors: [{ message: 'Failed to change project.' }] }, { status: 500 })
    }
  },
}
