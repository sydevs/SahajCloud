import type { PayloadRequest } from 'payload'

/**
 * How far back the two history checks look. Both windows are well inside the
 * `delivered` retention window (7 days), so the rows they count against are
 * still there — a shorter retention would silently blind these checks, which is
 * why the two numbers belong in the same head.
 */
export const HISTORY_WINDOW_HOURS = 24

/**
 * How many prior messages one sender may have inside the window before the next
 * is treated as bulk. Five is chosen to be obviously past normal use: somebody
 * reporting several genuine problems in a day is remarkable but plausible, a
 * sixth in twenty-four hours is not — and the cost of being wrong is a message
 * kept for triage rather than deleted, which an admin can still read.
 */
export const REPEAT_SENDER_MAX = 5

/** Args shared by both counts — the row being screened, and where to look. */
interface HistoryArgs {
  req: PayloadRequest
  /** The message being screened; excluded from its own history. */
  messageId: number
  /** Start of the window, computed once by the caller so both counts agree. */
  since: Date
}

/**
 * How many *other* messages this person sent inside the window.
 *
 * Counted by the `user` relationship rather than the raw `senderEmail` string:
 * the upsert normalizes casing, so `A@x.test` and `a@x.test` are one person
 * here and two different strings anywhere else. An anonymous message has no
 * user and is not counted — it is covered by the duplicate-body check instead.
 */
export async function countRecentFromSender(
  args: HistoryArgs & { userId: number },
): Promise<number> {
  const { req, messageId, since, userId } = args

  const { totalDocs } = await req.payload.count({
    collection: 'user-messages',
    where: {
      user: { equals: userId },
      createdAt: { greater_than: since.toISOString() },
      id: { not_equals: messageId },
    },
    overrideAccess: true,
    req,
  })

  return totalDocs
}

/**
 * How many *other* messages carry the identical body inside the window.
 *
 * Deliberately not scoped to one sender: the pattern this catches is one
 * payload blasted from many addresses, which a per-sender count cannot see. It
 * is also the only check that covers an anonymous message.
 */
export async function countRecentWithBody(
  args: HistoryArgs & { bodyHash: string },
): Promise<number> {
  const { req, messageId, since, bodyHash } = args

  const { totalDocs } = await req.payload.count({
    collection: 'user-messages',
    where: {
      bodyHash: { equals: bodyHash },
      createdAt: { greater_than: since.toISOString() },
      id: { not_equals: messageId },
    },
    overrideAccess: true,
    req,
  })

  return totalDocs
}
