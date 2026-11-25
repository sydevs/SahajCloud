import type { Endpoint, PayloadRequest } from 'payload'

import { errorResponse } from '@/lib/endpoints'

import { impersonationCookie, readImpersonation, signImpersonation } from './cookie'
import { impersonatorOf, isSupportAccount, mayImpersonate } from './gate'

type ManagerFields = { email?: string | null; name?: string | null }

/**
 * POST /api/managers/impersonate/:id — the support account starts acting as
 * a manager. Anyone else is refused, an impersonated request included, so
 * impersonation never nests.
 *
 * ⚠ **One log line, and nothing stored.** That line is the only record that a
 * change saved afterwards was support's and not the manager's (decided
 * 2026-11-25: no audit collection, no notice to the manager).
 */
export const startImpersonation: Endpoint = {
  path: '/impersonate/:id',
  method: 'post',
  handler: async (req) => {
    const actor = req.user
    if (!actor || !isSupportAccount(actor)) {
      return errorResponse('Only the support account can sign in as another manager.', 403)
    }

    const target = await req.payload
      .findByID({
        collection: 'managers',
        id: req.routeParams?.id as string,
        depth: 0,
        joins: false,
        overrideAccess: true,
        select: { currentProject: true, email: true, name: true, type: true },
      })
      .catch(() => null)
    if (!target) return errorResponse('Manager not found.', 404)
    if (!mayImpersonate(actor, target)) {
      return errorResponse('Only an active, non-admin manager can be signed in as.', 400)
    }

    const token = await signImpersonation(req.payload, {
      actor: actor.id,
      actorSession: (actor as { _sid?: string })._sid ?? null,
      target: target.id,
      project: target.currentProject ?? null,
    })
    logImpersonation(req, 'start', target.id, target)

    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': impersonationCookie(req.payload, token) } },
    )
  },
}

/**
 * POST /api/managers/stop-impersonating — clears the cookie, so the next
 * request reads as support again. Open to any caller: clearing one's own
 * cookie grants nothing.
 */
export const stopImpersonation: Endpoint = {
  path: '/stop-impersonating',
  method: 'post',
  handler: (req) => {
    if (impersonatorOf(req.user))
      logImpersonation(req, 'stop', req.user!.id, req.user as ManagerFields)
    return Response.json(
      { ok: true, managerId: impersonatorOf(req.user) ? req.user!.id : null },
      { headers: { 'Set-Cookie': impersonationCookie(req.payload, null) } },
    )
  },
}

/**
 * Save the project switcher's choice into the cookie, for an impersonated
 * request. Returns the `Set-Cookie` value, or `null` when the request is not
 * impersonated and the caller should write the row as usual.
 */
export async function setImpersonatedProject(
  req: PayloadRequest,
  project: string | null,
): Promise<string | null> {
  if (!impersonatorOf(req.user)) return null
  const claims = await readImpersonation(req.payload, req.headers)
  if (!claims) return null
  return impersonationCookie(
    req.payload,
    await signImpersonation(req.payload, { ...claims, project }),
  )
}

function logImpersonation(
  req: PayloadRequest,
  event: 'start' | 'stop',
  targetId: number | string,
  target: ManagerFields,
): void {
  const actor = impersonatorOf(req.user) ?? (req.user as { id: number | string; email?: string })
  req.payload.logger.info(
    {
      event: `impersonation.${event}`,
      actorId: actor.id,
      actorEmail: actor.email,
      targetId,
      targetEmail: target.email,
    },
    `[impersonation] ${actor.email} ${event === 'start' ? 'started' : 'stopped'} acting as manager ${targetId} (${target.email})`,
  )
}
