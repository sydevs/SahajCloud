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

/** The ids of each media collection that some stored document still points at. */
type ReferencedIds = Record<'files' | 'images', Set<number>>

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

/**
 * Generic helper for processing items (delete or trash) with consistent logging and error handling.
 *
 * @param config.req - Payload request object
 * @param config.collection - Target collection ('files' or 'images')
 * @param config.docs - Documents to process
 * @param config.operation - 'delete' for permanent deletion, 'trash' for soft delete
 * @param config.result - CleanupResult object to update counters
 * @param config.resultKey - Which counter to increment on success
 * @param config.maxItemsToProcess - Maximum number of items to process (for early exit optimization)
 * @param config.dryRun - Count and log the operation without performing it
 */
interface ProcessItemsConfig<
  T extends { id: number; filename?: string | null; createdAt?: string },
> {
  req: PayloadRequest
  collection: 'files' | 'images'
  docs: T[]
  operation: 'delete' | 'trash'
  result: CleanupResult
  resultKey: keyof CleanupResult
  maxItemsToProcess?: number
  dryRun?: boolean
}

async function processItems<T extends { id: number; filename?: string | null; createdAt?: string }>(
  config: ProcessItemsConfig<T>,
): Promise<void> {
  const { req, collection, docs, operation, result, resultKey, maxItemsToProcess, dryRun } = config
  const itemType = collection === 'files' ? 'file' : 'image'
  const idKey = collection === 'files' ? 'fileId' : 'imageId'

  let processedCount = 0

  for (const doc of docs) {
    // Early exit if we've reached the maximum number of items to process
    if (maxItemsToProcess !== undefined && processedCount >= maxItemsToProcess) {
      break
    }

    try {
      if (operation === 'delete') {
        if (!dryRun) {
          // Permanent deletion: trash: true required so delete() can find trashed documents
          await req.payload.delete({
            collection,
            id: doc.id,
            trash: true,
          })
        }
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: dryRun
            ? `Would permanently delete trashed ${itemType}`
            : `Permanently deleted trashed ${itemType}`,
          [idKey]: doc.id,
          filename: doc.filename,
          dryRun: dryRun === true,
        })
      } else {
        if (!dryRun) {
          // Soft delete: set deletedAt to move to trash
          await req.payload.update({
            collection,
            id: doc.id,
            data: {
              deletedAt: new Date().toISOString(),
            },
          })
        }
        ;(result[resultKey] as number)++
        processedCount++
        req.payload.logger.info({
          msg: dryRun
            ? `Would move orphaned ${itemType} to trash`
            : `Moved orphaned ${itemType} to trash`,
          [idKey]: doc.id,
          filename: doc.filename,
          createdAt: doc.createdAt,
          dryRun: dryRun === true,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const actionMsg = operation === 'delete' ? 'permanently delete trashed' : 'trash orphaned'
      req.payload.logger.error({
        msg: `Failed to ${actionMsg} ${itemType}`,
        [idKey]: doc.id,
        error: errorMessage,
      })
      result.errors++
    }
  }
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

  const expiredTrash = {
    and: [{ deletedAt: { exists: true } }, { deletedAt: { less_than: trashCutoff.toISOString() } }],
  }

  const maxFilesToProcess = Math.floor(maxOperations / 2)
  const deletableFiles = await collectDeletableTrash({
    req,
    collection: 'files',
    where: expiredTrash,
    referenced: referenced.files,
    wanted: maxFilesToProcess,
    result,
  })

  await processItems({
    req,
    collection: 'files',
    docs: deletableFiles,
    operation: 'delete',
    result,
    resultKey: 'permanentlyDeletedFiles',
    maxItemsToProcess: maxFilesToProcess,
    dryRun,
  })

  const remainingOps = maxOperations - result.permanentlyDeletedFiles
  const deletableImages = await collectDeletableTrash({
    req,
    collection: 'images',
    where: expiredTrash,
    referenced: referenced.images,
    wanted: remainingOps,
    result,
  })

  await processItems({
    req,
    collection: 'images',
    docs: deletableImages,
    operation: 'delete',
    result,
    resultKey: 'permanentlyDeletedImages',
    maxItemsToProcess: remainingOps,
    dryRun,
  })

  req.payload.logger.info({
    msg: 'Phase A completed',
    permanentlyDeletedFiles: result.permanentlyDeletedFiles,
    permanentlyDeletedImages: result.permanentlyDeletedImages,
    skippedReferenced: result.skippedReferenced,
  })
}

/** A media row as every paging caller here reads it. */
type MediaDoc = { id: number; filename?: string | null; createdAt?: string; tags?: unknown }

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
  collection: 'files' | 'images'
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
      if (keep(doc)) {
        collected.push(doc)
      }
    }

    hasMore = found.hasNextPage
    page++
  }

  return collected
}

/**
 * Expired trash Phase A may delete: what nothing points at any more. Counts and
 * names what it holds back along the way, under `dryRun` too, so an operator
 * sees it first. That count is what this loop read, never the whole backlog.
 */
async function collectDeletableTrash(config: {
  req: PayloadRequest
  collection: 'files' | 'images'
  where: Where
  referenced: Set<number>
  wanted: number
  result: CleanupResult
}): Promise<MediaDoc[]> {
  const { req, collection, where, referenced, wanted, result } = config

  return collectPaged({
    req,
    collection,
    where,
    // `trash: true` is what includes soft-deleted documents in the results.
    trash: true,
    wanted,
    keep: (doc) => {
      if (!referenced.has(doc.id)) {
        return true
      }
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

  const { files: referencedFiles, images: referencedImages } = referenced

  const inScanWindow: Where = {
    and: [
      { createdAt: { greater_than_equal: rangeStart.toISOString() } },
      { createdAt: { less_than: rangeEnd.toISOString() } },
      { deletedAt: { exists: false } }, // Not already in trash
    ],
  }

  const maxFilesToProcess = Math.floor(maxOperations / 2)
  const orphanFiles = await collectPaged({
    req,
    collection: 'files',
    where: inScanWindow,
    wanted: maxFilesToProcess,
    keep: (file) => !referencedFiles.has(file.id),
  })

  await processItems({
    req,
    collection: 'files',
    docs: orphanFiles,
    operation: 'trash',
    result,
    resultKey: 'trashedFiles',
    maxItemsToProcess: maxFilesToProcess,
    dryRun,
  })

  const maxImagesToProcess = maxOperations - result.trashedFiles
  const orphanImages = await collectPaged({
    req,
    collection: 'images',
    where: inScanWindow,
    depth: 1, // Include tag objects to check titles
    wanted: maxImagesToProcess,
    keep: (image) => {
      if (referencedImages.has(image.id)) {
        return false
      }

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
  })

  await processItems({
    req,
    collection: 'images',
    docs: orphanImages,
    operation: 'trash',
    result,
    resultKey: 'trashedImages',
    maxItemsToProcess: maxImagesToProcess,
    dryRun,
  })

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
  targetCollection: 'files' | 'images',
): Promise<Set<number>> {
  const referencedIds = new Set<number>()

  // Discover all field references to the target collection
  const references = discoverReferencesForCollection(payload, targetCollection)

  // Log discovered references for debugging
  payload.logger.info({
    msg: `Discovered ${references.length} field references to ${targetCollection}`,
    references: references.map((r) => ({
      collection: r.collection,
      fieldPath: r.fieldPath,
      isLexicalBlock: r.isLexicalBlock,
    })),
  })

  // Separate regular field references from Lexical (richText) references
  const regularReferences = references.filter((r) => !r.isLexicalBlock)
  const lexicalReferences = references.filter((r) => r.isLexicalBlock)

  // Group regular references by source collection for efficient scanning
  const byCollection = groupByCollection(regularReferences)

  // Scan regular field references
  for (const [collectionSlug, collectionRefs] of byCollection) {
    await scanCollectionForReferences(
      payload,
      collectionSlug,
      collectionRefs,
      referencedIds,
      targetCollection,
    )
  }

  // Scan Lexical content for block references
  // Each lexical reference represents a richText field that may contain blocks
  const lexicalByCollection = groupByCollection(lexicalReferences)
  for (const [collectionSlug, collectionRefs] of lexicalByCollection) {
    for (const ref of collectionRefs) {
      await scanCollectionForLexicalReferences(
        payload,
        collectionSlug,
        ref,
        referencedIds,
        targetCollection,
      )
    }
  }

  return referencedIds
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

/** Scan a collection for references using discovered field paths. */
async function scanCollectionForReferences(
  payload: Payload,
  collectionSlug: string,
  references: FieldReference[],
  referencedIds: Set<number>,
  targetCollection: string,
): Promise<void> {
  await forEachStoredDoc(
    payload,
    collectionSlug,
    references.map((ref) => ref.fieldPath),
    (doc) => {
      for (const ref of references) {
        for (const id of extractIdsFromDocument(doc, ref, targetCollection)) referencedIds.add(id)
      }
    },
  )
}

/**
 * Scan a collection's Lexical content for block references.
 * Uses generic Lexical traversal to find all upload/relationship IDs.
 */
async function scanCollectionForLexicalReferences(
  payload: Payload,
  collectionSlug: string,
  reference: FieldReference,
  referencedIds: Set<number>,
  targetCollection: string,
): Promise<void> {
  await forEachStoredDoc(payload, collectionSlug, [reference.fieldPath], (doc) => {
    // The read addresses the field by its whole path as one key, so a
    // localized rich text is marked at the first segment or unreachable.
    for (const content of localeValues(
      doc[reference.fieldPath],
      reference.localizedAt.includes(0),
    )) {
      for (const id of extractIdsFromLexicalContent(content, reference, targetCollection)) {
        referencedIds.add(id)
      }
    }
  })
}
