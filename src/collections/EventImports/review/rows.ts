/**
 * The batch reduced to what a reviewer reads before they commit it.
 *
 * ⚠ **A row's two verdicts are separate, because they answer different
 * questions.** `status` says whether a class is created at all; `coordinator`
 * says whether anyone vouches for the one that is. The ticket lists
 * "will-create-manager" beside the skips, but a row can be ready *and* about to
 * create an account — folding the two into one field would hide whichever came
 * second, and the account is the half the banner counts.
 *
 * ⚠ **Nothing here decides anything the commit then re-decides.** `isCommittable`
 * owns which rows are skipped and `managerRoster` owns which addresses are one
 * coordinator, so this reads both rather than restating either — a review that
 * counted differently from the commit would promise a number the summary email
 * then contradicts.
 */

import { managerKeyOf } from '../commit/managers'
import { isCommittable, type CommitRow } from '../commit/rows'
import { duplicateReason } from '../commit/summary'

/** Why a row is or is not going to become a class. */
export type ReviewRowStatus = 'ready' | 'duplicate' | 'error'

/** Whether a committed class arrives with somebody vouching for it. */
export type ReviewRowCoordinator = 'existing' | 'new' | 'none'

export interface ReviewRow {
  line: number
  status: ReviewRowStatus
  /**
   * ⚠ **Null rather than a blank, because a missing title is itself the error a
   * reader is looking at.** A row the parser refused for having no `title` would
   * otherwise render as an empty cell beside its own reason.
   */
  title: string | null
  /** Where the row resolved, falling back to what its CSV said. */
  place: string | null
  /** Every reason the row is skipped, in the words the commit will report. */
  reasons: string[]
  coordinator: ReviewRowCoordinator
}

export interface CoordinatorTally {
  /** Addresses already holding an account, which the commit matches. */
  existing: number
  /** Addresses the commit creates an account for. */
  created: number
}

export interface ReviewRowsResult {
  rows: ReviewRow[]
  coordinators: CoordinatorTally
}

export interface ReviewRowsArgs {
  rows: readonly CommitRow[]
  /**
   * The lowercased addresses `managers` already holds, of those this batch
   * names. The endpoint reads them; this decides nothing about who they are.
   */
  knownEmails: ReadonlySet<string>
}

/**
 * The review's table and its coordinator banner, from one pass over the rows.
 *
 * ⚠ **The banner counts addresses, never rows.** Twelve classes run by one new
 * coordinator is one account, and a per-row count would tell a volunteer they
 * were about to create twelve.
 */
export function reviewRows({ rows, knownEmails }: ReviewRowsArgs): ReviewRowsResult {
  const newEmails = new Set<string>()
  const existingEmails = new Set<string>()

  const reviewed = rows.map((row): ReviewRow => {
    const email = managerKeyOf(row.values ?? {})
    const coordinator = coordinatorFor(email, knownEmails)
    // ⚠ **Counted off committable rows only.** A skipped row's coordinator is
    // never created (`endpoints/commit.ts` rosters the committable), so counting
    // it would promise an account the commit does not open.
    if (email && isCommittable(row)) (coordinator === 'new' ? newEmails : existingEmails).add(email)

    return {
      line: row.line,
      status: statusOf(row),
      title: row.values?.title?.trim() || null,
      place: placeOf(row),
      reasons: reasonsOf(row),
      coordinator,
    }
  })

  return {
    rows: reviewed,
    coordinators: { existing: existingEmails.size, created: newEmails.size },
  }
}

function coordinatorFor(
  email: string | null,
  knownEmails: ReadonlySet<string>,
): ReviewRowCoordinator {
  if (!email) return 'none'
  return knownEmails.has(email) ? 'existing' : 'new'
}

/**
 * ⚠ **An error outranks a duplicate**, the order `isCommittable` already reads
 * them in: a row carrying both is skipped for the error, and calling it a
 * duplicate would send a volunteer looking for a class that does not exist.
 */
function statusOf(row: CommitRow): ReviewRowStatus {
  if (row.errors?.length) return 'error'
  if (row.duplicate) return 'duplicate'
  return 'ready'
}

/**
 * ⚠ **The geocoded place first, the CSV's own city second.** They differ exactly
 * when a reviewer most needs to see it — a row whose address geocoded into the
 * next town over reads as that town here, which is the only warning they get
 * before the class is filed there.
 */
function placeOf(row: CommitRow): string | null {
  return row.resolved?.placeName?.trim() || row.values?.city?.trim() || null
}

/** A ready row has none; the rest carry theirs in the commit's own wording. */
function reasonsOf(row: CommitRow): string[] {
  return [...(row.errors ?? []), ...duplicateReason(row)]
}

/** Every address the batch's committable rows name, for the endpoint to look up. */
export function reviewEmails(rows: readonly CommitRow[]): string[] {
  const emails = new Set<string>()
  for (const row of rows) {
    const email = managerKeyOf(row.values ?? {})
    if (email && isCommittable(row)) emails.add(email)
  }
  return [...emails]
}
