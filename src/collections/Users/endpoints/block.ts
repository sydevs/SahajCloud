import type { Endpoint, PayloadRequest } from 'payload'

import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { z } from 'zod'

import { appendLogEntry, asLog } from '@/fields'
import { parseBody, requireManagerPermission } from '@/lib/endpoints'
import type { UserSubmission } from '@/payload-types'

const bodySchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(2000).optional(),
  /** The submission the admin pressed the button on, if any. */
  submission: z.int().positive().optional(),
})

const refusal = (message: string, status: number): Response =>
  Response.json({ errors: [{ message }] }, { status })

/** What an admin reads on a submission this refused. */
const BLOCKED_NOTE =
  'An admin blocked this sender, so this submission was marked as spam. Lift the block on their Registrant record.'

/**
 * POST /api/users/:id/block — block or unblock a Registrant, from the button on
 * their record or on any submission they sent.
 *
 * Auth: intentionally NOT `requireActiveClient` — the admin panel is the only
 * caller, and no client role names `users`. Gated on `users: update`, which no
 * role grants, so only the admin bypass passes; and absent from the OpenAPI spec
 * for the same reason `users` is (in no project).
 *
 * **Block** stamps `blockedAt`/`blockedReason` and refuses, as spam, the
 * submission it was pressed on plus every other one of theirs still `pending`.
 * Accepted history is left alone: it was delivered already, and a registration
 * is an attendance record. Screening reads the block for everything after.
 *
 * **Unblock** clears `blockedAt` only. The reason stays as history, and no
 * refused row comes back — a proposal is reopened by its own Reopen button.
 *
 * ⚠ **The writes run on a request with no user.** `reviewMove` refuses any
 * status move a manager makes on a non-proposal row — a manager has no business
 * marking a contact message spam through the form — and it reads `req.user` to
 * decide. This endpoint is the decision, already gated; a system request is how
 * every other machine writer (screening, delivery) reaches `spam`, and sharing
 * one transaction keeps the block and its refusals together.
 */
export const blockUser: Endpoint = {
  path: '/:id/block',
  method: 'post',
  handler: async (req) => {
    const denied = requireManagerPermission({
      req,
      collection: 'users',
      operation: 'update',
      forbidden: 'Only an admin may block a sender.',
    })
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) return refusal('Invalid registrant id.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { blocked, reason, submission } = parsed.data

    const actor = req.user && 'email' in req.user ? String(req.user.email) : 'an admin'
    const now = new Date().toISOString()

    const systemReq = await createLocalReq({}, req.payload)
    const owned = await initTransaction(systemReq)

    try {
      const user = await req.payload.update({
        collection: 'users',
        id,
        data: blocked
          ? { blockedAt: now, ...(reason ? { blockedReason: reason } : {}) }
          : { blockedAt: null },
        depth: 0,
        overrideAccess: true,
        req: systemReq,
      })

      const logged = blocked
        ? await refuseOpenSubmissions({
            req: systemReq,
            userId: id,
            submission,
            actor,
            now,
            reason,
          })
        : await logOnSubmission({
            req: systemReq,
            userId: id,
            submission,
            now,
            activity: `Sender unblocked by ${actor}`,
          })

      if (owned) await commitTransaction(systemReq)

      return Response.json({
        blockedAt: user.blockedAt ?? null,
        blockedReason: user.blockedReason ?? null,
        markedSpam: blocked ? logged : 0,
      })
    } catch (error) {
      if (owned) await killTransaction(systemReq)
      if ((error as { status?: number }).status === 404) return refusal('No such registrant.', 404)
      req.payload.logger.error({
        msg: 'blockUser: the block could not be saved',
        userId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return refusal('The block could not be saved.', 500)
    }
  },
}

/**
 * Mark as spam the named submission (whatever its status, unless it is spam
 * already) and the sender's other `pending` ones. Returns how many moved.
 *
 * A row naming some other sender is ignored rather than refused: the button
 * reads `user` off the form it sits in, so a mismatch is a stale page, not an
 * instruction.
 */
async function refuseOpenSubmissions(args: {
  req: PayloadRequest
  userId: number
  submission: number | undefined
  actor: string
  now: string
  reason: string | undefined
}): Promise<number> {
  const { req, userId, submission, actor, now, reason } = args

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      and: [
        { user: { equals: userId } },
        { status: { not_equals: 'spam' } },
        submission != null
          ? { or: [{ status: { equals: 'pending' } }, { id: { equals: submission } }] }
          : { status: { equals: 'pending' } },
      ],
    },
    select: { activityLog: true, screeningResult: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  for (const row of docs) {
    await req.payload.update({
      collection: 'user-submissions',
      id: row.id,
      data: {
        status: 'spam',
        screeningResult: {
          verdict: 'blocked_sender',
          notes: [BLOCKED_NOTE],
          screenedAt: now,
        },
        activityLog: appendLogEntry(asLog(row.activityLog), {
          at: now,
          type: 'block',
          key: now,
          cells: {
            activity: reason
              ? `Sender blocked by ${actor}: ${reason}`
              : `Sender blocked by ${actor}`,
          },
        }),
      } satisfies Partial<UserSubmission>,
      depth: 0,
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })
  }

  return docs.length
}

/** Record an unblock on the submission it was pressed on, when it is theirs. */
async function logOnSubmission(args: {
  req: PayloadRequest
  userId: number
  submission: number | undefined
  now: string
  activity: string
}): Promise<number> {
  const { req, userId, submission, now, activity } = args
  if (submission == null) return 0

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: { and: [{ id: { equals: submission } }, { user: { equals: userId } }] },
    select: { activityLog: true },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const row = docs[0]
  if (!row) return 0

  await req.payload.update({
    collection: 'user-submissions',
    id: row.id,
    data: {
      activityLog: appendLogEntry(asLog(row.activityLog), {
        at: now,
        type: 'unblock',
        key: now,
        cells: { activity },
      }),
    },
    depth: 0,
    overrideAccess: true,
    context: { skipWriteGuard: true },
    req,
  })
  return 1
}
