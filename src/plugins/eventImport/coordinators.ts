/**
 * The coordinators a CSV names, matched to `managers` by email or created.
 *
 * A created account has `type: manager` and no roles; the login plugin's
 * `queueOnManagerField` invites them the moment a class names them as its
 * manager, so nothing here sends mail.
 */

import type { ManagerRequest } from './managers'
import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Manager } from '@/payload-types'

export interface Coordinators {
  /** Manager id by lower-cased email. */
  ids: Map<string, number>
  /** Why an email got no account, by lower-cased email. */
  failures: Map<string, string>
}

export async function ensureCoordinators(
  req: PayloadRequest,
  roster: readonly ManagerRequest[],
): Promise<Coordinators> {
  const ids = new Map<string, number>()
  const failures = new Map<string, string>()
  if (!roster.length) return { ids, failures }

  const existing = await managersByEmail(
    req,
    roster.map((request) => request.email),
  )

  for (const request of roster) {
    const match = existing.get(request.email)
    if (match !== undefined) {
      ids.set(request.email, match)
      continue
    }
    try {
      const manager = await req.payload.create({
        collection: 'managers',
        data: { name: request.name, email: request.email, type: 'manager', roles: null } as never,
        overrideAccess: true,
        depth: 0,
        select: { email: true },
        req,
      })
      ids.set(request.email, manager.id)
    } catch (error) {
      const fields = validationFieldErrors(error)
      if (!fields) throw error
      failures.set(
        request.email,
        `no account could be opened for ${request.email} (${describeValidationErrors(fields).join('; ')})`,
      )
    }
  }
  return { ids, failures }
}

async function managersByEmail(
  req: PayloadRequest,
  emails: readonly string[],
): Promise<Map<string, number>> {
  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { email: { in: [...emails] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { email: true },
    req,
  })
  return new Map(
    (docs as Manager[]).flatMap((manager) =>
      manager.email ? [[manager.email.toLowerCase(), manager.id] as const] : [],
    ),
  )
}
