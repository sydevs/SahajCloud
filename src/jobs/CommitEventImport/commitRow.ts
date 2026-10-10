/**
 * One row's class: where it is filed, who vouches for it, and the exactly-once
 * key that stops a retry creating it twice.
 *
 * ⚠ **Only a row's own fault refuses a row.** A field the class refused is
 * written onto the line and the pass carries on; anything else — a dropped
 * connection, a deadlock — is thrown, so the job retries rather than turning a
 * moment of trouble into a line the volunteer is told to fix. `failedAttempts`
 * is gone with the chunking: the queue's own `retries` is what bounds this now.
 *
 * ⚠ **`importKey` is asked before every create.** A class an earlier attempt
 * created whose row was never marked — the run died, or its write-back failed —
 * is found here and adopted rather than created a second time.
 */

import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import type { Coordinators } from '@/collections/EventImports/commit/coordinators'
import { eventCreateData } from '@/collections/EventImports/commit/eventData'
import { managerKeyOf } from '@/collections/EventImports/commit/managers'
import { placeLine } from '@/collections/EventImports/commit/placement'
import type { EnsuredRegions } from '@/collections/EventImports/commit/regions'
import type { CommitRow, Uploader } from '@/collections/EventImports/commit/rows'
import {
  IMPORT_LOG_TYPE,
  importKeyFor,
  importLogEntry,
  refuseRow,
} from '@/collections/EventImports/commit/rows'
import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import type { SubtreeRegion } from '@/collections/EventImports/regionReads'
import type { ResolvedRow } from '@/collections/EventImports/resolve/resolveRow'
import { appendLogEntry, asLog, hasLogEntry } from '@/fields'
import { updateEventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import { isSupportedTimezone } from '@/lib/timezones'
import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { EventImportProposedRegions, Region } from '@/payload-types'

export interface CommitRowArgs {
  /** The commit's write request — deferred cache invalidation and a fresh memo. */
  req: PayloadRequest
  row: CommitRow
  batchId: number
  targetId: number
  /** Whether a class may hang off the target itself — `Events.region` is a city or a venue. */
  targetLevel: Region['level']
  uploader: Uploader
  tree: EventImportProposedRegions
  regions: EnsuredRegions
  coordinators: Coordinators
  subtree: ReadonlyMap<number, SubtreeRegion>
  /**
   * The region each existing class a duplicate row points at sits in, for the
   * rows the reviewer chose to import alongside it. Absent from the map means
   * that class has left the target since the review.
   */
  placements: ReadonlyMap<number, number>
}

export async function commitRow(args: CommitRowArgs): Promise<void> {
  const { req, row, batchId, uploader, coordinators } = args
  const region = regionForRow(args)
  if (typeof region !== 'number') {
    refuseRow(row, region.error)
    return
  }

  // ⚠ **Narrowed here, not trusted.** `resolved.timezone` is a bare string in
  // the column (`EventImports.ts`) and `firstDate_tz` is a 581-member enum, so a
  // zone dropped from the enum since the resolve would otherwise be refused by
  // Postgres, against a column name rather than against this line.
  if (!isSupportedTimezone(row.resolved?.timezone ?? '')) {
    refuseRow(row, 'this row’s timezone is no longer one we support — upload the file again')
    return
  }

  const email = managerKeyOf(row.values ?? {})
  const unlinked = email ? coordinators.unlinked.get(email) : undefined
  if (unlinked && !row.warnings?.includes(unlinked)) {
    row.warnings = [...(row.warnings ?? []), unlinked]
  }
  const managerId = email ? (coordinators.ids.get(email) ?? null) : null
  const importKey = importKeyFor(batchId, row.line)

  try {
    const earlier = await req.payload.find({
      collection: 'events',
      where: { importKey: { equals: importKey } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      trash: true,
      select: { activityLog: true },
      req,
    })
    const already = earlier.docs[0]
    if (already) {
      row.committed = { eventId: already.id }
      await recordProvenance({ req, event: already, batchId, line: row.line, uploader })
      return
    }

    const prepared = eventCreateData({
      values: (row.values ?? {}) as RawImportRow,
      resolved: row.resolved as ResolvedRow,
      regionId: region,
      managerId,
      importKey,
    })
    if (!prepared.ok) {
      refuseRow(row, ...prepared.errors)
      return
    }

    const created = await req.payload.create({
      collection: 'events',
      data: prepared.data as never,
      context: prepared.context,
      overrideAccess: true,
      depth: 0,
      req,
    })
    row.committed = { eventId: created.id }
    await recordProvenance({ req, event: created, batchId, line: row.line, uploader })
  } catch (error) {
    const fields = validationFieldErrors(error)
    if (fields?.length) {
      refuseRow(row, ...describeValidationErrors(fields))
      return
    }
    if (error instanceof APIError && error.status < 500) {
      refuseRow(row, error.message)
      return
    }
    throw error
  }
}

type RegionChoice = number | { error: string }

/**
 * Which region this row's class is filed under, or why none can be.
 *
 * ⚠ **A `pending` placement is a node's failure reaching the rows that needed
 * it.** `ensureProposedRegions` explained it once per node; this is where the
 * volunteer reads it, against the line they can fix.
 *
 * ⚠ **A duplicate the reviewer chose to import is in no node.** The proposal
 * leaves duplicates out of the tree, so such a row is filed where the class it
 * repeats is: under the same hall for a strong match, under that hall's town for
 * a weak one, which may be another hall.
 *
 * ⚠ **A country or state target cannot hold a class itself.** `Events.region` is
 * a city or a venue, so a row the proposal placed in no node would otherwise be
 * refused by that field's own validator — naming a row id rather than the line.
 */
function regionForRow(args: CommitRowArgs): RegionChoice {
  const { row, targetId, targetLevel, tree, regions, subtree } = args
  const placement = placeLine(row.line, tree.nodes, regions.known)

  if (placement.kind === 'region') return placement.regionId
  if (placement.kind === 'pending') {
    const { name, key } = placement.node
    const why = regions.failures.get(key)
    return {
      error: why
        ? `${name} could not be created — ${why}`
        : `${name} is not a region this import can file a class in`,
    }
  }

  const repeated = row.duplicate
  if (repeated?.eventId !== undefined) {
    const regionId = args.placements.get(repeated.eventId)
    if (regionId === undefined) {
      return { error: 'the class this row repeats is no longer in this region' }
    }
    const region = subtree.get(regionId)
    return repeated.strength === 'weak' && region?.level === 'venue' && region.parentId !== null
      ? region.parentId
      : regionId
  }
  if (repeated?.line !== undefined) {
    const first = placeLine(repeated.line, tree.nodes, regions.known)
    if (first.kind === 'region') return first.regionId
  }

  return targetLevel === 'city' || targetLevel === 'venue'
    ? targetId
    : { error: 'this row belongs to no proposed city — upload the file again' }
}

/**
 * Name who imported the class, on the class, once.
 *
 * Keyed by batch and line, and skipped when already there — a retried row must
 * not log twice. A failure to write it is logged and swallowed: the class exists
 * either way, and refusing the row afterwards would report a class that was
 * created as one that was not.
 */
async function recordProvenance(args: {
  req: PayloadRequest
  /** The class as its write returned it, which already carries its log. */
  event: { id: number; activityLog?: unknown }
  batchId: number
  line: number
  uploader: Uploader
}): Promise<void> {
  const { req, event, batchId, line, uploader } = args
  const log = asLog(event.activityLog)
  if (hasLogEntry(log, IMPORT_LOG_TYPE, importKeyFor(batchId, line))) return
  const entry = importLogEntry({ batchId, line, uploader, at: new Date().toISOString() })

  try {
    await updateEventBookkeeping({
      payload: req.payload,
      id: event.id,
      // Appended to what the write returned: an adopted class already carries
      // the verification entry `syncVerificationOnSave` wrote, and replacing the
      // log would delete it.
      data: { activityLog: appendLogEntry(log, entry) },
      req,
    })
  } catch (error) {
    req.payload.logger.warn(
      { err: error, batch: batchId, line, event: event.id },
      'Imported class has no provenance entry',
    )
  }
}
