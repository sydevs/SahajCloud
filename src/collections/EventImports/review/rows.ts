/**
 * The batch reduced to what a reviewer reads before they commit it.
 *
 * ⚠ **Every verdict here is the commit's own, never a second reading of it.**
 * `isCommittable` decides which rows become classes, `managerRoster` which
 * addresses are one coordinator, `duplicateReason` how a skip is worded, and
 * `adoptTreeErrors` (`endpoints/commit.ts`) folds the proposal's refusals onto
 * the rows before any of that runs — so this takes the tree's `rowErrors` as an
 * argument and folds them in the same way. A review that answered differently
 * would promise a number the summary email then contradicts, and the batch is
 * deleted before the volunteer could compare the two.
 *
 * ⚠ **A row's two verdicts are separate, because they answer different
 * questions.** `status` says whether a class is created at all; `coordinator`
 * says whether anyone vouches for the one that is. The ticket lists
 * "will-create-manager" beside the skips, but a row can be ready *and* about to
 * open an account — folding the two into one field would hide whichever came
 * second, and the account is the half the banner counts.
 */

import type { ExistingRegion } from '../propose/match'

import { managerKeyOf, managerRoster } from '../commit/managers'
import { isCommittable, type CommitRow } from '../commit/rows'
import { skipReasons } from '../commit/summary'
import { existingRegionLabel } from '../propose/match'

/** Why a row is or is not going to become a class. */
export type ReviewRowStatus = 'committed' | 'duplicate' | 'error' | 'pending' | 'ready'

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
  /** Addresses the commit opens an account for. */
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
  /**
   * The stored tree's own refusals, which are not on the rows yet.
   *
   * ⚠ **Without these the review contradicts the commit on three counts at
   * once.** A line whose city the Atlas holds outside the target is refused by
   * the proposal (`propose/tree.ts`), and the commit copies that onto the row
   * before it rosters anything. Left out here, the line reads `ready` with no
   * reason given, and its coordinator is counted towards an account the commit
   * never opens.
   */
  treeRowErrors: readonly { line: number; message: string }[]
}

/**
 * The review's table and its coordinator banner, from one pass over the rows.
 *
 * ⚠ **The banner counts addresses, never rows.** Twelve classes run by one new
 * coordinator is one account, and a per-row count would tell a volunteer they
 * were about to open twelve.
 */
export function reviewRows({ knownEmails, rows, treeRowErrors }: ReviewRowsArgs): ReviewRowsResult {
  const refusedByTree = new Map<number, string[]>()
  for (const { line, message } of treeRowErrors) {
    refusedByTree.set(line, [...(refusedByTree.get(line) ?? []), message])
  }

  const newEmails = new Set<string>()
  const existingEmails = new Set<string>()

  const reviewed = rows.map((row): ReviewRow => {
    const fromTree = refusedByTree.get(row.line) ?? []
    const email = managerKeyOf(row.values ?? {})
    const rostered = email && isCommittable(row) && !fromTree.length ? email : null
    if (rostered) (knownEmails.has(rostered) ? existingEmails : newEmails).add(rostered)

    return {
      line: row.line,
      status: statusOf(row, fromTree),
      title: row.values?.title?.trim() || null,
      place: placeOf(row),
      reasons: skipReasons(row, fromTree),
      coordinator: !email ? 'none' : knownEmails.has(email) ? 'existing' : 'new',
    }
  })

  return {
    rows: reviewed,
    coordinators: { existing: existingEmails.size, created: newEmails.size },
  }
}

/**
 * ⚠ **`committed` comes first, because a resumed batch is full of them.** The
 * commit writes 20 rows per request and the review stays readable while it runs,
 * so an interrupted 100-row batch has classes that already exist — and calling
 * one `ready` invites a volunteer to go looking for what went wrong.
 * `commitReport` and `tallyRows` both branch on this; the review is the third
 * reader of the same field.
 *
 * ⚠ **An error outranks a duplicate**, the order `isCommittable` already reads
 * them in: a row carrying both is skipped for the error, and calling it a
 * duplicate would send a volunteer looking for a class that was never matched.
 *
 * `pending` is the last clause for the same reason `isCommittable` has it: a
 * batch cannot be proposed until every row has an answer, so it is unreachable
 * today — and a row with no answer and no reason must still not read `ready`.
 */
function statusOf(row: CommitRow, fromTree: readonly string[]): ReviewRowStatus {
  if (row.committed) return 'committed'
  if (row.errors?.length || fromTree.length) return 'error'
  if (row.duplicate) return 'duplicate'
  if (!row.resolved) return 'pending'
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

/**
 * Every address the batch names, for the endpoint to look up.
 *
 * ⚠ **Wider than the banner counts, and it has to be.** Each row reports its own
 * coordinator, skipped rows included, so an address this leaves out is never in
 * `knownEmails` and the row carrying it reads `new` — telling a volunteer that
 * line 7's coordinator is a stranger when the Atlas has held their account for
 * years. The banner stays narrow by filtering what it counts, not what is asked.
 */
export function reviewEmails(rows: readonly CommitRow[]): string[] {
  return managerRoster(rows).map(({ email }) => email)
}

/**
 * The regions a mapping control may offer, out of the target's whole subtree.
 *
 * ⚠ **Filtered to the levels the tree actually holds, or the control offers what
 * the edit endpoint then refuses.** `applyTreeEdits` requires a candidate at the
 * node's own level (`propose/edit.ts`), so an unfiltered list always includes the
 * target itself — offering a reviewer the country their new city would be mapped
 * onto, and a 422 when they pick it.
 *
 * The label is `match.ts`'s, so a region reads the same here as it does on the
 * node once it is chosen.
 */
export interface MappableRegion {
  id: number
  level: ExistingRegion['level']
  name: string
}

export function mappableRegions(
  regions: readonly ExistingRegion[],
  levels: ReadonlySet<ExistingRegion['level']>,
): MappableRegion[] {
  return regions
    .filter((region) => levels.has(region.level))
    .map((region) => ({
      id: region.id,
      level: region.level,
      name: existingRegionLabel(region),
    }))
}
