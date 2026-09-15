import type { PayloadRequest } from 'payload'

import { createHash } from 'node:crypto'


import { isMachineSpam } from './verdicts'

/**
 * How far back the history checks look. Must stay comfortably inside the
 * shortest retention window that holds the rows they count against — see
 * `PurgeSubmissions`, where the same number is pinned from the other side. A
 * shorter retention would blind these checks silently: they would pass
 * everything, with no error anywhere.
 */
export const HISTORY_WINDOW_HOURS = 24

/**
 * How many prior **machine-refused** submissions one sender may have inside the
 * window before the next is refused on sight.
 *
 * Five is chosen to be obviously past normal use. The cost of being wrong is a
 * submission flagged for triage rather than deleted, which a manager can still
 * read and unwind.
 */
export const REPEAT_SENDER_MAX = 5

/**
 * How many of a sender's recent rows are loaded to judge them.
 *
 * A hard cap, because the verdict lives in a JSON column: nothing can `where`
 * on `screeningResult.verdict` cheaply, so the filtering happens in memory and
 * the query needs its own bound. Comfortably above `REPEAT_SENDER_MAX`, so the
 * threshold is reachable, and small enough that a sender blasting thousands of
 * submissions costs one bounded read rather than a table scan.
 */
const HISTORY_SCAN_LIMIT = 50

/** What one recent row contributes to the judgement. */
interface HistoryRow {
  id: number
  screeningResult?: unknown
  submissionData?: unknown
}

/** What the sender's recent history says about them. */
export interface SenderHistory {
  /** Machine-refused submissions inside the window, excluding this one. */
  spamCount: number
  /** Whether this exact text already arrived from this sender inside the window. */
  duplicate: boolean
}

/**
 * Look up what this sender has been doing lately — **across every intake**,
 * which is the whole reason for one table. A sender hitting contact, proposals
 * and registrations is one history, and no per-collection design could express
 * that.
 *
 * ⚠ **Both counts are computed in memory, deliberately.** The machine verdict
 * lives in a `type: 'json'` column, and a JSON path is not a cheap predicate —
 * so the query selects a bounded page of the sender's recent rows by the
 * indexed `user` and `createdAt` columns, and the two questions are answered
 * over that page. Filtering by `status` in SQL instead would be cheaper and
 * wrong: see `isMachineSpam`.
 *
 * ⚠ **The duplicate check is scoped to one sender**, unlike the cross-sender
 * check it descends from, which could see one payload blasted from many
 * addresses. That check needed a queryable `bodyHash` column, and
 * `user-submissions` has none — see the follow-up ticket named in this job's
 * docblock. An anonymous submission carries no `user`, so it has no history
 * here at all and is judged by the address checks alone.
 */
export async function loadSenderHistory(args: {
  req: PayloadRequest
  /** The row being screened. Excluded from its own history. */
  submissionId: number
  userId: number
  since: Date
  /** The body being screened, already digested. Absent skips the duplicate check. */
  bodyHash: string | null
}): Promise<SenderHistory> {
  const { req, submissionId, userId, since, bodyHash } = args

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      user: { equals: userId },
      createdAt: { greater_than: since.toISOString() },
      id: { not_equals: submissionId },
    },
    select: { screeningResult: true, submissionData: true },
    limit: HISTORY_SCAN_LIMIT,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const rows = docs as HistoryRow[]

  return {
    spamCount: rows.filter(isMachineSpam).length,
    duplicate:
      bodyHash != null && rows.some((row) => hashSubmissionBody(row.submissionData) === bodyHash),
  }
}

/**
 * A stable digest of a submission's free text, for the duplicate check.
 *
 * Keys are **sorted** before hashing, because `submissionData` is an array and
 * its order is whatever the caller sent — two identical submissions with their
 * pairs in a different order must hash the same, or the check sees nothing.
 *
 * Returns `null` when there is no free text to compare: a submission carrying
 * only a name and an address is not "the same message" as another one, and
 * hashing the empty string would make every such row a duplicate of every other.
 */
export function hashSubmissionBody(entries: unknown): string | null {
  if (!Array.isArray(entries)) return null

  const pairs = (entries as { field?: unknown; value?: unknown }[])
    .filter(
      (entry): entry is { field: string; value: string } =>
        typeof entry?.field === 'string' &&
        typeof entry?.value === 'string' &&
        BODY_KEYS.has(entry.field) &&
        entry.value.trim() !== '',
    )
    .map((entry) => `${entry.field}=${entry.value.trim()}`)
    .sort()

  if (pairs.length === 0) return null

  return createHash('sha256').update(pairs.join('\n')).digest('hex')
}

/**
 * Which pairs count as "the body".
 *
 * The prose keys only. `name`, `locale` and the context keys are the same on
 * every submission a person sends, so including them would make two unrelated
 * submissions from one visitor hash alike.
 */
const BODY_KEYS: ReadonlySet<string> = new Set(['message', 'note', 'subject'])
