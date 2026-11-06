import type { CollectionAfterChangeHook, PayloadRequest, Where } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { normalizeEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * afterChange (create): a registrant signing up again for an event they are
 * already registered for updates that registration instead of adding a second.
 *
 * ⚠ **The create runs to completion first, on purpose.** Payload cannot turn a
 * create into an update, and every refusal a public signup owes — the write
 * guard, `gateRegistration`, the `submissionData` allow-list — lives on the
 * create path alone. So the new row is validated and inserted like any signup,
 * then folded into the existing one and deleted, inside the create's
 * transaction.
 *
 * The existing row keeps its `id`, `createdAt`, activity log and `uuid` — which
 * keys the registrant's calendar entry, so the re-sent confirmation moves it
 * rather than adding one. It takes what the registrant sent, back at `pending`
 * with no verdict, so the new answers are screened and re-confirmed.
 *
 * ⚠ **Listed first in `afterChange`**, because every hook after it must act on
 * the surviving row. Only `id`, `uuid` and the timestamps are swapped into the
 * client-shaped `doc`, so the response shows the client nothing new.
 */
export const mergeRepeatRegistration: CollectionAfterChangeHook = async ({
  data,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || doc.type !== 'registration') return doc
  // A manager's own write, or an import, is deliberate — as for the gate.
  if (req.user?.collection !== 'clients') return doc

  const eventId = relationId(doc.event)
  const userId = relationId(doc.user)
  if (eventId == null || userId == null) return doc

  const trusted = asTrustedReq(req)
  const existing = await findRepeatRegistration(
    trusted,
    eventId,
    { user: { equals: userId } },
    doc.id,
  )
  if (!existing) return doc

  const now = new Date().toISOString()
  const updated = await req.payload.update({
    collection: 'user-submissions',
    id: existing.id,
    // `data` is the create's input after `prepareUserSubmission`, which `doc`
    // (shaped by the client's read access) is not.
    data: {
      // Without the array rows' ids, which belong to the row being deleted.
      submissionData: ((data.submissionData ?? []) as { field: string; value: string }[]).map(
        ({ field, value }) => ({ field, value }),
      ),
      startingAt: data.startingAt ?? null,
      startingAt_tz: data.startingAt_tz,
      client: data.client,
      status: 'pending',
      // `ScreenSubmissions` skips a row that already carries a verdict. The
      // generated type omits the column's `null` (src/collections/AGENTS.md).
      screeningResult: null as unknown as UserSubmission['screeningResult'],
      activityLog: appendLogEntry(asLog(existing.activityLog), {
        at: now,
        type: 'registration-update',
        key: now,
        cells: { activity: 'Registered again — details updated' },
      }),
    },
    depth: 0,
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req: trusted,
  })
  await req.payload.delete({
    collection: 'user-submissions',
    id: doc.id,
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req: trusted,
  })

  const { id, uuid, createdAt, updatedAt } = updated
  return { ...doc, id, uuid, createdAt, updatedAt, status: 'pending' }
}

/**
 * The registration a repeat signup from this sender updates, newest first.
 * `spam` and `rejected` are left out: each is a verdict on that row, which a
 * fresh signup must neither hide behind nor overturn.
 */
export async function findRepeatRegistration(
  req: PayloadRequest,
  eventId: number,
  sender: Where,
  excludeId?: number,
) {
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      and: [
        { type: { equals: 'registration' } },
        { event: { equals: eventId } },
        { status: { in: ['accepted', 'pending', 'failed'] } },
        sender,
        ...(excludeId != null ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
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

/** The sender, by an address the create has not yet resolved to a `users` row. */
export const senderByEmail = (email: string): Where => ({
  'user.email': { equals: normalizeEmail(email) },
})
