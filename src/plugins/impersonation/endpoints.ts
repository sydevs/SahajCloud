import type { Impersonator } from './gate'
import type { Endpoint, PayloadRequest } from 'payload'

import { errorResponse } from '@/lib/endpoints'
import type { ProjectSlug } from '@/payload-types'

import { impersonationCookie, readImpersonation, signImpersonation } from './cookie'
import { type GateUser, impersonatorOf, isSupportAccount, mayImpersonate } from './gate'

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
    const actor = req.user as (GateUser & { id: number | string; email: string }) | null
    if (!isSupportAccount(actor)) {
      return errorResponse('Only the support account can sign in as another manager.', 403)
    }

    const target = await req.payload.findByID({
      collection: 'managers',
      id: req.routeParams?.id as string,
      depth: 0,
      disableErrors: true,
      joins: false,
      overrideAccess: true,
      select: { _verified: true, currentProject: true, email: true, type: true },
    })
    if (!target) return errorResponse('Manager not found.', 404)
    if (!mayImpersonate(target)) {
      return errorResponse(
        'Only an active, non-admin manager who has confirmed their email can be signed in as.',
        400,
      )
    }

    const token = await signImpersonation(req.payload, {
      actor: actor!.id,
      actorSession: actor!._sid ?? null,
      target: target.id,
      project: target.currentProject ?? null,
    })
    logImpersonation(req, 'started', actor!, target)

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
    const actor = impersonatorOf(req.user)
    if (actor) logImpersonation(req, 'stopped', actor, req.user as GateUser & { id: number })
    return Response.json(
      { ok: true },
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
  project: ProjectSlug | null,
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
  event: 'started' | 'stopped',
  actor: Impersonator,
  target: { id: number | string; email?: string | null },
): void {
  req.payload.logger.info(
    {
      event: `impersonation.${event === 'started' ? 'start' : 'stop'}`,
      actorId: actor.id,
      actorEmail: actor.email,
      targetId: target.id,
      targetEmail: target.email,
    },
    `[impersonation] ${actor.email} ${event} acting as manager ${target.id} (${target.email})`,
  )
}
