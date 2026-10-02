import type { ResolvedRow } from '../resolve/resolveRow'
import type { Endpoint, PayloadRequest } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { requireActiveManager } from '@/lib/endpoints'
import { updateEventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import { isSupportedTimezone } from '@/lib/timezones'
import { relationId } from '@/lib/utilities/relationId'
import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { EventImport, EventImportProposedRegions, Region } from '@/payload-types'

import { batchIdOf, failure, loadTarget, refuseUnownedTarget } from '../batchRequest'
import { ensureCoordinators } from '../commit/coordinators'
import { eventCreateData } from '../commit/eventData'
import { managerKeyOf, managerRoster } from '../commit/managers'
import { creatableNodes, placeLine } from '../commit/placement'
import { ensureProposedRegions } from '../commit/regions'
import {
  importLogEntry,
  isCommittable,
  refuseRow,
  rowsAwaitingCommit,
  type CommitRow,
} from '../commit/rows'
import { freshScopeReq } from '../commit/scope'
import { COMMIT_CHUNK_ROWS } from '../constants'

/**
 * POST /api/event-imports/:id/commit
 *
 * Writes the next chunk of a reviewed batch: the proposed regions, then the
 * coordinators, then one class per row. The review UI calls it until the
 * response says `done`.
 *
 * ⚠ **Chunked and resumable per row, because there is no batch transaction.**
 * The ticket rules one out — 500 classes in one transaction holds a write lock
 * across every region the batch touches — so a request that dies has already
 * created classes, and `rows[].committed` is what stops the next one creating
 * them twice. Both earlier steps are idempotent through a unique column rather
 * than through stored ids (`commit/regions.ts`, `commit/coordinators.ts`), so
 * every call re-establishes them and only the rows advance.
 *
 * ⚠ **`committing` is a one-way door.** The resolve and propose endpoints refuse
 * a batch in that status, so a tree cannot change under a half-written commit —
 * which is why the status is written before the first class rather than after
 * the last.
 *
 * ⚠ **The tree is re-read, never rebuilt.** `proposedRegions` is what a human
 * approved; recomputing it here would commit a shape nobody saw. A node whose
 * region has since been created elsewhere is caught by the `mapboxId` read, and
 * the rows of a node that cannot be written become row errors.
 *
 * `done` does not finish the batch. The single Cloudflare purge, the admin
 * summary and the hard delete are the next step's, and the batch stays
 * `committing` until it runs.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. `managers` sits
 * in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is. Which batch the caller may
 * touch comes from the collection's own `access` (`access.ts`); the subtree
 * check is re-run explicitly because every write that follows elevates past it.
 */
export const commitEventImport: Endpoint = {
  path: '/:id/commit',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      req,
    })) as EventImport | null
    if (!batch) return failure('No such import batch.', 404)
    if (batch.status === 'uploaded') {
      return failure('Resolve the batch before committing it.', 409)
    }

    const tree = batch.proposedRegions
    if (!tree) return failure('Propose the batch regions before committing it.', 409)

    const targetId = relationId(batch.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)

    const rows = (batch.rows ?? []) as CommitRow[]
    // Before anything is created: a row the proposal refused carries its reason
    // in the tree and nothing on the row, so it would otherwise read as
    // committable here. Copying it over makes the row the one place a skip is
    // recorded, which is what the next chunk reads.
    adoptTreeErrors(rows, tree)

    // ⚠ **Checked before the status moves, because `committing` is a one-way
    // door.** Resolve and propose both refuse that status, so a batch locked
    // into it over a tree nobody can commit cannot be proposed again — and this
    // refusal is an instruction to do exactly that. `creatableNodes` is pure, so
    // asking twice costs a filter over a few dozen nodes.
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

    const regions = await ensureProposedRegions(req, { batchId: id, targetId, nodes: tree.nodes })

    const coordinators = await ensureCoordinators(
      req,
      managerRoster(rows.filter(isCommittable).map(({ line, values }) => ({ line, values }))),
    )

    const chunk = rowsAwaitingCommit(rows).slice(0, COMMIT_CHUNK_ROWS)
    // One copy for the whole chunk: every region a row files into exists by now,
    // and the caller's own request still carries the pre-commit answer.
    const writeReq = chunk.length ? freshScopeReq(req) : req
    const uploaderName = chunk.length ? await nameOfUploader(req, relationId(batch.uploader)) : ''
    let committed = 0

    for (const row of chunk) {
      const wrote = await commitRow({
        req: writeReq,
        row,
        batchId: id,
        targetId,
        targetLevel: loaded.target.level,
        uploaderName,
        tree,
        regions,
        coordinators,
      })
      if (wrote) committed += 1
    }

    const pending = rowsAwaitingCommit(rows).length
    await req.payload.update({
      collection: 'event-imports',
      id,
      // The caller's ownership was settled above, and `rows` is `readOnly` in
      // the admin — so this write elevates past field access deliberately.
      data: { rows },
      overrideAccess: true,
      depth: 0,
      select: { status: true },
      req,
    })

    return Response.json({
      ...(loaded.warning ? { warning: loaded.warning } : {}),
      regions: {
        created: regions.created,
        adopted: regions.adopted,
        failed: regions.failures.size,
      },
      coordinators: {
        matched: coordinators.matched,
        created: coordinators.created,
        refused: coordinators.refusals.size,
      },
      rows: tally(rows),
      committedNow: committed,
      pending,
      done: pending === 0,
    })
  },
}

interface CommitRowArgs {
  req: PayloadRequest
  row: CommitRow
  batchId: number
  targetId: number
  /** Whether a class may hang off the target itself — `Events.region` is a city or a venue. */
  targetLevel: Region['level']
  uploaderName: string
  tree: EventImportProposedRegions
  regions: Awaited<ReturnType<typeof ensureProposedRegions>>
  coordinators: Awaited<ReturnType<typeof ensureCoordinators>>
}

/**
 * Write one row's class, or record why it cannot be written.
 *
 * Returns whether a class was created. A refusal is written onto the row rather
 * than thrown, so one bad row costs its own line and not the rest of the chunk.
 */
async function commitRow({
  req,
  row,
  batchId,
  targetId,
  targetLevel,
  uploaderName,
  tree,
  regions,
  coordinators,
}: CommitRowArgs): Promise<boolean> {
  const region = regionForRow(row, { targetId, targetLevel, tree, regions })
  if (typeof region !== 'number') {
    refuseRow(row, region.error)
    return false
  }

  // ⚠ **Narrowed here, not trusted.** `resolved.timezone` is a bare string in
  // the column (`EventImports.ts`) and `firstDate_tz` is a 581-member enum, so a
  // zone dropped from the enum since the resolve would otherwise be refused by
  // Postgres, against a column name rather than against this line.
  if (!isSupportedTimezone(row.resolved?.timezone ?? '')) {
    refuseRow(row, 'this row’s timezone is no longer one we support — resolve it again')
    return false
  }

  const email = managerKeyOf(row.values ?? {})
  const refusal = email ? coordinators.refusals.get(email) : undefined
  if (refusal) {
    refuseRow(row, refusal)
    return false
  }
  const managerId = email ? (coordinators.ids.get(email) ?? null) : null

  const prepared = eventCreateData({
    values: row.values ?? {},
    resolved: row.resolved as ResolvedRow,
    regionId: region,
    managerId,
  })
  if (!prepared.ok) {
    refuseRow(row, ...prepared.errors)
    return false
  }

  let created
  try {
    created = await req.payload.create({
      collection: 'events',
      data: prepared.data as never,
      context: prepared.context,
      overrideAccess: true,
      depth: 0,
      req,
    })
    row.committed = { eventId: created.id }
  } catch (error) {
    const fields = validationFieldErrors(error)
    if (fields?.length) refuseRow(row, ...describeValidationErrors(fields))
    else {
      req.payload.logger.error(
        { err: error, batch: batchId, line: row.line },
        'Event import row could not be created',
      )
      refuseRow(row, 'this class could not be created')
    }
    return false
  }

  await recordProvenance({ req, event: created, batchId, line: row.line, uploaderName })
  return true
}

type RegionChoice = number | { error: string }

/**
 * Which region this row's class is filed under, or why none can be.
 *
 * ⚠ **A `pending` placement is a node's failure reaching the rows that needed
 * it.** `ensureProposedRegions` explained it once per node; this is where the
 * volunteer reads it, against the line they can fix.
 *
 * ⚠ **A country or state target cannot hold a class itself.** `Events.region` is
 * a city or a venue, so a row the proposal placed in no node would otherwise be
 * refused by that field's own validator — naming a row id rather than the line.
 */
function regionForRow(
  row: CommitRow,
  args: Pick<CommitRowArgs, 'targetId' | 'targetLevel' | 'tree' | 'regions'>,
): RegionChoice {
  const { targetId, targetLevel, tree, regions } = args
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
  return targetLevel === 'city' || targetLevel === 'venue'
    ? targetId
    : { error: 'this row belongs to no proposed city — propose the batch again' }
}

/**
 * Name who imported the class, on the class.
 *
 * The batch is hard-deleted the moment the commit finishes, so this entry is the
 * whole provenance record (`EventImports.ts`). A failure to write it is logged
 * and swallowed: the class exists either way, and refusing the row afterwards
 * would report a class that was created as one that was not.
 */
async function recordProvenance(args: {
  req: PayloadRequest
  /** The class as its create returned it, which already carries its log. */
  event: { id: number; activityLog?: unknown }
  batchId: number
  line: number
  uploaderName: string
}): Promise<void> {
  const { req, event, batchId, line, uploaderName } = args
  const entry = importLogEntry({ batchId, line, uploaderName, at: new Date().toISOString() })

  try {
    await updateEventBookkeeping({
      payload: req.payload,
      id: event.id,
      // Appended to what the create returned: an adopted class already carries
      // the verification entry `syncVerificationOnSave` wrote, and replacing the
      // log would delete it.
      data: { activityLog: appendLogEntry(asLog(event.activityLog), entry) },
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
 * volunteer whose file it is. The slug falls back to the id so a deleted account
 * degrades to a number rather than blanking the line.
 */
async function nameOfUploader(req: PayloadRequest, uploaderId: number | null): Promise<string> {
  if (uploaderId === null) return 'Bulk import'
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
  return manager?.name?.trim() || `#${uploaderId}`
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

interface Tally {
  total: number
  committed: number
  duplicates: number
  errors: number
}

/** What the commit banner counts, recomputed from the rows rather than tracked. */
function tally(rows: readonly CommitRow[]): Tally {
  return {
    total: rows.length,
    committed: rows.filter((row) => row.committed).length,
    duplicates: rows.filter((row) => row.duplicate).length,
    errors: rows.filter((row) => row.errors?.length).length,
  }
}
