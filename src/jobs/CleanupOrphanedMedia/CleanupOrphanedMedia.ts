import type { CollectionSlug, TaskConfig, Payload, PayloadRequest, Where } from 'payload'

import type { ImageTag } from '@/types/tags'

import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  localeValues,
  groupByCollection,
  type FieldReference,
} from './schemaUtils'

/** Maximum documents to fetch per page when scanning for references */
const PAGINATION_LIMIT = 1000

/**
 * Auto-generated orientation tags that should be ignored when determining orphan status.
 * These tags are added automatically via beforeChange hook on image upload.
 */
const ORIENTATION_TAG_TITLES = ['landscape', 'portrait', 'square']

/**
 * How long an item stays recoverable in the media trash before Phase A may
 * delete it for good.
 *
 * ⚠ Phase A had no age check at all, which is why this job sat off every
 * automatic queue (#878): a run could permanently delete an item an editor had
 * hand-trashed minutes earlier.
 *
 * ⚠ It must outlast the longest month, not match the cadence. Runs fall 28 to
 * 31 days apart, so at 30 days a run after any 31-day month found the previous
 * run's trash already past the cutoff and deleted it one run later — 7 runs in
 * 12. At 45, what one run trashes survives the next with two weeks to spare and
 * goes at the run after, 59 or more days on.
 */
const TRASH_RETENTION_DAYS = 45

/** The newest `deletedAt` Phase A may permanently delete. */
export function trashDeletionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS)
  return cutoff
}

/** Uploads younger than this are never judged orphans: they may not be linked yet. */
const GRACE_PERIOD_HOURS = 24

/**
 * How far back Phase B looks for orphans by `createdAt`.
 *
 * ⚠ Every run scans the whole span. It used to scan one of three one-month
 * bands — 0-1, 1-2 or 2-3 months old — picked by `month % 3`. The band and the
 * clock both advance a month per run, so they cancelled out: all three runs of a
 * quarter scanned the same calendar month (December, March, June, September),
 * and uploads from the other eight months were never scanned at all. The whole
 * span gives every upload the three checks the bands meant to, at 0-1, 1-2 and
 * 2-3 months old, and a missed run loses nothing because the next one overlaps
 * it.
 */
const SCAN_WINDOW_MONTHS = 3

/** The `createdAt` span Phase B scans when the caller gives none. */
export function orphanScanWindow(now: Date = new Date()): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = new Date(now)
  rangeStart.setMonth(rangeStart.getMonth() - SCAN_WINDOW_MONTHS)
  const rangeEnd = new Date(now)
  rangeEnd.setHours(rangeEnd.getHours() - GRACE_PERIOD_HOURS)
  return { rangeStart, rangeEnd }
}

type CleanupResult = {
  permanentlyDeletedFiles: number
  permanentlyDeletedImages: number
  trashedFiles: number
  trashedImages: number
  skippedImages: number
  /**
   * Expired trash Phase A kept because something still points at it, among the
   * rows it read while filling its delete budget — not the backlog. The paging
   * loop stops once it has `wanted` deletable rows, so what sits past that
   * point is never read, and a later run counts it instead.
   */
  skippedReferenced: number
  errors: number
}

/** The two collections this job sweeps. */
type MediaCollection = 'files' | 'images'

/** The ids of each media collection that some stored document still points at. */
type ReferencedIds = Record<MediaCollection, Set<number>>

/**
 * Cleanup job for orphaned media files.
 *
 * Two-phase cleanup:
 * - Phase A: Permanently delete items trashed longer ago than
 *   TRASH_RETENTION_DAYS and referenced by nothing
 * - Phase B: Move newly detected orphans to trash (soft delete)
 *
 * `dryRun` counts both phases without writing anything. It is how a run is
 * reviewed against real data before the next scheduled one acts on it.
 *
 * Orphan detection:
 * - Files: Any file not referenced by any document in any collection
 * - Images: Any image not referenced by any document AND has no content tags
 *   (auto-generated orientation tags like 'landscape', 'portrait', 'square' are ignored)
 *
 * References are auto-discovered via schema introspection - no hardcoded collection
 * or field knowledge required. Adding new collections with file/image references
 * requires no changes to this job.
 */
export const CleanupOrphanedMedia: TaskConfig<'cleanupOrphanedMedia'> = {
  retries: 2,
  label: 'Cleanup Orphaned Media',
  slug: 'cleanupOrphanedMedia',
  inputSchema: [
    // The cleanup span, normally `orphanScanWindow()`. Both together override
    // it; either alone is ignored. Only the integration spec passes them — a
    // run with a hand-picked span is a run that skips the uploads outside it,
    // so there is no reason to offer one half of it in the admin.
    // `inputSchema` types the input and nothing validates it at runtime, which
    // is why the handler tests both before it trusts either.
    { name: 'rangeStart', type: 'date', required: false },
    { name: 'rangeEnd', type: 'date', required: false },
    {
      name: 'maxOperations',
      type: 'number',
      required: false,
    },
    { name: 'dryRun', type: 'checkbox', required: false },
  ],
  outputSchema: [
    {
      name: 'permanentlyDeletedFiles',
      type: 'number',
      required: true,
    },
    {
      name: 'permanentlyDeletedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'trashedFiles',
      type: 'number',
      required: true,
    },
    {
      name: 'trashedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'skippedImages',
      type: 'number',
      required: true,
    },
    {
      name: 'skippedReferenced',
      type: 'number',
      required: true,
      admin: {
        description:
          'Expired trash kept because something still references it, among the rows Phase A read while filling its delete budget. Not a backlog total.',
      },
    },
    {
      name: 'errors',
      type: 'number',
      required: true,
    },
    // Without this a reader of a job row cannot tell whether the counts above
    // were performed or only counted.
    { name: 'dryRun', type: 'checkbox', required: true },
  ],
  schedule: [
    {
      cron: '0 0 1 * *', // 1st of month at 00:00 UTC
      queue: 'monthly',
    },
  ],
  handler: async ({ req, input }) => {
    const maxOperations = typeof input?.maxOperations === 'number' ? input.maxOperations : 500
    const dryRun = input?.dryRun === true
    const trashCutoff = trashDeletionCutoff()

    // A caller-supplied span overrides the default window. Both halves are
    // required together: one alone would silently pair a chosen bound with a
    // derived one, which is a third range nobody asked for.
    const explicitRange =
      input?.rangeStart && input?.rangeEnd
        ? { rangeStart: new Date(input.rangeStart), rangeEnd: new Date(input.rangeEnd) }
        : undefined
    const { rangeStart, rangeEnd } = explicitRange ?? orphanScanWindow()

    req.payload.logger.info({
      msg: 'Starting orphaned media cleanup',
      rangeLabel: explicitRange ? 'explicit-range' : `0-${SCAN_WINDOW_MONTHS}mo`,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      maxOperations,
      gracePeriodHours: GRACE_PERIOD_HOURS,
      trashCutoff: trashCutoff.toISOString(),
      dryRun,
    })

    const result: CleanupResult = {
      permanentlyDeletedFiles: 0,
      permanentlyDeletedImages: 0,
      trashedFiles: 0,
      trashedImages: 0,
      skippedImages: 0,
      skippedReferenced: 0,
      errors: 0,
    }

    try {
      // Both phases read the same sets, and the scan walks every collection, so
      // it runs once here rather than once per phase.
      const referenced: ReferencedIds = {
        files: await getAllReferencedIds(req.payload, 'files'),
        images: await getAllReferencedIds(req.payload, 'images'),
      }
      req.payload.logger.info({
        msg: 'Reference scan completed',
        referencedFileCount: referenced.files.size,
        referencedImageCount: referenced.images.size,
      })

      // Phase A: Permanently delete items trashed before the retention cutoff
      await permanentlyDeleteTrashedItems(
        req,
        result,
        maxOperations,
        trashCutoff,
        dryRun,
        referenced,
      )

      // Phase B: Move newly detected orphans to trash
      const remainingOps = maxOperations - getTotalOperations(result)
      if (remainingOps > 0) {
        await trashOrphanedMedia(
          req,
          result,
          remainingOps,
          rangeStart,
          rangeEnd,
          dryRun,
          referenced,
        )
      }

      req.payload.logger.info({
        msg: 'Orphaned media cleanup completed',
        ...result,
        totalOperations: getTotalOperations(result),
        dryRun,
      })

      return {
        output: { ...result, dryRun },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: 'Error during orphaned media cleanup',
        error: errorMessage,
        ...result,
        dryRun,
      })
      throw error
    }
  },
}

function getTotalOperations(result: CleanupResult): number {
  return (
    result.permanentlyDeletedFiles +
    result.permanentlyDeletedImages +
    result.trashedFiles +
    result.trashedImages
  )
}

/** A media row as every paging caller here reads it. */
type MediaDoc = { id: number; filename?: string | null; createdAt?: string; tags?: unknown }

/**
 * Delete or trash every document handed over, and report what it managed.
 *
 * The caller bounds the work by collecting no more rows than it means to
 * spend, so there is no second limit here to disagree with that one.
 */
async function processItems(config: {
  req: PayloadRequest
  collection: MediaCollection
  docs: MediaDoc[]
  operation: 'delete' | 'trash'
  dryRun: boolean
}): Promise<{ processed: number; errors: number }> {
  const { req, collection, docs, operation, dryRun } = config
  const deleting = operation === 'delete'
  const itemType = collection === 'files' ? 'file' : 'image'
  const idKey = collection === 'files' ? 'fileId' : 'imageId'

  let processed = 0
  let errors = 0

  for (const doc of docs) {
    try {
      if (!dryRun) {
        await (deleting
          ? // `trash: true` is what lets delete() reach a soft-deleted document.
            req.payload.delete({ collection, id: doc.id, trash: true })
          : req.payload.update({
              collection,
              id: doc.id,
              data: { deletedAt: new Date().toISOString() },
            }))
      }
      processed++
      req.payload.logger.info({
        msg: deleting
          ? `${dryRun ? 'Would permanently delete' : 'Permanently deleted'} trashed ${itemType}`
          : `${dryRun ? 'Would move' : 'Moved'} orphaned ${itemType} to trash`,
        [idKey]: doc.id,
        filename: doc.filename,
        createdAt: doc.createdAt,
        dryRun,
      })
    } catch (error) {
      req.payload.logger.error({
        msg: `Failed to ${deleting ? 'permanently delete trashed' : 'trash orphaned'} ${itemType}`,
        [idKey]: doc.id,
        error: error instanceof Error ? error.message : String(error),
      })
      errors++
    }
  }

  return { processed, errors }
}

/**
 * Phase A: Permanently delete items trashed before the retention cutoff.
 *
 * ⚠ `exists: true` stays beside `less_than`. A null `deletedAt` compares false
 * either way in SQL, but losing the existence term would make the age the only
 * thing standing between a live document and a permanent delete.
 *
 * ⚠ Age alone was the whole test, so an item hand-trashed while a page still
 * showed it, or pointed at again by a restored version, went for good and left
 * the page showing nothing (#1118). A referenced item stays in the trash, and
 * whether to restore it is a person's call — it may have been trashed on purpose.
 */
async function permanentlyDeleteTrashedItems(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
  trashCutoff: Date,
  dryRun: boolean,
  referenced: ReferencedIds,
): Promise<void> {
  req.payload.logger.info({
    msg: 'Phase A: Permanently deleting trashed items',
    trashCutoff: trashCutoff.toISOString(),
  })

  const expiredTrash: Where = {
    and: [{ deletedAt: { exists: true } }, { deletedAt: { less_than: trashCutoff.toISOString() } }],
  }

  /**
   * Expired trash nothing points at any more. Names what it holds back as it
   * goes, under `dryRun` too, so an operator sees it first. That count is what
   * this loop read, never the whole backlog.
   */
  const deletable = (collection: MediaCollection, wanted: number) =>
    collectPaged({
      req,
      collection,
      where: expiredTrash,
      // `trash: true` is what includes soft-deleted documents in the results.
      trash: true,
      wanted,
      keep: (doc) => {
        if (!referenced[collection].has(doc.id)) return true
        result.skippedReferenced++
        req.payload.logger.info({
          msg: 'Kept trashed item: still referenced',
          collection,
          id: doc.id,
          filename: doc.filename,
        })
        return false
      },
    })

  // Files take half the budget, so an expired-trash backlog in one collection
  // cannot spend the whole run on itself.
  const files = await processItems({
    req,
    collection: 'files',
    docs: await deletable('files', Math.floor(maxOperations / 2)),
    operation: 'delete',
    dryRun,
  })
  const images = await processItems({
    req,
    collection: 'images',
    docs: await deletable('images', maxOperations - files.processed),
    operation: 'delete',
    dryRun,
  })

  result.permanentlyDeletedFiles = files.processed
  result.permanentlyDeletedImages = images.processed
  result.errors += files.errors + images.errors

  req.payload.logger.info({
    msg: 'Phase A completed',
    permanentlyDeletedFiles: result.permanentlyDeletedFiles,
    permanentlyDeletedImages: result.permanentlyDeletedImages,
    skippedReferenced: result.skippedReferenced,
  })
}

/**
 * Pages `collection` until `keep` has passed `wanted` rows, or the pages run
 * out. `keep` is also where a caller counts and logs what it rejected.
 *
 * ⚠ Pages rather than filtering one page it already holds. What `keep`
 * rejects it rejects on every later run too — a referenced id stays
 * referenced, a tagged image stays tagged — so a page's worth of them would
 * starve every operation behind them, in every run from then on. Lowering
 * `PAGINATION_LIMIT` instead only makes that starvation cheaper to reach.
 */
async function collectPaged(config: {
  req: PayloadRequest
  collection: MediaCollection
  where: Where
  depth?: number
  trash?: boolean
  wanted: number
  keep: (doc: MediaDoc) => boolean
}): Promise<MediaDoc[]> {
  const { req, collection, where, depth = 0, trash = false, wanted, keep } = config
  const collected: MediaDoc[] = []
  let page = 1
  let hasMore = true

  while (hasMore && collected.length < wanted) {
    const found = await req.payload.find({
      collection,
      where,
      limit: PAGINATION_LIMIT,
      page,
      depth,
      trash,
    })

    for (const doc of found.docs) {
      if (keep(doc)) collected.push(doc)
    }

    hasMore = found.hasNextPage
    page++
  }

  // A page is read whole, so the last one can pass more than the budget.
  return collected.slice(0, wanted)
}

/** Phase B: Move newly detected orphans to trash (soft delete) */
async function trashOrphanedMedia(
  req: PayloadRequest,
  result: CleanupResult,
  maxOperations: number,
  rangeStart: Date,
  rangeEnd: Date,
  dryRun: boolean,
  referenced: ReferencedIds,
): Promise<void> {
  req.payload.logger.info({ msg: 'Phase B: Trashing orphaned media' })

  const inScanWindow: Where = {
    and: [
      { createdAt: { greater_than_equal: rangeStart.toISOString() } },
      { createdAt: { less_than: rangeEnd.toISOString() } },
      { deletedAt: { exists: false } }, // Not already in trash
    ],
  }

  // Files take half the budget, so an orphan backlog in one collection cannot
  // spend the whole run on itself.
  const files = await processItems({
    req,
    collection: 'files',
    operation: 'trash',
    dryRun,
    docs: await collectPaged({
      req,
      collection: 'files',
      where: inScanWindow,
      wanted: Math.floor(maxOperations / 2),
      keep: (file) => !referenced.files.has(file.id),
    }),
  })

  const images = await processItems({
    req,
    collection: 'images',
    operation: 'trash',
    dryRun,
    docs: await collectPaged({
      req,
      collection: 'images',
      where: inScanWindow,
      depth: 1, // Include tag objects to check titles
      wanted: maxOperations - files.processed,
      keep: (image) => {
        if (referenced.images.has(image.id)) return false

        // Image tags are inline enum strings, not relationships. An orientation
        // tag is added by a hook on upload, so it says nothing about use.
        const hasContentTags =
          Array.isArray(image.tags) &&
          (image.tags as ImageTag[]).some(
            (tag) => typeof tag === 'string' && !ORIENTATION_TAG_TITLES.includes(tag),
          )
        if (hasContentTags) {
          result.skippedImages++
          return false
        }

        return true
      },
    }),
  })

  result.trashedFiles = files.processed
  result.trashedImages = images.processed
  result.errors += files.errors + images.errors

  req.payload.logger.info({
    msg: 'Phase B completed',
    trashedFiles: result.trashedFiles,
    trashedImages: result.trashedImages,
    skippedImages: result.skippedImages,
  })
}

/**
 * Get all IDs of a target collection that are referenced by any document.
 * Uses schema introspection to automatically discover all references.
 */
async function getAllReferencedIds(
  payload: Payload,
  targetCollection: MediaCollection,
): Promise<Set<number>> {
  const referencedIds = new Set<number>()
  const references = discoverReferencesForCollection(payload, targetCollection)

  payload.logger.info({
    msg: `Discovered ${references.length} field references to ${targetCollection}`,
    references: references.map((r) => ({
      collection: r.collection,
      fieldPath: r.fieldPath,
      isLexicalBlock: r.isLexicalBlock,
    })),
  })

  // One pass per source collection, whatever mix of references it holds. The
  // read is `locale: 'all'` over every stored copy and every latest version, so
  // a second pass for the same collection's rich text doubles the most
  // expensive read this job makes.
  for (const [collectionSlug, collectionRefs] of groupByCollection(references)) {
    await forEachStoredDoc(
      payload,
      collectionSlug,
      collectionRefs.map((ref) => ref.fieldPath),
      (doc) => {
        for (const ref of collectionRefs) {
          for (const id of idsFromStoredDoc(doc, ref, targetCollection)) referencedIds.add(id)
        }
      },
    )
  }

  return referencedIds
}

/** Every target id one discovered reference reaches in one stored document. */
function idsFromStoredDoc(
  doc: Record<string, unknown>,
  reference: FieldReference,
  targetCollection: string,
): Set<number> {
  if (!reference.isLexicalBlock) return extractIdsFromDocument(doc, reference, targetCollection)

  const ids = new Set<number>()
  // The read addresses the field by its whole path as one key, so a localized
  // rich text is marked at the first segment or unreachable.
  for (const content of localeValues(doc[reference.fieldPath], reference.localizedAt.includes(0))) {
    for (const id of extractIdsFromLexicalContent(content, reference, targetCollection)) {
      ids.add(id)
    }
  }
  return ids
}

/**
 * A Payload `select` naming the top level of each field path. The walker needs
 * the whole value under that root, and Payload selects a container wholesale.
 */
function selectRootsOf(fieldPaths: string[]): Record<string, true> {
  return Object.fromEntries(fieldPaths.map((path) => [path.split('.')[0], true]))
}

/**
 * Visit every stored copy of a collection's documents that can hold a
 * reference: each main row, trashed ones included, and — with drafts on — each
 * latest version, the only row a draft save writes. A reference held by either
 * alone would otherwise read as an orphan, and the job would trash a file in use.
 */
async function forEachStoredDoc(
  payload: Payload,
  collectionSlug: string,
  fieldPaths: string[],
  visit: (doc: Record<string, unknown>) => void,
): Promise<void> {
  const collection = collectionSlug as CollectionSlug
  const select = selectRootsOf(fieldPaths)
  const read = {
    collection,
    limit: PAGINATION_LIMIT,
    depth: 0,
    // A reference held only by a localized field is invisible to a
    // default-locale read, and an invisible reference reads as an orphan, so
    // the job trashes a file that is in use (#977).
    locale: 'all',
    trash: true,
  } as const
  const drafts = Boolean(payload.collections[collection]?.config.versions?.drafts)

  for (const versions of drafts ? [false, true] : [false]) {
    let page = 1
    let hasMore = true
    while (hasMore) {
      // `select`: `locale: 'all'` returns every translation of every field, and
      // a field `afterRead` hook runs once per locale, so a read of the whole
      // document costs what the untouched fields are worth times the locale count.
      const result = versions
        ? await payload.findVersions({
            ...read,
            page,
            select: { version: select },
            where: { latest: { equals: true } },
          })
        : await payload.find({ ...read, page, select })
      for (const doc of result.docs) {
        visit((versions ? (doc as { version: unknown }).version : doc) as Record<string, unknown>)
      }
      hasMore = result.hasNextPage
      page++
    }
  }
}
