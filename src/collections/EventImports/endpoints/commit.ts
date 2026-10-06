import type { SubtreeRegion } from '../batchRequest'
import type { RawImportRow } from '../csv/columns'
import type { Candidate } from '../resolve/candidates'
import type { ResolvedRow } from '../resolve/resolveRow'
import type { Endpoint, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { appendLogEntry, asLog, hasLogEntry } from '@/fields'
import { requireActiveManager } from '@/lib/endpoints'
import { updateEventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import { isSupportedTimezone } from '@/lib/timezones'
import { relationId } from '@/lib/utilities/relationId'
import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type {
  Event,
  EventImport,
  EventImportProposedRegions,
  EventImportReport,
  Region,
} from '@/payload-types'

import {
  batchIdOf,
  failure,
  hasPendingRows,
  loadTarget,
  readSubtree,
  refuseRevokedRole,
  refuseUnownedTarget,
} from '../batchRequest'
import { ensureCoordinators, type Coordinators } from '../commit/coordinators'
import { eventCreateData, eventOverwriteData } from '../commit/eventData'
import { finishCommit } from '../commit/finish'
import { managerKeyOf, managerRoster } from '../commit/managers'
import { creatableNodes, placeLine } from '../commit/placement'
import { ensureProposedRegions } from '../commit/regions'
import {
  duplicateAction,
  IMPORT_LOG_TYPE,
  importKeyFor,
  importLogEntry,
  isCommittable,
  MAX_ROW_ATTEMPTS,
  refuseRow,
  reviveOrphanedRepeats,
  rowsAwaitingCommit,
  type CommitRow,
  type Uploader,
} from '../commit/rows'
import { commitWriteReq } from '../commit/scope'
import { tallyRows } from '../commit/summary'
import { COMMIT_CHUNK_ROWS } from '../constants'
import { busy, renewLease, withLease } from '../lease'
import { loadExistingCandidates, preparedFrom } from '../resolve/candidates'
import { findDuplicate } from '../resolve/duplicates'

/**
 * POST /api/event-imports/:id/commit
 *
 * Writes the next chunk of a reviewed batch: the proposed regions, then the
 * chunk's coordinators, then one class per row. The review UI calls it until the
 * response says `done`.
 *
 * ⚠ **Chunked and resumable per row, because there is no batch transaction.**
 * The ticket rules one out — 500 classes in one transaction holds a write lock
 * across every region the batch touches — so a request that dies has already
 * created classes. Three things keep a retry from creating them twice: the
 * batch's lease, so no two calls work it at once (`lease.ts`); each class's
 * `importKey`, unique and checked before every create, so a class whose row was
 * never marked is found rather than repeated (`commit/rows.ts`); and
 * `rows[].committed`, which is what moves the batch on.
 *
 * ⚠ **The duplicate check is asked again of every row it writes.** The review's
 * answer is minutes or days old; another volunteer's batch into the same region,
 * or this file uploaded twice, may have added the class since. A row that now
 * repeats one is skipped and reported, because nobody chose otherwise.
 *
 * ⚠ **Only a row's own fault fails a row.** A refused field is written onto the
 * line; anything else — a dropped connection, a deadlock — stops the chunk with
 * a 503 and leaves the row to the next call, up to `MAX_ROW_ATTEMPTS`.
 *
 * ⚠ **`committing` is a one-way door.** The resolve and propose endpoints refuse
 * a batch in that status, so a tree cannot change under a half-written commit —
 * which is why the status is written before the first class rather than after
 * the last.
 *
 * ⚠ **The tree is re-read, never rebuilt — but what it names is re-checked.**
 * `proposedRegions` is what a human approved; recomputing it here would commit a
 * shape nobody saw. A region it matched that has since left the target, a slug
 * taken since, a feature created since: each is caught by `ensureProposedRegions`.
 *
 * ⚠ **`done` leaves the batch as its report** (`commit/finish.ts`), so a caller
 * that loses the final response and asks again gets the same report back.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. `managers` sits
 * in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is. Which batch the caller may
 * touch comes from the collection's own `access` (`access.ts`); the role and the
 * subtree are re-checked explicitly because every write that follows elevates
 * past both.
 */
export const commitEventImport: Endpoint = {
  path: '/:id/commit',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const probe = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      // A finished batch is trashed as its report, which is what a lost final
      // response is answered from.
      trash: true,
      select: {
        status: true,
        targetRegion: true,
        uploadLocale: true,
        report: true,
        deletedAt: true,
      },
      req,
    })) as EventImport | null
    if (!probe) return failure('No such import batch.', 404)
    if (probe.status === 'finished' && probe.report) return replay(probe.report)
    if (probe.deletedAt) return failure('No such import batch.', 404)

    const revoked = refuseRevokedRole(req, probe)
    if (revoked) return revoked

    const targetId = relationId(probe.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)
    const warn = loaded.warning ? { warning: loaded.warning } : {}

    return withLease(req, id, async (token) => {
      const batch = (await req.payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
        trash: true,
        req,
      })) as EventImport
      if (batch.status === 'finished' && batch.report) return replay(batch.report)
      if (batch.deletedAt) return failure('No such import batch.', 404)
      if (batch.status === 'uploaded') {
        return failure('Resolve the batch before committing it.', 409)
      }
      const tree = batch.proposedRegions
      if (!tree) return failure('Propose the batch regions before committing it.', 409)

      const rows = (batch.rows ?? []) as CommitRow[]
      if (hasPendingRows(rows)) return failure('Resolve the batch before committing it.', 409)

      // Before anything is created: a row the proposal refused carries its
      // reason in the tree and nothing on the row, so it would otherwise read as
      // committable here.
      adoptTreeErrors(rows, tree)

      // ⚠ **Checked before the status moves, because `committing` is a one-way
      // door.** Resolve and propose both refuse that status, so a batch locked
      // into it over a tree nobody can commit cannot be proposed again — and
      // this refusal is an instruction to do exactly that.
      try {
        creatableNodes(tree.nodes)
      } catch (error) {
        req.payload.logger.error({ err: error, batch: id }, 'Event import tree is not committable')
        return failure('This batch’s region tree cannot be committed. Propose it again.', 422)
      }

      if (batch.status !== 'committing') {
        await req.payload.update({
          collection: 'event-imports',
          id,
          data: { status: 'committing' },
          overrideAccess: true,
          depth: 0,
          select: { status: true },
          req,
        })
      }

      const uploader = await uploaderOf(req, relationId(batch.uploader))
      let interrupted: unknown = null
      let committedNow = 0
      let regionCounts = { created: 0, adopted: 0, failed: 0 }
      let coordinatorCounts = { matched: 0, created: 0, unlinked: 0 }

      try {
        const subtree = await readSubtree(req, targetId)
        const regions = await ensureProposedRegions(req, {
          batchId: id,
          targetId,
          nodes: tree.nodes,
          subtree,
        })
        regionCounts = {
          created: regions.created,
          adopted: regions.adopted,
          failed: regions.failures.size,
        }

        const chunk = rowsAwaitingCommit(rows).slice(0, COMMIT_CHUNK_ROWS)
        if (chunk.length) {
          await recheckDuplicates(req, { batchId: id, targetId, chunk, rows })
          const writable = chunk.filter(isCommittable)
          const coordinators = await ensureCoordinators(
            req,
            managerRoster(writable.map(({ line, values }) => ({ line, values: values ?? {} }))),
            [...subtree.keys()],
          )
          coordinatorCounts = {
            matched: coordinators.matched,
            created: coordinators.created,
            unlinked: coordinators.unlinked.size,
          }
          // One copy for the whole chunk: every region a row files into exists
          // by now, and the caller's own request still carries the pre-commit
          // answer (`commit/scope.ts`).
          const writeReq = commitWriteReq(req, {
            inviteCoordinators: batch.inviteCoordinators === true,
          })
          const placements = await duplicatePlacements(req, writable, subtree)

          for (const row of writable) {
            const outcome = await commitRow({
              req: writeReq,
              row,
              batchId: id,
              targetId,
              targetLevel: loaded.target.level,
              uploader,
              tree,
              regions,
              coordinators,
              subtree,
              placements,
            })
            if (outcome === 'written') committedNow += 1
            if (outcome instanceof Error) {
              interrupted = outcome
              break
            }
          }
        }
      } catch (error) {
        interrupted = error
      }

      reviveOrphanedRepeats(rows)
      const pending = rowsAwaitingCommit(rows).length

      if (!(await renewLease(req, id, token))) return busy()
      // After the rows, never before: a finish that throws part-way must not
      // also lose the record of what this chunk committed.
      await req.payload.update({
        collection: 'event-imports',
        id,
        data: { rows },
        overrideAccess: true,
        depth: 0,
        select: { status: true },
        req,
      })

      const progress = {
        ...warn,
        regions: regionCounts,
        coordinators: coordinatorCounts,
        rows: tallyRows(rows),
        committedNow,
        pending,
      }

      if (interrupted) {
        req.payload.logger.error({ err: interrupted, batch: id }, 'Event import chunk interrupted')
        return Response.json(
          {
            ...progress,
            done: false,
            errors: [{ message: 'Part of this chunk could not be written. Resume to carry on.' }],
          },
          { status: 503 },
        )
      }

      if (pending > 0) return Response.json({ ...progress, done: false })

      const finished = await finishCommit(req, {
        batchId: id,
        batchCreatedAt: batch.createdAt,
        targetId,
        targetName: loaded.target.name,
        uploader,
        rows,
        nodes: tree.nodes,
      })
      return Response.json({ ...progress, finished, done: true })
    })
  },
}

/** The answer for a batch an earlier call already finished. */
function replay(report: EventImportReport): Response {
  return Response.json({
    finished: {
      committed: report.committed,
      skipped: report.skipped,
      reportEmailed: report.reportEmailed,
      summaryEmailed: false,
    },
    pending: 0,
    done: true,
    replayed: true,
  })
}

/**
 * Ask the duplicate question again of the rows about to be written.
 *
 * Only of rows the reviewer never saw a match for: a row they already decided
 * on keeps their decision.
 */
async function recheckDuplicates(
  req: PayloadRequest,
  args: { batchId: number; targetId: number; chunk: CommitRow[]; rows: readonly CommitRow[] },
): Promise<void> {
  const { batchId, targetId, chunk } = args
  const unchecked = chunk.filter((row) => !row.duplicate && row.resolved)
  if (!unchecked.length) return

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

/** The region of each existing class a chunk's duplicates point at. */
type DuplicatePlacements = Map<number, number>

async function duplicatePlacements(
  req: PayloadRequest,
  rows: readonly CommitRow[],
  subtree: ReadonlyMap<number, SubtreeRegion>,
): Promise<DuplicatePlacements> {
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
  const placements: DuplicatePlacements = new Map()
  for (const event of docs as Event[]) {
    const regionId = relationId(event.region)
    if (regionId !== null && subtree.has(regionId)) placements.set(event.id, regionId)
  }
  return placements
}

interface CommitRowArgs {
  req: PayloadRequest
  row: CommitRow
  batchId: number
  targetId: number
  /** Whether a class may hang off the target itself — `Events.region` is a city or a venue. */
  targetLevel: Region['level']
  uploader: Uploader
  tree: EventImportProposedRegions
  regions: Awaited<ReturnType<typeof ensureProposedRegions>>
  coordinators: Coordinators
  subtree: ReadonlyMap<number, SubtreeRegion>
  placements: DuplicatePlacements
}

/**
 * `written` when the row's class now exists, `refused` when the row carries why
 * not, or the error that was not the row's fault — which stops the chunk.
 */
type RowOutcome = 'refused' | 'written' | Error

/**
 * Write one row's class, overwrite the one it repeats, or record why neither.
 *
 * A refusal is written onto the row rather than thrown, so one bad row costs its
 * own line and not the rest of the chunk.
 */
async function commitRow(args: CommitRowArgs): Promise<RowOutcome> {
  const { req, row, batchId, uploader, coordinators } = args
  const region = regionForRow(args)
  if (typeof region !== 'number') {
    refuseRow(row, region.error)
    return 'refused'
  }

  // ⚠ **Narrowed here, not trusted.** `resolved.timezone` is a bare string in
  // the column (`EventImports.ts`) and `firstDate_tz` is a 581-member enum, so a
  // zone dropped from the enum since the resolve would otherwise be refused by
  // Postgres, against a column name rather than against this line.
  if (!isSupportedTimezone(row.resolved?.timezone ?? '')) {
    refuseRow(row, 'this row’s timezone is no longer one we support — resolve it again')
    return 'refused'
  }

  const email = managerKeyOf(row.values ?? {})
  const unlinked = email ? coordinators.unlinked.get(email) : undefined
  if (unlinked && !row.warnings?.includes(unlinked)) {
    row.warnings = [...(row.warnings ?? []), unlinked]
  }
  const managerId = email ? (coordinators.ids.get(email) ?? null) : null
  const base = {
    values: (row.values ?? {}) as RawImportRow,
    resolved: row.resolved as ResolvedRow,
    regionId: region,
    managerId,
  }

  try {
    if (duplicateAction(row) === 'overwrite') {
      return await overwriteClass(args, base)
    }

    const importKey = importKeyFor(batchId, row.line)
    // ⚠ **Asked before every create.** A class an earlier call created whose
    // row was never marked — the request died, or its final write failed — is
    // found here and adopted rather than created a second time.
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
      row.committed = { eventId: already.id, action: 'created' }
      await recordProvenance({ req, event: already, batchId, line: row.line, uploader })
      return 'written'
    }

    const prepared = eventCreateData({ ...base, importKey })
    if (!prepared.ok) {
      refuseRow(row, ...prepared.errors)
      return 'refused'
    }
    const created = await req.payload.create({
      collection: 'events',
      data: prepared.data as never,
      context: prepared.context,
      overrideAccess: true,
      depth: 0,
      req,
    })
    row.committed = { eventId: created.id, action: 'created' }
    await recordProvenance({ req, event: created, batchId, line: row.line, uploader })
    return 'written'
  } catch (error) {
    return rowFailure(req, row, error, batchId)
  }
}

/**
 * Overwrite the class a duplicate row repeats with the row's filled columns.
 *
 * ⚠ **Re-checked against the target before the write.** The class may have been
 * moved, or trashed, since the reviewer chose this — and an admin's commit is
 * not stopped by the scoping a volunteer's write meets.
 */
async function overwriteClass(
  args: CommitRowArgs,
  base: Parameters<typeof eventOverwriteData>[0],
): Promise<RowOutcome> {
  const { req, row, batchId, uploader, placements } = args
  const eventId = row.duplicate?.eventId
  if (eventId === undefined || !placements.has(eventId)) {
    refuseRow(row, 'the class this row was to overwrite is no longer in this region')
    return 'refused'
  }

  const prepared = eventOverwriteData(base)
  if (!prepared.ok) {
    refuseRow(row, ...prepared.errors)
    return 'refused'
  }
  const updated = await req.payload.update({
    collection: 'events',
    id: eventId,
    data: prepared.data as never,
    overrideAccess: true,
    depth: 0,
    req,
  })
  row.committed = { eventId, action: 'overwrote' }
  await recordProvenance({
    req,
    event: updated,
    batchId,
    line: row.line,
    uploader,
    overwrote: true,
  })
  return 'written'
}

/**
 * What a failed write means for its row.
 *
 * A field the class refused is the row's to fix. Anything else is ours — a
 * dropped connection, a deadlock — so the row stays pending and the chunk
 * stops, unless it has now failed that way `MAX_ROW_ATTEMPTS` times, when it is
 * reported rather than retried forever.
 */
function rowFailure(
  req: PayloadRequest,
  row: CommitRow,
  error: unknown,
  batchId: number,
): RowOutcome {
  const fields = validationFieldErrors(error)
  if (fields?.length) {
    refuseRow(row, ...describeValidationErrors(fields))
    return 'refused'
  }
  if (error instanceof APIError && error.status < 500) {
    refuseRow(row, error.message)
    return 'refused'
  }

  row.failedAttempts = (row.failedAttempts ?? 0) + 1
  req.payload.logger.error(
    { err: error, batch: batchId, line: row.line, attempt: row.failedAttempts },
    'Event import row could not be written',
  )
  if (row.failedAttempts >= MAX_ROW_ATTEMPTS) {
    refuseRow(row, 'this class could not be created — please report it to an admin')
    return 'refused'
  }
  return error instanceof Error ? error : new Error(String(error))
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
  const { row, targetId, targetLevel, tree, regions, subtree, placements } = args
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
    const regionId = placements.get(repeated.eventId)
    if (regionId === undefined)
      return { error: 'the class this row repeats is no longer in this region' }
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
    : { error: 'this row belongs to no proposed city — propose the batch again' }
}

/**
 * Name who imported the class, on the class, once.
 *
 * The batch is reduced to its report the moment the commit finishes, so this
 * entry is the class's provenance record. Keyed by batch and line, and skipped
 * when already there — a retried row must not log twice. A failure to write it
 * is logged and swallowed: the class exists either way, and refusing the row
 * afterwards would report a class that was created as one that was not.
 */
async function recordProvenance(args: {
  req: PayloadRequest
  /** The class as its write returned it, which already carries its log. */
  event: { id: number; activityLog?: unknown }
  batchId: number
  line: number
  uploader: Uploader
  overwrote?: boolean
}): Promise<void> {
  const { req, event, batchId, line, uploader, overwrote } = args
  const log = asLog(event.activityLog)
  if (hasLogEntry(log, IMPORT_LOG_TYPE, importKeyFor(batchId, line))) return
  const entry = importLogEntry({ batchId, line, uploader, at: new Date().toISOString(), overwrote })

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

/**
 * Who uploaded the batch, which is not who fired the commit.
 *
 * An admin may commit somebody else's batch, and the provenance entry names the
 * volunteer whose file it is — by id as well as by name, since the name is
 * theirs to edit. A deleted account degrades to a number rather than a blank.
 */
async function uploaderOf(req: PayloadRequest, uploaderId: null | number): Promise<Uploader> {
  if (uploaderId === null) return { id: null, name: 'Bulk import' }
  const manager = await req.payload
    .findByID({
      collection: 'managers',
      id: uploaderId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { name: true },
      req,
    })
    .catch(() => null)
  return { id: uploaderId, name: manager?.name?.trim() || `#${uploaderId}` }
}

/** Copy the proposal's own refusals onto the rows they belong to, once. */
function adoptTreeErrors(rows: CommitRow[], tree: EventImportProposedRegions): void {
  if (!tree.rowErrors.length) return
  const byLine = new Map(rows.map((row) => [row.line, row]))
  for (const { line, message } of tree.rowErrors) {
    const row = byLine.get(line)
    if (row && !row.errors?.includes(message)) refuseRow(row, message)
  }
}
