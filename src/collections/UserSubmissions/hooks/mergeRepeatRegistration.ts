import type { CollectionAfterChangeHook, PayloadRequest, Where } from 'payload'

import type { LogEntry } from '@/fields'
import { appendLogEntry, asLog } from '@/fields'
import { isActiveRegistration } from '@/lib/registrations/active'
import { normalizeEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { STATUS_LABELS } from '../statuses'

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
 *
 * ⚠ **The sender's address is never verified**, so a signup naming someone
 * else's address reaches their row: anyone holding the widget's client key can
 * replace a registrant's answers and session, put the row back to `pending`
 * and have a fresh confirmation mailed to them. The collection keeps no
 * versions, so the log entry below is the only record the old values leave —
 * write nothing here that it does not carry.
 */
export const mergeRepeatRegistration: CollectionAfterChangeHook = async ({
  data,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || data.type !== 'registration') return doc
  // A manager's own write, or an import, is deliberate — as for the gate.
  if (req.user?.collection !== 'clients') return doc

  // ⚠ **Every input here comes from `data`, never from `doc`.** `doc` is the
  // `afterRead` projection, and a create's `select` is a query parameter no
  // gate polices — `validateClientQueryParamsHook` returns on anything that is
  // not a read. So `POST …?select[id]=true` empties `doc` of `type`, `event`
  // and `user`, and a guard reading them there switches this hook off from the
  // request. `gateRegistration` judges `data`, and has already waived
  // `event_full` for the seat this fold-in is what keeps: the two must read the
  // same input, or the waiver is granted and never paid for. `doc.id` is the
  // exception, and is safe — Payload returns the new row's id whatever the
  // projection asks for.
  const eventId = relationId(data.event)
  const userId = relationId(data.user)
  if (eventId == null || userId == null) return doc

  const trusted = asTrustedReq(req)
  const existing = await findRepeatRegistration(
    trusted,
    eventId,
    { user: { equals: userId } },
    doc.id,
  )
  if (!existing) return doc

  // ⚠ **The muted line states the previous status and nothing a caller wrote.**
  // After one overwrite the stored answers are the sender's, and the sender is
  // whoever held the key — so rendering a name from them puts text of their
  // choosing in the admin table as the record of what it replaced, which is the
  // forged history `logField`'s own write lock exists to refuse. `status` is a
  // server-set enum, so it is safe to show.
  const now = new Date().toISOString()
  const entry: LogEntry = {
    at: now,
    type: 'registration-update',
    key: now,
    cells: {
      activity: {
        text: 'Registered again — details updated',
        sub: existing.status
          ? `Replaced a ${STATUS_LABELS[existing.status]} registration`
          : undefined,
      },
    },
    replaced: {
      status: existing.status,
      screeningResult: existing.screeningResult ?? null,
      startingAt: existing.startingAt ?? null,
      submissionData: existing.submissionData ?? [],
    },
    // Which key submitted the update. Recorded rather than written to the row's
    // own `client`: see the update below.
    submittedVia: data.client ?? null,
  }

  const updated = await req.payload.update({
    collection: 'user-submissions',
    id: existing.id,
    // `data` is the create's input after `prepareUserSubmission`, which `doc`
    // (shaped by the client's read access) is not.
    //
    // ⚠ **`client` is deliberately not among these.** It is the key the row is
    // attributed to, and the branding `DeliverSubmissions` renders the
    // registrant's mail from. `systemFieldAccess` closes it to every client
    // write for that reason, and this update runs at `overrideAccess: true` on
    // a client's behalf — so carrying the caller's own key here let one
    // organisation's key re-attribute another's registrant and re-send their
    // confirmation under its own name. The row keeps the key it arrived on, as
    // it keeps its `id`, `uuid` and `createdAt`; the entry above records which
    // key sent the update.
    data: {
      // Without the array rows' ids, which belong to the row being deleted.
      submissionData: ((data.submissionData ?? []) as { field: string; value: string }[]).map(
        ({ field, value }) => ({ field, value }),
      ),
      startingAt: data.startingAt ?? null,
      startingAt_tz: data.startingAt_tz,
      status: 'pending',
      // `ScreenSubmissions` skips a row that already carries a verdict. The
      // generated type omits the column's `null` (src/collections/AGENTS.md).
      screeningResult: null as unknown as UserSubmission['screeningResult'],
      activityLog: appendLogEntry(asLog(existing.activityLog), entry),
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
 * The statuses a repeat signup may fold into. `spam` and `rejected` are left
 * out: each is a verdict on that row, which a fresh signup must neither hide
 * behind nor overturn.
 */
const MERGEABLE_STATUSES: readonly UserSubmission['status'][] = ['accepted', 'pending', 'failed']

/**
 * The registration a repeat signup from this sender updates.
 *
 * ⚠ **An active row outranks a newer inactive one**, rather than newest
 * winning outright. A sender can hold both — legacy duplicates exist, and a
 * `failed` row is left standing beside the seat it never confirmed — and the
 * seat is the row to fold into: it keeps the sender on one active
 * registration, and it is what `gateRegistration` waives `event_full` for.
 * Taking the newest instead merged into the dead row, which left the active one
 * untouched and the event one seat over its limit.
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
        { status: { in: [...MERGEABLE_STATUSES] } },
        sender,
        ...(excludeId != null ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    sort: '-createdAt',
    depth: 0,
    // Unbounded on purpose: one sender's rows for one event, which is a
    // handful even where a legacy duplicate survives. A cap here would be the
    // number above which the active row stops being found.
    pagination: false,
    select: {
      activityLog: true,
      screeningResult: true,
      startingAt: true,
      status: true,
      submissionData: true,
      type: true,
    },
    overrideAccess: true,
    req,
  })
  return docs.find(isActiveRegistration) ?? docs[0] ?? null
}

/** The sender, by an address the create has not yet resolved to a `users` row. */
export const senderByEmail = (email: string): Where => ({
  'user.email': { equals: normalizeEmail(email) },
})
