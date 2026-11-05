/**
 * Minimum expected database counts per import script.
 *
 * Verification passes if actual >= expected, so several importers may
 * contribute to one collection.
 */

import type { CollectionMetadata, ScriptMetadata } from './pagination'
import type { CollectionSlug, Where } from 'payload'

import { activeRegistrationWhere } from '@/lib/registrations/active'

import { getDefaultBatchSize } from './pagination'

/** One collection to count for a script, and the filter its floor is stated under. */
export interface CountTarget {
  collection: CollectionSlug
  where?: Where
}

export type ScriptName =
  | 'tags'
  | 'wemeditate'
  | 'meditations'
  | 'meditation-transcripts'
  | 'storyblok'
  | 'wm-app-translations'
  | 'translations'
  | 'atlas'
  | 'atlas-reset'
  | 'preview-fixture'

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

/**
 * A script whose floors ride in its own uploaded data, because the data
 * changes with every refresh and a committed constant would drift. The
 * importer hands them over (`BaseImporter.getExpectedCounts`); a run that
 * carries none fails verification rather than passing with nothing checked.
 */
export interface FromDataCounts {
  kind: 'from-data'
  source: string
}

export type ScriptExpectation = ExpectedCounts | NotApplicableCounts | FromDataCounts

export function isNotApplicable(
  expectation: ScriptExpectation,
): expectation is NotApplicableCounts {
  return 'kind' in expectation && expectation.kind === 'not-applicable'
}

export function isFromData(expectation: ScriptExpectation): expectation is FromDataCounts {
  return 'kind' in expectation && expectation.kind === 'from-data'
}

/**
 * Minimum expected counts per script.
 *
 * Sources:
 * - tags: Hardcoded in TagsImporter (27 meditation + 7 song)
 * - wemeditate: seeds/wemeditate/data.json counts
 * - meditations: seeds/meditations/data.json counts
 * - storyblok: Based on current Storyblok content
 */
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
  'meditation-transcripts': {
    kind: 'not-applicable',
    // 122 in production, 0 on a fresh local database, so any single number
    // either fails locally or confirms nothing.
    reason:
      "the floor is however many of the library's recordings the target still carries unchanged",
  },
  storyblok: {
    lessons: 17,
  },
  'wm-app-translations': {
    kind: 'not-applicable',
    reason: 'targets the wm-app-translations global, so no collection gains a row',
  },
  translations: {
    kind: 'not-applicable',
    reason: 'targets three translation globals, so no collection gains a row',
  },
  // Derived from the data on every build (seeds/atlas/sync/counts.ts) and
  // uploaded in its manifest, so a refresh cannot leave a stale floor behind.
  // The importer hands them to `verifyCountsForScript` as an override.
  atlas: {
    kind: 'from-data',
    source: 'seeds/atlas/data/manifest.json (seeds/atlas/sync/counts.ts)',
  },
  'atlas-reset': {
    kind: 'not-applicable',
    reason: 'empties the atlas collections, so it has no floor — its own run checks they are empty',
  },
}

/**
 * Get a script's collection floors. A script that can state none answers with
 * no floors — read `EXPECTED_COUNTS` directly, or `verifyCountsForScript`'s
 * `skippedReason`, to tell that apart from a script that simply has none.
 */
export function getExpectedCounts(script: ScriptName): ExpectedCounts {
  const expectation = EXPECTED_COUNTS[script]
  if (!expectation || isNotApplicable(expectation) || isFromData(expectation)) return {}
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
  /** Floors the importer read from its data, replacing the committed ones. */
  override?: ExpectedCounts | null,
): { results: VerificationResult[]; allPassed: boolean; skippedReason?: string } {
  const expectation = EXPECTED_COUNTS[script]
  if (expectation && isNotApplicable(expectation)) {
    return { results: [], allPassed: true, skippedReason: expectation.reason }
  }
  if (expectation && isFromData(expectation) && !override) {
    // No floors arrived with the data, so nothing was checked: say so as a failure.
    return {
      results: [{ collection: expectation.source, actual: 0, expected: 1, passed: false }],
      allPassed: false,
    }
  }

  const expected = override ?? getExpectedCounts(script)
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
  tags: [
    {
      slug: 'user-choices',
      collection: 'user-choices',
      totalItems: 27,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // SVG icons
    },
    {
      slug: 'song-tags',
      collection: 'song-tags',
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
      collection: 'authors',
      totalItems: 18,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Author images
    },
    {
      slug: 'albums',
      collection: 'albums',
      totalItems: 8,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Album artwork
    },
    {
      slug: 'songs',
      collection: 'songs',
      totalItems: 27,
      requiresPagination: false,
      dependencies: ['albums'],
      naturalKey: 'slug',
      hasFileUploads: true, // Audio files
    },
    {
      slug: 'pages',
      collection: 'pages',
      totalItems: 60,
      requiresPagination: true, // Large collection
      dependencies: ['authors'],
      naturalKey: 'slug',
      hasFileUploads: true, // Media in content
      batchSize: 1, // Pages have many embedded images, use 1 for long-running imports
    },
    {
      // 40 unique vimeo_ids in data.json — one Lecture per ID. The
      // populateFromNirmalaVidya hook fires on create and hits the NV API
      // synchronously, so this batch implicitly fans out to ~N HTTP calls.
      slug: 'lectures',
      collection: 'lectures',
      totalItems: 40,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'nirmalVidyaVimeoUrl',
    },
  ],
  meditations: [
    {
      slug: 'narrators',
      collection: 'narrators',
      totalItems: 2,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'slug',
    },
    {
      slug: 'frames',
      collection: 'frames',
      totalItems: 60,
      requiresPagination: true, // Large collection with uploads
      dependencies: [],
      naturalKey: 'filename',
      hasFileUploads: true, // Frame images/videos
    },
    {
      slug: 'meditations',
      collection: 'meditations',
      totalItems: 73,
      requiresPagination: true, // Large collection with uploads
      dependencies: ['narrators', 'frames', 'user-choices', 'song-tags'],
      naturalKey: 'slug',
      hasFileUploads: true, // Audio files
    },
  ],
  'meditation-transcripts': [
    {
      slug: 'meditation-transcripts',
      totalItems: 126,
      // No uploads, and each row is one small insert. Pagination would also
      // re-upload the whole 1 MB data file on every batch.
      requiresPagination: false,
      dependencies: ['meditations'],
      naturalKey: 'meditation',
    },
  ],
  storyblok: [
    {
      slug: 'lessons',
      collection: 'lessons',
      totalItems: 17,
      requiresPagination: true, // For consistency, even though small
      dependencies: [],
      naturalKey: 'slug',
      hasFileUploads: true, // Panel images, audio
    },
    {
      // Storyblok currently carries 0 video stories in source. The code
      // path is wired but unexercised. Promote to >0 once editorial adds
      // DD_Main_video blocks. Natural key matches lecture upserts (Vimeo URL).
      slug: 'lectures',
      collection: 'lectures',
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
  // translations targets three PayloadCMS globals, not collections.
  translations: [],
  // Deletes in one transaction; nothing to paginate.
  'atlas-reset': [],
  // Atlas migration. Order is the import order (the runner iterates this
  // array): managers and regions before events and clients, events and
  // users before registrations, events before pictures. Managers, regions,
  // and clients run in bulk (regions builds the country-to-region-to-city
  // tree in one pass). The large collections paginate. `pictures` is a
  // logical step that uploads to `images`.
  atlas: [
    {
      slug: 'managers',
      collection: 'managers',
      totalItems: 495,
      requiresPagination: false,
      dependencies: [],
      naturalKey: 'legacyId',
    },
    {
      slug: 'regions',
      collection: 'regions',
      totalItems: 595,
      requiresPagination: false,
      dependencies: ['managers'],
      naturalKey: 'legacyId',
    },
    {
      slug: 'users',
      collection: 'users',
      totalItems: 2284,
      requiresPagination: true,
      dependencies: [],
      naturalKey: 'email',
    },
    {
      slug: 'events',
      collection: 'events',
      totalItems: 653,
      requiresPagination: true,
      dependencies: ['managers', 'regions'],
      naturalKey: 'legacyId',
    },
    {
      slug: 'user-submissions',
      collection: 'user-submissions',
      countWhere: activeRegistrationWhere,
      totalItems: 2034,
      requiresPagination: true,
      dependencies: ['events', 'users'],
      naturalKey: 'uuid',
    },
    {
      slug: 'clients',
      collection: 'clients',
      totalItems: 31,
      requiresPagination: false,
      dependencies: ['managers', 'regions'],
      naturalKey: 'legacyId',
    },
    {
      slug: 'pictures',
      totalItems: 130,
      requiresPagination: true,
      dependencies: ['events'],
      naturalKey: 'legacyId',
      hasFileUploads: true, // GCS downloads → Images uploads
      // No `collection`: this step uploads into `images`, which `meditations`
      // and `storyblok` also write, so no floor could be attributed to it.
    },
  ],
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
