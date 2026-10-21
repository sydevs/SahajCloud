import type { PurgeWindow, RetentionHooks, RetentionRun } from './types'
import type { PayloadRequest, Where } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { retentionCutoff } from './sweepCollection'

/**
 * The `users` orphan sweep, as the `user-submissions` entry's two hooks.
 *
 * A `users` row goes when its last referencing submission goes, unless some
 * submission still points at it. The set of senders is filled while the
 * submissions are still there and read once they are gone, which is what the
 * two halves are for.
 */
export const orphanedUserHooks = ({ dryRun, now, req, windows }: RetentionRun): RetentionHooks => {
  /** Whose `users` rows to reconsider once the submissions have gone. */
  const touchedUsers = new Set<number>()

  return {
    afterDelete: async () => ({
      collection: 'users',
      deleted: await sweepOrphanedUsers({ dryRun, now, req, touchedUsers, windows }),
    }),
    beforeDelete: (where) => noteSenders({ req, touchedUsers, where }),
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
 * ⚠ **One rule, read two ways.** A row survives while any submission still
 * points at it — a registration or a subscription, which no window selects, but
 * equally a second contact message not yet due. After a real delete the
 * remaining count answers that directly. A dry run has not deleted anything, so
 * it subtracts what the windows selected from what the sender has, and asks
 * whether the difference is nothing.
 *
 * ⚠ **The durable types are not the question**, though they are the common
 * answer. Counting them alone reported a sender with one aged and one recent
 * message as going, and the real sweep then kept them.
 */
async function sweepOrphanedUsers(args: {
  dryRun: boolean
  now: Date
  req: PayloadRequest
  touchedUsers: ReadonlySet<number>
  windows: readonly PurgeWindow[]
}): Promise<number> {
  const { dryRun, now, req, touchedUsers, windows } = args
  let deleted = 0

  const dueWhere: Where = {
    or: windows.map((window) => window.where(retentionCutoff(now, window.days))),
  }

  for (const userId of touchedUsers) {
    const { totalDocs: remaining } = await req.payload.count({
      collection: 'user-submissions',
      where: { user: { equals: userId } },
      overrideAccess: true,
      req,
    })

    if (dryRun) {
      const { totalDocs: due } = await req.payload.count({
        collection: 'user-submissions',
        where: { and: [{ user: { equals: userId } }, dueWhere] },
        overrideAccess: true,
        req,
      })
      if (remaining - due === 0) deleted += 1
      continue
    }

    if (remaining > 0) continue

    try {
      await req.payload.delete({ collection: 'users', id: userId, overrideAccess: true, req })
      deleted += 1
    } catch (error) {
      // A user row that will not delete is almost always a foreign key this
      // sweep does not know about — worth a line, never worth failing the run
      // and leaving the submissions purge unrepeatable.
      req.payload.logger.warn({
        msg: 'CleanupCollections: an orphaned user could not be deleted',
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return deleted
}
