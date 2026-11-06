import type { CollectionAfterChangeHook } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { findRepeatRegistration } from '../lifecycle/repeatRegistration'

/**
 * afterChange (create): a registrant signing up again for an event they are
 * already registered for updates that registration instead of adding a second.
 * They may have changed their start date, their name, or their answers.
 *
 * ⚠ **The create runs to completion first, on purpose.** Payload cannot turn a
 * create into an update, and every refusal a public signup owes — the write
 * guard's captcha and link scan, `gateRegistration`, the `submissionData`
 * allow-list — lives on the create path and nowhere else. So the new row is
 * validated and inserted exactly as any signup is, then folded into the
 * existing one and deleted, all inside the create's transaction: a failure
 * anywhere rolls back both.
 *
 * What the existing row keeps is its identity — `id`, `createdAt`, `uuid`
 * (which keys the registrant's calendar entry, so a re-sent confirmation moves
 * that entry instead of adding one) and its activity log (which keys the
 * reminder ledger per occurrence). What it takes is everything the registrant
 * typed, and `pending` with no screening verdict, so the new answers are
 * screened and a fresh confirmation goes out.
 *
 * ⚠ **Listed first in `afterChange`.** It returns the existing row's identity
 * as the create's `doc`, and every hook after it — the opt-in spawn, the
 * fullness sync, the screening queue — must act on that row, not the deleted
 * one. The response keeps the shape the client's own read access produced:
 * only `id`, `uuid` and the timestamps are swapped in, so the merge widens
 * nothing a client may see.
 *
 * Client-originated creates only, the same condition as `gateRegistration`: a
 * manager recording a registration by hand, or an import, is deliberate.
 */
export const mergeRepeatRegistration: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || doc.type !== 'registration') return doc
  if (req.user?.collection !== 'clients') return doc

  const eventId = relationId(doc.event)
  const userId = relationId(doc.user)
  if (eventId == null || userId == null) return doc

  // Every nested call below rides the client's `req`, so each is exempt from
  // the client `select` requirement, which is meant for the client's own reads.
  const trusted = asTrustedReq(req)

  const existing = await findRepeatRegistration({
    req: trusted,
    eventId,
    sender: { userId },
    excludeId: doc.id,
  })
  if (!existing) return doc

  // `doc` went through the client's read access, so it may lack what the
  // registrant sent; the row itself does not.
  const fresh = (await req.payload.findByID({
    collection: 'user-submissions',
    id: doc.id,
    depth: 0,
    overrideAccess: true,
    req: trusted,
  })) as UserSubmission

  const now = new Date().toISOString()
  const updated = await req.payload.update({
    collection: 'user-submissions',
    id: existing.id,
    data: {
      // Without the array rows' own ids: those belong to the row being
      // deleted, and the array table holds them unique.
      submissionData: (fresh.submissionData ?? []).map(({ field, value }) => ({ field, value })),
      startingAt: fresh.startingAt ?? null,
      startingAt_tz: fresh.startingAt_tz,
      subject: fresh.subject,
      client: fresh.client,
      status: 'pending',
      // Cleared so `ScreenSubmissions` screens the new answers: it skips a row
      // that already carries a verdict. The generated type omits the column's
      // `null` (src/collections/AGENTS.md, "A JSON column declares its shape").
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

  return {
    ...doc,
    id: updated.id,
    uuid: updated.uuid,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    status: 'pending',
  }
}
