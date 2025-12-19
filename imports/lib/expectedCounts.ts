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

export type ScriptName = 'tags' | 'wemeditate' | 'meditations' | 'storyblok'

export interface ExpectedCounts {
  [collection: string]: number
}

/**
 * Minimum expected counts per script.
 *
 * Sources:
 * - tags: Hardcoded in TagsImporter (27 meditation + 7 music)
 * - wemeditate: imports/wemeditate/data.json counts
 * - meditations: imports/meditations/data.json counts
 * - storyblok: Based on current Storyblok content
 */
export const EXPECTED_COUNTS: Record<ScriptName, ExpectedCounts> = {
  tags: {
    'meditation-tags': 27,
    'music-tags': 7,
  },
  wemeditate: {
    authors: 18,
    albums: 8,
    music: 27,
    pages: 60,
  },
  meditations: {
    meditations: 73,
    frames: 60,
  },
  storyblok: {
    lessons: 17,
    lectures: 0,
  },
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
): { results: VerificationResult[]; allPassed: boolean } {
  const expected = EXPECTED_COUNTS[script]
  const results: VerificationResult[] = []
  let allPassed = true

  for (const [collection, expectedCount] of Object.entries(expected)) {
    const actual = actualCounts[collection] || 0
    const passed = actual >= expectedCount
    results.push({ collection, actual, expected: expectedCount, passed })
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
      slug: 'meditation-tags',
      totalItems: 27,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // SVG icons
    },
    {
      slug: 'music-tags',
      totalItems: 7,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // SVG icons
    },
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
      slug: 'music',
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
      dependencies: ['narrators', 'frames', 'meditation-tags', 'music-tags'],
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
      slug: 'lectures',
      totalItems: 0,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
    },
  ],
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

  return {
    collections,
    totalItems,
    requiresPagination,
    environment: getEnvironment(),
    recommendedBatchSize: getDefaultBatchSize(hasFileUploads),
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
