/**
 * The commit's second step: an account for every coordinator the rows name.
 *
 * ⚠ **For the rows about to be written, not for every row the batch holds.**
 * Opening every coordinator's account up front left accounts holding CSV names
 * and addresses behind for rows that then failed. Two rows naming one
 * coordinator still share one request (`managerRoster`), and a retried commit
 * finds the account its predecessor opened.
 *
 * ⚠ **An existing account is linked only when it is an active coordinator who
 * already looks after something inside the target.** A volunteer's CSV could
 * otherwise name any address the Atlas holds — an admin's, a deactivated
 * account's, a coordinator's on another continent — and make them the vouching
 * coordinator of a class they never agreed to run, stamped `verified` and
 * reaching their inbox. Such a class is imported without a coordinator, and the
 * row says why (`unlinked`).
 *
 * ⚠ **Idempotent through the address.** `Managers.email` is unique and
 * lowercased on write, so a re-fired commit matches the account its predecessor
 * created — which, holding this batch's classes, is inside the target by then.
 *
 * ⚠ **Creating an account sends nothing; naming the class's manager does.**
 * `queueOnManagerField` (`src/plugins/login/invitations.ts`) queues the sign-in
 * invitation when `Events.manager` is set, so nothing here mails anybody and
 * nothing here suppresses it either. A coordinator whose address this step
 * refused to link is never named, so they are never written to.
 */

import type { ManagerRequest } from './managers'
import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Manager, Region } from '@/payload-types'

export interface Coordinators {
  /** Lowercased address mapped to the account vouching for its classes. */
  ids: Map<string, number>
  /** Lowercased address mapped to why its classes go without a coordinator. */
  unlinked: Map<string, string>
  matched: number
  created: number
}

/**
 * How every unlinked-coordinator note on a row begins, so the tally can tell a
 * class imported without its coordinator from one imported with it.
 */
export const UNLINKED_NOTE = 'imported without a coordinator'

/** What a row is told when its coordinator's existing account is not linked. */
export const UNLINKED_COORDINATOR = `${UNLINKED_NOTE}: this address already has an account an import cannot link — an admin can assign it`

export async function ensureCoordinators(
  req: PayloadRequest,
  roster: readonly ManagerRequest[],
  subtreeIds: readonly number[],
): Promise<Coordinators> {
  const ids = new Map<string, number>()
  const unlinked = new Map<string, string>()
  if (!roster.length) return { ids, unlinked, matched: 0, created: 0 }

  const existing = await managersByEmail(
    req,
    roster.map((request) => request.email),
  )
  const linkable = await linkableAccounts(req, [...existing.values()], subtreeIds)
  let created = 0
  let matched = 0

  for (const request of roster) {
    const match = existing.get(request.email)
    if (match !== undefined) {
      if (linkable.has(match.id)) {
        ids.set(request.email, match.id)
        matched += 1
      } else unlinked.set(request.email, UNLINKED_COORDINATOR)
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
        select: { email: true },
        req,
      })
      ids.set(request.email, manager.id)
      created += 1
    } catch (error) {
      // Anything but the database refusing this address is not the row's
      // fault, and is thrown so the chunk is retried rather than imported
      // without the coordinator it named.
      const fields = validationFieldErrors(error)
      if (!fields) throw error
      unlinked.set(
        request.email,
        `${UNLINKED_NOTE}: no account could be opened for this address (${describeValidationErrors(fields).join('; ')})`,
      )
    }
  }

  return { ids, unlinked, matched, created }
}

/** An account the Atlas holds for an address, and whether it may coordinate at all. */
export interface ExistingAccount {
  id: number
  type: Manager['type']
}

/**
 * Which of these accounts an import may name as a class's coordinator: an
 * active, non-admin manager who already manages a region or a class inside the
 * target.
 *
 * Shared with the review, so the banner promises exactly the links the commit
 * makes.
 */
export async function linkableAccounts(
  req: PayloadRequest,
  accounts: readonly ExistingAccount[],
  subtreeIds: readonly number[],
): Promise<Set<number>> {
  const candidates = accounts.filter((account) => account.type === 'manager').map(({ id }) => id)
  if (!candidates.length || !subtreeIds.length) return new Set()

  const [regions, events] = await Promise.all([
    req.payload.find({
      collection: 'regions',
      where: { and: [{ id: { in: [...subtreeIds] } }, { managers: { in: candidates } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { managers: true },
      req,
    }),
    req.payload.find({
      collection: 'events',
      where: { and: [{ region: { in: [...subtreeIds] } }, { manager: { in: candidates } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      trash: true,
      select: { manager: true },
      req,
    }),
  ])

  const wanted = new Set(candidates)
  const linked = new Set<number>()
  for (const region of regions.docs as Region[]) {
    for (const manager of region.managers ?? []) {
      const id = typeof manager === 'object' ? manager.id : manager
      if (wanted.has(id)) linked.add(id)
    }
  }
  for (const event of events.docs) {
    const id = typeof event.manager === 'object' ? event.manager?.id : event.manager
    if (typeof id === 'number' && wanted.has(id)) linked.add(id)
  }
  return linked
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
 * volunteer how many accounts a commit would open or link before they ask for
 * one (`endpoints/review.ts`), and a second read answering differently would be
 * a banner the commit then contradicts. The review keeps only verdicts — the
 * ids are for the writes that follow this one.
 */
export async function managersByEmail(
  req: PayloadRequest,
  emails: readonly string[],
): Promise<Map<string, ExistingAccount>> {
  if (!emails.length) return new Map()
  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { email: { in: [...emails] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { email: true, type: true },
    req,
  })
  return new Map(
    (docs as Manager[]).flatMap((manager) =>
      manager.email
        ? [[manager.email.toLowerCase(), { id: manager.id, type: manager.type }] as const]
        : [],
    ),
  )
}
