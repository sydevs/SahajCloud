import type { PayloadRequest, Where } from 'payload'

import { normalizeEmail } from '@/lib/users/upsertUserByEmail'
import type { UserSubmission } from '@/payload-types'

/**
 * The statuses a later registration from the same person updates rather than
 * duplicates. `spam` and `rejected` are left out: both are a decision about
 * that row, and merging a fresh signup into one would either hide the new
 * attempt behind the old verdict or quietly overturn it. `failed` is in — it
 * means only that the confirmation never went out, and a second attempt is
 * exactly the registrant trying again.
 */
const UPDATABLE_STATUSES: readonly UserSubmission['status'][] = ['accepted', 'pending', 'failed']

/**
 * The registration this person already holds for this event, if any — the row
 * a repeat signup updates.
 *
 * Matched by the sender's `users` row, which `prepareUserSubmission` upserts by
 * normalized address, so `Ann@Example.org` and `ann@example.org ` are one
 * person. The newest row wins where legacy duplicates exist.
 *
 * `req` is forwarded: the merge hook runs inside the create's transaction, and
 * the row it updates must be read and written there, not beside it.
 */
export async function findRepeatRegistration(args: {
  req: PayloadRequest
  eventId: number
  sender: { userId: number } | { email: string }
  /** The row being created, which is never its own repeat. */
  excludeId?: number
}): Promise<Pick<UserSubmission, 'id' | 'activityLog' | 'status' | 'type'> | null> {
  const { req, eventId, sender, excludeId } = args

  const and: Where[] = [
    { type: { equals: 'registration' } },
    { event: { equals: eventId } },
    { status: { in: [...UPDATABLE_STATUSES] } },
    'userId' in sender
      ? { user: { equals: sender.userId } }
      : { 'user.email': { equals: normalizeEmail(sender.email) } },
  ]
  if (excludeId != null) and.push({ id: { not_equals: excludeId } })

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: { and },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    pagination: false,
    select: { activityLog: true, status: true, type: true },
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}
