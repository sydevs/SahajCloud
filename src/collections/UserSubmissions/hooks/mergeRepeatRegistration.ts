import type { CollectionAfterChangeHook, PayloadRequest, Where } from 'payload'

import type { LogEntry } from '@/fields'
import { appendLogEntry } from '@/lib/atomicWrites/appendLogEntry'
import { isActiveRegistration } from '@/lib/registrations/active'
import { REGISTRATION_UPDATE_LOG_TYPE } from '@/lib/registrations/activityLog'
import { normalizeEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { capture } from '@/plugins/sentry/capture'
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
 * versions, so the log entry below is the only record the old values leave.
 *
 * ⚠ **That record is not durable, and knowing why matters before trusting it.**
 * An append keeps the most recent `DEFAULT_LOG_LIMIT` entries and drops the
 * oldest, and each repeat signup appends one — so that many further signups
 * for the same address and event roll the entry carrying the original values
 * out of the column. Overwriting a *confirmed* registration therefore also
 * reports to Sentry, which no caller can roll anything out of; see
 * {@link reportOverwrittenConfirmation}.
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
  // Which key submitted the update. Recorded rather than written to the row's
  // own `client`: see the update below.
  const submittedVia = (data.client ?? null) as number | null
  const entry: LogEntry = {
    at: now,
    type: REGISTRATION_UPDATE_LOG_TYPE,
    key: now,
    cells: {
      activity: {
        text: 'Registered again — details updated',
        sub: `Previously ${STATUS_LABELS[existing.status]}`,
      },
    },
    replaced: {
      status: existing.status,
      screeningResult: existing.screeningResult ?? null,
      startingAt: existing.startingAt ?? null,
      submissionData: existing.submissionData ?? [],
    },
    submittedVia,
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
    },
    depth: 0,
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req: trusted,
  })
  // Appended rather than written back from `existing`: this hook runs inside
  // the create's transaction, and the row it logs on is one other writers are
  // also appending to.
  await appendLogEntry({
    payload: req.payload,
    collection: 'user-submissions',
    id: existing.id,
    entry,
    req: trusted,
  })

  await req.payload.delete({
    collection: 'user-submissions',
    id: doc.id,
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req: trusted,
  })

  if (existing.status === 'accepted') {
    reportOverwrittenConfirmation(req, { eventId, submissionId: existing.id, submittedVia })
  }

  // ⚠ **`id` and `uuid` only, never the surviving row's timestamps.** Those two
  // are the published contract (`docs/rules/api-clients.md`): the `uuid` keys the
  // registrant's calendar entry, so a re-sent confirmation moves it rather than
  // adding one. `createdAt` is not, and echoing it answered "is this address
  // registered for this event?" for any pair a key holder cared to name — a
  // merge replied with a timestamp from the past where a fresh signup replies
  // with now. The row keeps its own `createdAt`; the response describes this
  // request.
  //
  // ⚠ **That narrows the oracle rather than closing it.** `id` is a Postgres
  // serial, and this is the surviving row's — so a caller holding the id of a
  // signup it made itself can still tell a lower one from a fresh one. The
  // created row's id is not the alternative: this hook deletes that row, and
  // the contract above is what a re-sent signup keys on. What stays observable
  // is stated in `docs/rules/api-clients.md`.
  const { id, uuid } = updated
  return { ...doc, id, uuid, status: 'pending' }
}

/**
 * Report that a repeat signup replaced a registration someone had confirmed —
 * the half of that record no caller can reach, for the reason the module
 * docblock gives.
 *
 * Fingerprinted on the row, so repeats against one registration group into one
 * issue. That recurrence is the signal: a registrant correcting their own
 * details does it once or twice.
 *
 * **Whoever watches this service's Sentry project reads it, and the row is what
 * they act on**: the log entry written above carries `replaced`, so the previous
 * status, session, answers and verdict are restorable from the admin panel. The
 * report exists because that entry is not durable — `DEFAULT_LOG_LIMIT` further
 * signups roll it out — so an issue whose event count has passed that is one
 * where nothing is left to restore. Mute volume with a Sentry-side rule, never
 * in this process (`docs/rules/api-clients.md`).
 */
function reportOverwrittenConfirmation(
  req: PayloadRequest,
  extra: { eventId: number; submissionId: number; submittedVia: number | null },
) {
  capture({
    message: 'mergeRepeatRegistration: a repeat signup replaced a confirmed registration',
    extra,
    fingerprint: ['mergeRepeatRegistration', String(extra.submissionId)],
    logger: req.payload.logger,
  })
}

/**
 * The statuses a repeat signup may fold into. `spam` and `rejected` are left
 * out: each is a verdict on that row, which a fresh signup must neither hide
 * behind nor overturn.
 *
 * ⚠ **`accepted` stays in, though the address is never verified** (#1093).
 * Dropping it would put a confirmed registrant's own repeat signup on a second
 * row, a second seat and a second confirmation — the defect this hook exists to
 * fix, back for the case that happens most. So an overwrite of a confirmed
 * registration is reported instead: {@link reportOverwrittenConfirmation}.
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
