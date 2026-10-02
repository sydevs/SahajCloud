/**
 * The commit's second step: an account for every coordinator the batch names.
 *
 * ⚠ **Before any class is written, not per row.** Two rows naming one
 * coordinator must adopt one account, and matching the address only when its
 * first row comes up would race the create against itself inside a chunk.
 * `managerRoster` reduces the batch to one request per address
 * (`commit/managers.ts`); this answers each one once.
 *
 * ⚠ **Idempotent through the address, like the regions are through
 * `mapboxId`.** `Managers.email` is unique and lowercased on write, so a
 * re-fired commit matches the account its predecessor created.
 *
 * ⚠ **Creating an account sends nothing.** A manager is invited when they are
 * assigned something, never on create (`src/plugins/login/invitations.ts`,
 * #839) — so an imported coordinator holds an unverified account until a region
 * or a role reaches them, which stays a manual step (#828).
 */

import type { ManagerRequest } from './managers'
import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Manager } from '@/payload-types'

export interface Coordinators {
  /** Lowercased address mapped to the account vouching for its classes. */
  ids: Map<string, number>
  /** Lowercased address mapped to why it has no account. */
  refusals: Map<string, string>
  matched: number
  created: number
}

export async function ensureCoordinators(
  req: PayloadRequest,
  roster: readonly ManagerRequest[],
): Promise<Coordinators> {
  const ids = new Map<string, number>()
  const refusals = new Map<string, string>()
  if (!roster.length) return { ids, refusals, matched: 0, created: 0 }

  const existing = await managersByEmail(
    req,
    roster.map((request) => request.email),
  )
  let created = 0

  for (const request of roster) {
    const match = existing.get(request.email)
    if (match !== undefined) {
      ids.set(request.email, match)
      continue
    }

    try {
      const manager = await req.payload.create({
        collection: 'managers',
        // ⚠ **Stated, never left to the hook that would otherwise force it.**
        // `forceManagedTypeAndRoles` rewrites these two for a non-admin creator
        // only (`src/collections/Managers/access.ts`), so a commit fired by an
        // admin would pass whatever reached it — and this write elevates past
        // the field locks on both columns.
        data: {
          name: request.name,
          email: request.email,
          type: 'manager',
          roles: null,
        } as never,
        overrideAccess: true,
        depth: 0,
        req,
      })
      ids.set(request.email, manager.id)
      created += 1
    } catch (error) {
      refusals.set(request.email, refusalOf(error))
    }
  }

  return { ids, refusals, matched: ids.size - created, created }
}

/**
 * The accounts already holding any of these addresses.
 *
 * `email` is locked to the account holder and admins
 * (`src/collections/Managers/access.ts`), so this read elevates past field
 * access to get the column it matches on — the gate is the caller's ownership
 * of the batch and its target, settled before the commit starts.
 *
 * ⚠ **One spelling, because the review asks the same question.** It shows a
 * volunteer how many accounts a commit would open before they ask for one
 * (`endpoints/review.ts`), and a second read answering differently would be a
 * banner the commit then contradicts. The review keeps only the keys — the ids
 * are for the writes that follow this one.
 */
export async function managersByEmail(
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

/** Why an account could not be created, in words the review can show. */
function refusalOf(error: unknown): string {
  const fields = validationFieldErrors(error)
  if (fields?.length) return describeValidationErrors(fields).join('; ')
  return 'this coordinator could not be given an account'
}
