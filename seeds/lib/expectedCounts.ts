/**
 * Expected Counts Configuration
 *
 * Minimum expected database counts for each import script.
 * Used to verify imports completed successfully.
 *
 * Verification passes if actual >= expected (allows multiple
 * importers to contribute to the same collections).
 */

import type { CollectionMetadata, ScriptMetadata } from './pagination'

import { getDefaultBatchSize, getEnvironment } from './pagination'

export type ScriptName =
  | 'tags'
  | 'wemeditate'
  | 'meditations'
  | 'storyblok'
  | 'wm-app-translations'

export interface ExpectedCounts {
  [collection: string]: number
}

/**
 * Minimum expected counts per script.
 *
 * Sources:
 * - tags: Hardcoded in TagsImporter (27 meditation + 7 song)
 * - wemeditate: seeds/wemeditate/data.json counts
 * - meditations: seeds/meditations/data.json counts
 * - storyblok: Based on current Storyblok content
 *
 * Note: Image tags are now inline enum select values on the Images collection,
 * so they don't have expected counts anymore.
 */
export const EXPECTED_COUNTS: Record<ScriptName, ExpectedCounts> = {
  tags: {
    'user-choices': 27,
    'song-tags': 7,
  },
  wemeditate: {
    authors: 18,
    albums: 8,
    songs: 27,
    pages: 60,
    // Counted from seeds/wemeditate/data.json: 161 vimeo block occurrences,
    // 40 unique vimeo IDs (after dedup across page translations). Each
    // unique vimeo_id seeds one Lecture.
    lectures: 40,
  },
  meditations: {
    narrators: 2,
    meditations: 73,
    frames: 60,
  },
  storyblok: {
    lessons: 17,
  },
  // wm-app-translations updates a single PayloadCMS global, not collections.
  // No collection counts apply — verification is intentionally a no-op.
  'wm-app-translations': {},
}

/**
 * Get expected counts for a script
 */
export function getExpectedCounts(script: ScriptName): ExpectedCounts {
  return EXPECTED_COUNTS[script] || {}
}

/**
 * Verify actual counts against expected minimums
 */
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
): { results: VerificationResult[]; allPassed: boolean } {
  const expected = EXPECTED_COUNTS[script]
  const results: VerificationResult[] = []
  let allPassed = true

  for (const [collection, expectedCount] of Object.entries(expected)) {
    const actual = actualCounts[collection] || 0

    // Adjust expected count for paginated collection
    let adjustedExpected = expectedCount
    if (pagination?.collection === collection && pagination.limit > 0) {
      // Expected = min(offset + limit, total_expected)
      adjustedExpected = Math.min(pagination.offset + pagination.limit, expectedCount)
    }

    const passed = actual >= adjustedExpected
    results.push({ collection, actual, expected: adjustedExpected, passed })
    if (!passed) allPassed = false
  }

  return { results, allPassed }
}

// ============================================================================
// COLLECTION METADATA FOR PAGINATION
// ============================================================================

/**
 * Threshold for when a collection should be paginated
 * Collections larger than this will require multiple requests on Workers
 */
const PAGINATION_THRESHOLD = 50

/**
 * Collection metadata per script (in dependency order)
 * Used by CLI to orchestrate paginated imports
 */
const COLLECTION_METADATA: Record<ScriptName, CollectionMetadata[]> = {
  tags: [
    {
      slug: 'user-choices',
      totalItems: 27,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // SVG icons
    },
    {
      slug: 'song-tags',
      totalItems: 7,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // SVG icons
    },
    // Note: image-tags removed - now inline enum select values on Images collection
  ],
  wemeditate: [
    {
      slug: 'authors',
      totalItems: 18,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Author images
    },
    {
      slug: 'albums',
      totalItems: 8,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Album artwork
    },
    {
      slug: 'songs',
      totalItems: 27,
      requiresPagination: false,
      dependencies: ['albums'],
      naturalKey: 'slug',
      hasFileUploads: true, // Audio files
    },
    {
      slug: 'pages',
      totalItems: 60,
      requiresPagination: true, // Large collection
      dependencies: ['authors'],
      naturalKey: 'slug',
      hasFileUploads: true, // Media in content
      batchSize: 1, // Pages have many embedded images, use 1 to avoid D1 rate limits
    },
    {
      // 40 unique vimeo_ids in data.json — one Lecture per ID. The
      // populateFromNirmalaVidya hook fires on create and hits the NV API
      // synchronously, so this batch implicitly fans out to ~N HTTP calls.
      slug: 'lectures',
      totalItems: 40,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'nirmalVidyaVimeoUrl',
    },
  ],
  meditations: [
    {
      slug: 'narrators',
      totalItems: 2,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
    },
    {
      slug: 'frames',
      totalItems: 60,
      requiresPagination: true, // Large collection with uploads
      dependencies: [],
      naturalKey: 'filename',
      hasFileUploads: true, // Frame images/videos
    },
    {
      slug: 'meditations',
      totalItems: 73,
      requiresPagination: true, // Large collection with uploads
      dependencies: ['narrators', 'frames', 'user-choices', 'song-tags'],
      naturalKey: 'slug',
      hasFileUploads: true, // Audio files
    },
  ],
  storyblok: [
    {
      slug: 'lessons',
      totalItems: 17,
      requiresPagination: true, // For consistency, even though small
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Panel images, audio
    },
    {
      // Storyblok currently carries 0 video stories in source. Code path is
      // wired but unexercised; promote to >0 once editorial adds DD_Main_video
      // blocks. Natural key matches lecture upserts (Vimeo URL).
      slug: 'lectures',
      totalItems: 0,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'nirmalVidyaVimeoUrl',
    },
  ],
  // wm-app-translations targets the PayloadCMS global of the same slug, not
  // a collection. The empty array tells the runner there are no per-collection
  // pagination buckets or dependencies — the importer runs once, in bulk.
  'wm-app-translations': [],
}

/**
 * Get metadata for a script including pagination info
 */
export function getScriptMetadata(script: ScriptName): ScriptMetadata {
  const collections = COLLECTION_METADATA[script] || []
  const totalItems = collections.reduce((sum, c) => sum + c.totalItems, 0)
  const requiresPagination = collections.some((c) => c.requiresPagination)

  // Check if any collection has file uploads for batch size calculation
  const hasFileUploads = collections.some((c) => c.hasFileUploads)

  // Use minimum batch size from collections with explicit batchSize, or fall back to default
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
    environment: getEnvironment(),
    recommendedBatchSize,
  }
}

/**
 * Get metadata for a specific collection within a script
 */
export function getCollectionMetadata(
  script: ScriptName,
  collectionSlug: string,
): CollectionMetadata | undefined {
  const collections = COLLECTION_METADATA[script] || []
  return collections.find((c) => c.slug === collectionSlug)
}
