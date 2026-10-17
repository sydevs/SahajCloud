/**
 * The resolve job's second pass: which rows repeat a class the Atlas already
 * holds, or an earlier line of this same file.
 *
 * ⚠ **Sequential, in file order, and that is the point.** Each resolved row
 * joins the candidate pool after it is matched, so line 40 can be found to
 * repeat line 7 — and the answer does not depend on which geocode returned
 * first. #874 ran this inside its chunks, which is why its answers moved with
 * the chunk boundaries.
 *
 * ⚠ **Nothing is written to the existing class.** A match is a note on the
 * importing row and a choice for the reviewer; an import never modifies a class
 * that is already published.
 */

import type { PayloadRequest } from 'payload'

import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import type { Candidate } from '@/collections/EventImports/resolve/candidates'
import {
  asCandidate,
  loadExistingCandidates,
  preparedFrom,
} from '@/collections/EventImports/resolve/candidates'
import { findDuplicate } from '@/collections/EventImports/resolve/duplicates'
import type { ResolvedRow } from '@/collections/EventImports/resolve/resolveRow'
import type { EventImportRows } from '@/payload-types'

type ImportRow = EventImportRows[number]

export async function markDuplicates(args: {
  req: PayloadRequest
  targetId: number
  /** Mutated in place: a matched row gains its `duplicate`. */
  rows: ImportRow[]
}): Promise<void> {
  const { req, targetId, rows } = args
  const resolved = rows.filter((row) => row.resolved)
  if (!resolved.length) return

  const candidates: Candidate[] = await loadExistingCandidates(req, targetId)

  for (const row of resolved) {
    // A row the reviewer already decided on keeps its decision: this job re-runs
    // after a re-upload, and the rows it is given then are fresh anyway.
    if (!row.duplicate) {
      const match = findDuplicate(
        preparedFrom(row.resolved as ResolvedRow, (row.values ?? {}) as RawImportRow),
        candidates,
      )
      if (match) {
        const matched = candidates[match.index]!
        row.duplicate = {
          reason: match.reason,
          strength: match.strength,
          ...(matched.eventId === undefined ? {} : { eventId: matched.eventId }),
          ...(matched.line === undefined ? {} : { line: matched.line }),
        }
      }
    }
    candidates.push(asCandidate(row))
  }
}
