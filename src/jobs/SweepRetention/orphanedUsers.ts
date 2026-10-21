import type { RetentionHooks, RetentionRun } from './registry'
import type { PayloadRequest, Where } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { DURABLE_TYPES } from './entries/userSubmissions'

/**
 * The `users` orphan sweep, as the `user-submissions` entry's two hooks.
 *
 * A `users` row goes when its last referencing submission goes, unless a
 * durable row (a registration or a subscription) still points at it. The set of
 * senders is filled while the submissions are still there and read once they
 * are gone, which is what the two halves are for.
 */
export const orphanedUserHooks = ({ dryRun, req }: RetentionRun): RetentionHooks => {
  /** Whose `users` rows to reconsider once the submissions have gone. */
  const touchedUsers = new Set<number>()

  return {
    afterDelete: async () => [
      { collection: 'users', deleted: await sweepOrphanedUsers({ dryRun, req, touchedUsers }) },
    ],
    beforeDelete: (_window, where) => noteSenders({ req, touchedUsers, where }),
  }
}

/**
 * Note whose `users` rows a window is about to orphan.
 *
 * Read **before** the delete, because after it the submission is gone and with
 * it the only pointer to the person it named. Re-deriving the set from `users`
 * instead would mean scanning every user on every run.
 */
async function noteSenders(args: {
  req: PayloadRequest
  touchedUsers: Set<number>
  where: Where
}): Promise<void> {
  const { req, touchedUsers, where } = args

  const { docs: due } = await req.payload.find({
    collection: 'user-submissions',
    where,
    select: { user: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  for (const doc of due) {
    const userId = relationId(doc.user)
    if (userId != null) touchedUsers.add(userId)
  }
}

/**
 * Delete each `users` row whose last referencing submission has just gone.
 *
 * ⚠ **A durable reference pins the row, and the check is per user, not per
 * type.** A person who once sent a contact message *and* registered for an
 * event keeps their `users` row when the message purges: the registration still
 * names them. The query therefore asks "does any submission still point here",
 * and only then "is any of them durable" — one count, not two passes.
 */
async function sweepOrphanedUsers(args: {
  dryRun: boolean
  req: PayloadRequest
  touchedUsers: ReadonlySet<number>
}): Promise<number> {
  const { dryRun, req, touchedUsers } = args
  let deleted = 0

  for (const userId of touchedUsers) {
    const { totalDocs: remaining } = await req.payload.count({
      collection: 'user-submissions',
      where: { user: { equals: userId } },
      overrideAccess: true,
      req,
    })

    // In a dry run the rows are still there, so "remaining" counts the ones
    // about to go. Anything above zero after a real delete means something
    // still references this person.
    if (!dryRun && remaining > 0) continue

    if (dryRun) {
      const { totalDocs: durable } = await req.payload.count({
        collection: 'user-submissions',
        where: { user: { equals: userId }, type: { in: [...DURABLE_TYPES] } },
        overrideAccess: true,
        req,
      })
      // A durable row is never among the rows a window selects, so its presence
      // is exactly the "would survive" answer a dry run owes the operator.
      if (durable === 0) deleted += 1
      continue
    }

    try {
      await req.payload.delete({ collection: 'users', id: userId, overrideAccess: true, req })
      deleted += 1
    } catch (error) {
      // A user row that will not delete is almost always a foreign key this
      // sweep does not know about — worth a line, never worth failing the run
      // and leaving the submissions purge unrepeatable.
      req.payload.logger.warn({
        msg: 'SweepRetention: an orphaned user could not be deleted',
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return deleted
}
