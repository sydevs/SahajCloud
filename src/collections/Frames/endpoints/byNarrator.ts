import type { Endpoint } from 'payload'

import { z } from 'zod'

import { bypassPermissions, hasPermission } from '@/plugins/access'
import { asTrustedReq } from '@/plugins/usage/hooks'

const paramsSchema = z.object({
  narratorId: z.string().min(1),
})

/**
 * GET /api/frames/by-narrator/:narratorId
 *
 * Returns frames filtered by the narrator's gender (imageSet).
 * Sort by mimeType to show images before videos (image/* < video/*).
 *
 * Access: gated on `frames` read permission, so anyone who can read frames may
 * use it — admins, managers whose project includes frames (the admin
 * FrameInserter caller), and published web/app API clients pass; unauthenticated
 * callers and clients without frames access (e.g. sahaj-atlas) get 403. The
 * narrator/frames reads run with `overrideAccess: false` + the caller's `req`
 * so the access plugin enforces per-project scoping and usage tracking fires for
 * clients. Without the gate the Local-API default `overrideAccess: true` would
 * let anyone — including unauthenticated requests — read narrator + frames data.
 */
export const framesByNarrator: Endpoint = {
  path: '/by-narrator/:narratorId',
  method: 'get',
  handler: async (req) => {
    // Gate first so param-validation details don't leak to callers who can't
    // read frames. `bypassPermissions` admits admins / denies inactive users;
    // `locale` is required so a manager's per-locale roles resolve.
    const canReadFrames = hasPermission(
      {
        user: req.user,
        collection: 'frames',
        operation: 'read',
        locale: req.locale === 'all' ? undefined : req.locale,
      },
      bypassPermissions,
    )
    if (!canReadFrames) {
      return Response.json(
        { errors: [{ message: 'You are not allowed to perform this action.' }] },
        { status: 403 },
      )
    }

    const parsed = paramsSchema.safeParse({
      narratorId: req.routeParams?.narratorId,
    })

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { narratorId } = parsed.data

    // Forward the caller's req with `overrideAccess: false` so the access plugin
    // enforces read access on narrators + frames. Wrapped via `asTrustedReq` so
    // the client query-param validation (which requires `select`) is skipped —
    // the query below is constructed server-side, not from client params.
    const trustedReq = asTrustedReq(req)

    // Look up narrator to get gender (findByID throws NotFound on invalid ID)
    let narrator
    try {
      narrator = await req.payload.findByID({
        collection: 'narrators',
        id: narratorId,
        depth: 0,
        overrideAccess: false,
        req: trustedReq,
      })
    } catch {
      return Response.json({ errors: [{ message: 'Narrator not found' }] }, { status: 404 })
    }

    // Get frames filtered by narrator's gender (imageSet)
    // Sort by mimeType to show images before videos (image/* < video/*).
    // depth: 1 hydrates `subtleSystemNode` so the FrameInserter can group by slug.
    const frames = await req.payload.find({
      collection: 'frames',
      where: { imageSet: { equals: narrator.gender } },
      sort: 'mimeType',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      req: trustedReq,
    })

    return Response.json(frames)
  },
}
