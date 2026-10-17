/**
 * The duplicate question, asked again of the rows about to be written, and
 * where the class each one repeats now sits.
 *
 * ⚠ **The review's answer is minutes or days old.** Another volunteer's batch
 * into the same region, or this file uploaded twice, may have added the class
 * since. A row that now repeats one is skipped and reported, because nobody
 * chose otherwise — only rows the reviewer never saw a match for are re-asked.
 */

import type { PayloadRequest } from 'payload'

import type { CommitRow } from '@/collections/EventImports/commit/rows'
import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import type { SubtreeRegion } from '@/collections/EventImports/regionReads'
import type { Candidate } from '@/collections/EventImports/resolve/candidates'
import {
  loadExistingCandidates,
  preparedFrom,
} from '@/collections/EventImports/resolve/candidates'
import { findDuplicate } from '@/collections/EventImports/resolve/duplicates'
import type { ResolvedRow } from '@/collections/EventImports/resolve/resolveRow'
import { relationId } from '@/lib/utilities/relationId'
import type { Event } from '@/payload-types'

export async function recheckDuplicates(args: {
  req: PayloadRequest
  batchId: number
  targetId: number
  /** Mutated in place: a row that now repeats a class gains its `duplicate`. */
  rows: CommitRow[]
}): Promise<void> {
  const { req, batchId, targetId, rows } = args
  const unchecked = rows.filter((row) => !row.duplicate && row.resolved)
  if (!unchecked.length) return

  // `exceptBatch` leaves out the classes this batch itself created on an earlier
  // attempt — they carry this batch's `importKey`, and matching against them
  // would skip every row a retry is resuming.
  const candidates: Candidate[] = await loadExistingCandidates(req, targetId, {
    exceptBatch: batchId,
  })
  for (const row of unchecked) {
    const match = findDuplicate(
      preparedFrom(row.resolved as ResolvedRow, (row.values ?? {}) as RawImportRow),
      candidates,
    )
    if (!match) continue
    const matched = candidates[match.index]!
    row.duplicate = {
      reason: match.reason,
      strength: match.strength,
      ...(matched.eventId === undefined ? {} : { eventId: matched.eventId }),
      atCommit: true,
    }
  }
}

/**
 * The region each class a duplicate row points at sits in, limited to the
 * target's own subtree.
 *
 * ⚠ **A class outside the subtree is left out, not placed.** A row the reviewer
 * chose to import alongside a class that has since been moved must be refused
 * rather than filed somewhere this batch was never aimed at.
 */
export async function duplicatePlacements(
  req: PayloadRequest,
  rows: readonly CommitRow[],
  subtree: ReadonlyMap<number, SubtreeRegion>,
): Promise<Map<number, number>> {
  const ids = [...new Set(rows.flatMap((row) => row.duplicate?.eventId ?? []))]
  if (!ids.length) return new Map()

  const { docs } = await req.payload.find({
    collection: 'events',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { region: true },
    req,
  })

  const placements = new Map<number, number>()
  for (const event of docs as Event[]) {
    const regionId = relationId(event.region)
    if (regionId !== null && subtree.has(regionId)) placements.set(event.id, regionId)
  }
  return placements
}
