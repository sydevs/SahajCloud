/**
 * Minimum expected database counts per import script.
 *
 * Verification passes if actual >= expected, so several importers may
 * contribute to one collection.
 */

import type { CollectionMetadata, ScriptMetadata } from './pagination'
import type { CollectionSlug, Where } from 'payload'

import { getDefaultBatchSize } from './pagination'

/** One collection to count for a script, and the filter its floor is stated under. */
export interface CountTarget {
  collection: CollectionSlug
  where?: Where
}

export type ScriptName = 'file-transcripts' | 'translations' | 'preview-fixture'

export interface ExpectedCounts {
  [collection: string]: number
}

/**
 * A script that can state no database floor at all.
 *
 * `ExpectedCounts` can only express one claim — `actual >= expected` — so a
 * script whose floor depends on the target environment used to declare `{}`.
 * That verified nothing while reporting exactly like a script that verified
 * and passed. Declaring the reason instead keeps the two apart.
 */
export interface NotApplicableCounts {
  kind: 'not-applicable'
  reason: string
}

export type ScriptExpectation = ExpectedCounts | NotApplicableCounts

export function isNotApplicable(
  expectation: ScriptExpectation,
): expectation is NotApplicableCounts {
  return 'kind' in expectation && expectation.kind === 'not-applicable'
}

/** Minimum expected counts per script. */
export const EXPECTED_COUNTS: Record<ScriptName, ScriptExpectation> = {
  'preview-fixture': {
    managers: 2,
    regions: 3,
    forms: 1,
    events: 2,
    users: 6,
    // ⚠ **One, not thirteen, and the reason is the `countWhere` below.**
    // `getCountTargets` counts this collection *under* that filter, so the floor
    // is the number of rows it matches — a `pending` registration — and not the
    // fixture's 13 rows. Stated as 13 it could never pass, and the fixture's
    // whole run would report as failed verification.
    'user-submissions': 1,
  },
  'file-transcripts': {
    kind: 'not-applicable',
    reason: 'queues runs for whichever files the target holds without a transcript',
  },
  translations: {
    kind: 'not-applicable',
    reason: 'targets three translation globals, so no collection gains a row',
  },
}

/**
 * Get a script's collection floors. A script that can state none answers with
 * no floors — read `EXPECTED_COUNTS` directly, or `verifyCountsForScript`'s
 * `skippedReason`, to tell that apart from a script that simply has none.
 */
export function getExpectedCounts(script: ScriptName): ExpectedCounts {
  const expectation = EXPECTED_COUNTS[script]
  if (!expectation || isNotApplicable(expectation)) return {}
  return expectation
}

export interface VerificationResult {
  collection: string
  actual: number
  expected: number
  passed: boolean
}

export function verifyCountsForScript(
  script: ScriptName,
  actualCounts: Record<string, number>,
  pagination?: { collection?: string; offset: number; limit: number },
): { results: VerificationResult[]; allPassed: boolean; skippedReason?: string } {
  const expectation = EXPECTED_COUNTS[script]
  if (expectation && isNotApplicable(expectation)) {
    return { results: [], allPassed: true, skippedReason: expectation.reason }
  }

  const expected = getExpectedCounts(script)
  const results: VerificationResult[] = []
  let allPassed = true

  for (const [collection, expectedCount] of Object.entries(expected)) {
    const actual = actualCounts[collection] || 0

    let adjustedExpected = expectedCount
    if (pagination?.collection === collection && pagination.limit > 0) {
      adjustedExpected = Math.min(pagination.offset + pagination.limit, expectedCount)
    }

    const passed = actual >= adjustedExpected
    results.push({ collection, actual, expected: adjustedExpected, passed })
    if (!passed) allPassed = false
  }

  return { results, allPassed }
}

// --- Collection metadata for pagination ---

/**
 * Collection metadata per script (in dependency order)
 * Used by CLI to orchestrate paginated imports
 */
const COLLECTION_METADATA: Record<ScriptName, CollectionMetadata[]> = {
  'preview-fixture': [
    {
      slug: 'managers',
      collection: 'managers',
      totalItems: 2,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'email',
    },
    {
      slug: 'regions',
      collection: 'regions',
      totalItems: 3,
      requiresPagination: false,
      dependencies: ['managers'],
      naturalKey: 'mapboxId',
    },
    {
      slug: 'forms',
      collection: 'forms',
      totalItems: 1,
      requiresPagination: false,
      dependencies: ['managers'],
      naturalKey: 'title',
    },
    {
      slug: 'events',
      collection: 'events',
      totalItems: 2,
      requiresPagination: false,
      dependencies: ['managers', 'regions'],
      naturalKey: 'title',
    },
    {
      slug: 'users',
      collection: 'users',
      totalItems: 6,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'email',
    },
    {
      slug: 'user-submissions',
      collection: 'user-submissions',
      // ⚠ The one floor a count cannot state. A registration can only REACH
      // `pending` by a second update pass, and delivery runs on `pending` and
      // `failed` rows — so the whole-table count would stay met while the
      // status a reviewer most needs to see had been written away.
      countWhere: {
        and: [{ status: { equals: 'pending' } }, { type: { equals: 'registration' } }],
      },
      totalItems: 13,
      requiresPagination: false,
      dependencies: ['events', 'users', 'forms'],
      naturalKey: 'uuid',
    },
  ],
  // One query and one create per file missing a transcript; nothing to page.
  'file-transcripts': [],
  // The empty array tells the runner there are no per-collection pagination
  // buckets or dependencies — the importer runs once, in bulk. `translations`
  // targets three PayloadCMS globals, not collections.
  translations: [],
}

export function getScriptMetadata(script: ScriptName): ScriptMetadata {
  const collections = COLLECTION_METADATA[script] || []
  const totalItems = collections.reduce((sum, c) => sum + c.totalItems, 0)
  const requiresPagination = collections.some((c) => c.requiresPagination)

  const hasFileUploads = collections.some((c) => c.hasFileUploads)

  const collectionBatchSizes = collections
    .filter((c) => c.batchSize !== undefined)
    .map((c) => c.batchSize!)
  const recommendedBatchSize =
    collectionBatchSizes.length > 0
      ? Math.min(...collectionBatchSizes)
      : getDefaultBatchSize(hasFileUploads)

  return {
    collections,
    totalItems,
    requiresPagination,
    recommendedBatchSize,
  }
}

/**
 * What a script's row counts are read from, in import order: one collection
 * each, with the filter a step declares. This is the one definition of that
 * list — `getDatabaseCounts` in the seed route derives from it, so a
 * collection added here is counted and verified without a second edit. A
 * `wemeditate` floor sat unread for exactly that reason: `lectures` was
 * expected and never counted, so every run reported verification failed on 0
 * of 40.
 */
export function getCountTargets(script: ScriptName): CountTarget[] {
  const steps = COLLECTION_METADATA[script] || []
  return steps.flatMap((step) =>
    step.collection ? [{ collection: step.collection, where: step.countWhere }] : [],
  )
}

export function getCollectionMetadata(
  script: ScriptName,
  collectionSlug: string,
): CollectionMetadata | undefined {
  const collections = COLLECTION_METADATA[script] || []
  return collections.find((c) => c.slug === collectionSlug)
}
