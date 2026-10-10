/**
 * The one place a batch's `status` may change, and the one place a reviewer's
 * edits are checked.
 *
 * ⚠ **`status` carries only `admin.readOnly`, so this hook is the whole gate.**
 * The uploader holds document-level `update` through the `manager` field
 * (`EventImports.ts`), and `WorkflowActions` submits a status override as an
 * ordinary `PATCH` — so field access cannot tell the Commit button from a
 * volunteer naming `finished` by hand. Without this hook a batch could be moved
 * straight to `committing` with no tree, or back out of `finished`.
 *
 * ⚠ **The jobs are let through by `context`, never by their status.** A job
 * writes `progress`, `rows`, `report` and the terminal status, which is exactly
 * what the table below refuses to a caller — and it runs with no `req.user`, so
 * there is nobody for a permission check to pass. `EVENT_IMPORT_JOB` is the
 * marker, set only in `jobWriteContext`.
 *
 * ⚠ **The `events: create` permission is asked again at the commit, not
 * inferred from the upload.** A manager's roles are per-locale (#701) and may
 * have been revoked between the upload and the review, which can be days. The
 * job that follows trusts the document, so this is the last gate the commit has.
 *
 * ⚠ **A re-upload is the only way back to `resolving`.** `parseUpload` has
 * already replaced `rows` by the time this runs, so letting the status move
 * without a file would re-run the resolve job over rows it already answered and
 * publish a review nobody asked for.
 */

import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import type { EventImport, EventImportProposedRegions, EventImportRows } from '@/payload-types'
import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

import { EVENT_IMPORT_JOB } from '../jobContext'
import { isUnchanged, refuseRowEdits, refuseTreeEdits } from './reviewerEdits'

type ImportStatus = NonNullable<EventImport['status']>

/**
 * Which statuses a caller may move a batch to, from each status.
 *
 * `finished` is absent as a source: it is the record of what happened, and the
 * sweep is what removes it. So is `discarded`, for the same reason.
 *
 * ⚠ **`discarded` is reachable from a status a job holds, and that is the only
 * way out of a stuck batch.** A worker killed mid-run — a deploy, an OOM —
 * leaves its job row claimed, so nothing re-runs it and the batch would
 * otherwise read `resolving` forever with no discard, no retry and no
 * re-upload. The job's own terminal write re-reads the status first
 * (`jobContext.ts`), so a discard that lands mid-run wins.
 */
const ALLOWED: Partial<Record<ImportStatus, readonly ImportStatus[]>> = {
  resolving: ['discarded'],
  committing: ['discarded'],
  review: ['committing', 'resolving', 'discarded'],
  failed: ['committing', 'resolving', 'discarded'],
}

/** Where a corrected file may be uploaded: a batch no job is working. */
const REUPLOADABLE: readonly ImportStatus[] = ['review', 'failed']

export const transitionStatus: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (req.context?.[EVENT_IMPORT_JOB] === true) return data

  if (operation === 'create') {
    // `parseUpload` refuses a file with nothing usable in it, so an empty `rows`
    // here is a create that reached the collection some other way.
    const rows = (data.rows ?? []) as EventImportRows
    if (!rows.length) {
      throw refusal('file', 'An import needs a file with at least one usable row.')
    }
    return { ...data, status: 'resolving' satisfies ImportStatus }
  }

  const batch = originalDoc as EventImport
  const from = batch.status
  const to = (data.status ?? from) as ImportStatus

  // ⚠ **Checked against `from`, never against the move.** `parseUpload` asks for
  // `resolving`, so a file uploaded onto a batch already resolving is no
  // transition at all — the table below would wave it through, no job would be
  // queued (`enqueueImportJobs` keys on entering a status), and the job already
  // running would write its own stale rows over the corrected ones.
  if (req.file && !REUPLOADABLE.includes(from)) {
    throw refusal('file', `An import that is ${describe(from)} cannot take a new file.`)
  }

  if (to !== from) {
    if (!(ALLOWED[from] ?? []).includes(to)) {
      throw refusal('status', `An import that is ${describe(from)} cannot be ${describe(to)}.`)
    }
    if (to === 'resolving' && !req.file) {
      throw refusal('file', 'Upload a corrected file to resolve this import again.')
    }
    if (to === 'committing') await refuseUncommittable(batch, req)
  }

  // ⚠ **A re-upload's `rows` and `proposedRegions` are `parseUpload`'s, not the
  // caller's.** It has already replaced the one and cleared the other by the
  // time this runs, so checking them as a review's edits refuses every corrected
  // file — and `req.file` is the one thing that tells the two writes apart.
  if (req.file) return data

  // ⚠ **Compared, never tested for presence.** Payload back-fills an omitted
  // column into `data` before this hook runs, so every update carries both of
  // these whether the caller named them or not (`isUnchanged`).
  //
  // Edits are the review's whole purpose and nobody else's business: while a job
  // holds the batch its own writes come through `context`, and a finished or
  // discarded batch is a record.
  const closed = from !== 'review'
  const storedRows = (batch.rows ?? []) as EventImportRows

  if (!isUnchanged(storedRows, data.rows)) {
    if (closed) throw refusal('rows', `An import that is ${describe(from)} can no longer be edited.`)
    const refused = refuseRowEdits(storedRows, (data.rows ?? []) as EventImportRows)
    if (refused) throw refusal('rows', refused)
  }

  if (!isUnchanged(batch.proposedRegions, data.proposedRegions)) {
    if (closed) {
      throw refusal('proposedRegions', `An import that is ${describe(from)} can no longer be edited.`)
    }
    const stored = batch.proposedRegions
    if (!stored) throw refusal('proposedRegions', 'This import has proposed no regions yet.')
    // Clearing the tree is not an edit the review offers, and the comparison
    // below would dereference the absent side rather than refuse it.
    const submitted = data.proposedRegions as EventImportProposedRegions | null | undefined
    if (!submitted?.nodes) {
      throw refusal('proposedRegions', 'An import’s proposed regions cannot be cleared here.')
    }
    const refused = refuseTreeEdits(stored, submitted)
    if (refused) throw refusal('proposedRegions', refused)
  }

  return data
}

/**
 * Why this batch cannot be committed, as the button's own refusal.
 *
 * Each check answers a question the commit job cannot: it runs with no user, and
 * a tree it cannot walk would fail every row rather than the batch.
 */
async function refuseUncommittable(
  batch: EventImport,
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
): Promise<void> {
  const rows = (batch.rows ?? []) as EventImportRows
  if (rows.some((row) => !row.resolved && !row.errors?.length)) {
    throw refusal('status', 'Some rows have no address yet. Wait for the import to finish resolving.')
  }

  const tree = batch.proposedRegions
  if (!tree) throw refusal('status', 'This import has proposed no regions yet. Upload the file again.')

  const created = tree.nodes.filter((node) => node.match.kind === 'create')
  const unnamed = created.find((node) => !node.slug || !node.location)
  if (unnamed) {
    throw refusal(
      'status',
      `"${unnamed.name}" has no name or location to create it with. Map it onto an existing region, or upload the file again.`,
    )
  }

  // Per parent, because `Regions.slug` disambiguates against the whole
  // collection but a tree is what the commit walks — two siblings sharing a slug
  // would have one of them silently re-slugged after a reviewer approved it.
  const seen = new Set<string>()
  for (const node of created) {
    const key = `${node.parentKey ?? ''}/${node.slug}`
    if (seen.has(key)) {
      throw refusal('status', `Two proposed regions under the same parent are both called "${node.slug}".`)
    }
    seen.add(key)
  }

  // Last, because it is the only check that can pass at the upload and fail
  // here — and the reader should see a tree problem as a tree problem.
  const allowed = hasPermission(
    {
      user: req.user,
      collection: 'events',
      operation: 'create',
      // Roles are per-locale, so a check with no locale grants a non-admin
      // nothing (#665).
      locale: roleScopeFromLocale(req.locale),
    },
    bypassPermissions,
  )
  if (!allowed) {
    throw refusal('status', 'You are no longer allowed to create classes in this language.')
  }
}

/** The label the status select shows, so a refusal reads as the screen does. */
const LABELS: Record<ImportStatus, string> = {
  resolving: 'resolving addresses',
  review: 'ready for review',
  committing: 'creating classes',
  finished: 'finished',
  failed: 'failed',
  discarded: 'discarded',
}

function describe(status: ImportStatus): string {
  return LABELS[status] ?? status
}

function refusal(path: string, message: string): ValidationError {
  return new ValidationError({ errors: [{ path, message }] })
}
