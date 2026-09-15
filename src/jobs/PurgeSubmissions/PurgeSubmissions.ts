import type { PurgeWindow } from './retention'
import type { PayloadRequest, TaskConfig } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { DURABLE_TYPES, PURGE_WINDOWS } from './retention'

/**
 * Nightly retention sweep for `user-submissions`, plus the `users` orphan sweep
 * that follows it.
 *
 * Replaces `PurgeUserMessages`, which knew one collection and two windows. The
 * windows themselves, and why each is the length it is, live in
 * `retention.ts` — this file is the sweep.
 *
 * ⚠ **The users sweep is the half that makes retention mean anything.** A
 * contact row's retention promise is about the person who sent it, and every
 * submission upserts its sender into `users` — so deleting the message while
 * keeping the address would leave the personal data behind and the promise
 * unkept. A `users` row goes when its last referencing submission goes, unless
 * a durable row (a registration or a subscription) still points at it.
 *
 * Runs on the existing `nightly` queue at 04:00 UTC, after the 02:00 event
 * expiry and 03:00 notification sweeps, so a slow night does not have three
 * jobs contending.
 */
export const PurgeSubmissions: TaskConfig<'purgeSubmissions'> = {
  slug: 'purgeSubmissions',
  label: 'Purge Submissions',
  retries: 2,
  inputSchema: [
    {
      // Test seam: specs inject the clock so they can assert a window boundary
      // without waiting ninety days. Absent in production, where `now` is now.
      name: 'now',
      type: 'text',
    },
    {
      // Reports what *would* go, and deletes nothing. The operator check in
      // this ticket's verification steps runs through here.
      name: 'dryRun',
      type: 'checkbox',
    },
  ],
  outputSchema: [
    { name: 'deletedSubmissions', type: 'number', required: true },
    { name: 'deletedUsers', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 4 * * *', // daily at 04:00 UTC (after the 02:00/03:00 sweeps)
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()
    const dryRun = input?.dryRun === true

    /**
     * Whose `users` rows to reconsider afterwards.
     *
     * Collected **before** the delete, because after it the submission is gone
     * and with it the only pointer to the person it named. Re-deriving the set
     * from `users` instead would mean scanning every user on every run.
     */
    const touchedUsers = new Set<number>()
    let deletedSubmissions = 0

    for (const window of PURGE_WINDOWS) {
      deletedSubmissions += await purge({ req, window, now, dryRun, touchedUsers })
    }

    const deletedUsers = await sweepOrphanedUsers({ req, userIds: touchedUsers, dryRun })

    if (deletedSubmissions + deletedUsers > 0) {
      req.payload.logger.info({
        msg: dryRun
          ? 'PurgeSubmissions: dry run — nothing was deleted'
          : 'PurgeSubmissions: retention sweep complete',
        deletedSubmissions,
        deletedUsers,
      })
    }

    return { output: { deletedSubmissions, deletedUsers } }
  },
}

/** Delete everything one window selects, and note whose rows they were. */
async function purge(args: {
  req: PayloadRequest
  window: PurgeWindow
  now: Date
  dryRun: boolean
  touchedUsers: Set<number>
}): Promise<number> {
  const { req, window, now, dryRun, touchedUsers } = args
  const cutoff = new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000).toISOString()
  const where = window.where(cutoff)

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

  if (dryRun || due.length === 0) return due.length

  const { docs, errors } = await req.payload.delete({
    collection: 'user-submissions',
    where,
    overrideAccess: true,
    req,
  })

  // A row that refuses to delete is worth a line — silently returning a short
  // count would read as "nothing was due", and the collection would grow
  // without anyone learning why.
  if (errors.length > 0) {
    req.payload.logger.warn({
      msg: 'PurgeSubmissions: some submissions could not be deleted',
      window: window.name,
      count: errors.length,
      firstError: errors[0]?.message,
    })
  }

  return docs.length
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
  req: PayloadRequest
  userIds: ReadonlySet<number>
  dryRun: boolean
}): Promise<number> {
  const { req, userIds, dryRun } = args
  let deleted = 0

  for (const userId of userIds) {
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
        msg: 'PurgeSubmissions: an orphaned user could not be deleted',
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return deleted
}
