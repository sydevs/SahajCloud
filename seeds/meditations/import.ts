#!/usr/bin/env tsx

/**
 * Meditations Import Script
 *
 * Imports meditation content from pre-extracted JSON data and Google Cloud Storage into Payload CMS.
 *
 * IMPORTANT: Run `pnpm seed wemeditate` BEFORE this script to create albums.
 * This script matches music tracks to albums by comparing the `credit` field
 * in the source data to the `artist` field on albums.
 *
 * DATA SOURCE:
 * - JSON file (seeds/meditations/data.json) - pre-extracted from legacy PostgreSQL
 * - Google Cloud Storage - for downloading media files
 *
 * Features:
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Natural key-based upsert for all collections
 * - Tag mapping from legacy names to predefined slugs
 * - Downloads and caches media files from Google Cloud Storage
 * - Matches music to albums by credit/artist field
 * - No PostgreSQL dependency - can run anywhere (migrations, CI/CD, Workers)
 *
 * Usage:
 *   pnpm seed meditations [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import type { CollectionSlug, Payload } from 'payload'

import * as path from 'path'

import type { SongTag, UserChoice } from '@/payload-types'

import { seedEnv } from 'seeds/env'

import {
  BaseImporter,
  BaseImportOptions,
  fetchAsset,
  MediaUploader,
  readCache,
  safeBufferFrom,
  writeCache,
} from '../lib'

// ============================================================================
// FILE DATA TYPE
// ============================================================================

interface FileData {
  data: Buffer
  name: string
  size: number
  mimetype: string
}

// ============================================================================
// TYPES
// ============================================================================

interface ImportedData {
  tags: Array<{ id: number; name: string }>
  frames: Array<{ id: number; category: string; tags: string }>
  meditations: Array<{
    id: number
    title: string
    duration?: number
    published: boolean
    narrator: number
    music_tag?: string
  }>
  musics: Array<{
    id: number
    title: string
    duration?: number
    credit?: string
  }>
  keyframes: Array<{
    media_type: string
    media_id: number
    frame_id: number
    seconds?: number
  }>
  taggings: Array<{
    tag_id: number
    taggable_type: string
    taggable_id: number
    context: string
  }>
  attachments: Array<{
    name: string
    record_type: string
    record_id: number
    blob_id: number
  }>
  blobs: Array<{
    id: number
    key: string
    filename: string
    content_type: string
    byte_size: number
  }>
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'seeds/cache/meditations')

/**
 * GitHub raw URL base for fetching data files when running in Cloudflare Workers
 */
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/sydevs/SahajCloud/main'

// ============================================================================
// TAG MAPPING CONSTANTS
// ============================================================================
// Maps legacy tag names from PostgreSQL to predefined tag slugs from seeds/tags/import.ts
// These mappings ensure meditations use the same tags that the tags import script creates

const LEGACY_TO_MEDITATION_TAG_SLUG: Record<string, string> = {
  // Morning states
  'excited for the day': 'excited-today',
  excited: 'excited-today',

  // Stress states
  'stressed and tense': 'stressed-tense',
  stressed: 'feel-stressed',
  'feel stressed': 'feel-stressed',
  "can't let go of the day": 'stressed-tense',
  tense: 'stressed-tense',

  // Sad/down states
  sad: 'emotionally-down',
  'emotionally down': 'emotionally-down',
  'sad, emotionally down': 'emotionally-down',

  // Tired/lethargic states
  "can't wake up": 'feeling-lethargic',
  lethargic: 'feeling-lethargic',
  "can't wake up, lethargic": 'feeling-lethargic',
  tired: 'tired-overwhelmed',
  'tired and overwhelmed': 'tired-overwhelmed',
  exhausted: 'feel-exhausted',
  'feel exhausted': 'feel-exhausted',

  // Focus issues
  'hard to focus': 'hard-to-focus',
  'too many thoughts': 'hard-to-focus',
  'too many thoughts, hard to focus': 'hard-to-focus',

  // Guilt/regret
  guilty: 'guilty-regretful',
  regretful: 'guilty-regretful',
  'feel guilty': 'guilty-regretful',
  'feel guilty and regretful': 'guilty-regretful',

  // Motivation
  demotivated: 'demotivated-uninspired',
  uninspired: 'demotivated-uninspired',
  'demotivated, uninspired': 'demotivated-uninspired',

  // Relaxation
  'want to unwind': 'want-to-unwind',
  unwind: 'want-to-unwind',
  'feel fine, just want to unwind': 'want-to-unwind',

  // Loneliness
  lonely: 'feel-lonely',
  'feel lonely': 'feel-lonely',

  // Restlessness
  restless: 'restless-thoughts',
  'restless, too many thoughts': 'restless-thoughts',

  // Mind racing
  'mind racing': 'mind-racing',
  "mind is racing, can't relax": 'mind-racing',
  "can't relax": 'mind-racing',

  // Reconnection
  reconnect: 'want-to-reconnect',
  'want to reconnect': 'want-to-reconnect',
  'fine, just want to reconnect': 'want-to-reconnect',

  // Agitation
  wired: 'wired-agitated',
  agitated: 'wired-agitated',
  'wired and agitated': 'wired-agitated',

  // Self-esteem
  insecure: 'low-self-esteem',
  'low self esteem': 'low-self-esteem',
  'feel insecure': 'low-self-esteem',
  'feel insecure, lacking self esteem': 'low-self-esteem',

  // Positive states
  'feeling good': 'feeling-good',
  'great day': 'feeling-good',
  'had a great day': 'feeling-good',
  'had a great day, feeling good!': 'feeling-good',

  // Anxiety
  anxious: 'anxious-overwhelmed',
  overwhelmed: 'anxious-overwhelmed',
  'feel anxious': 'anxious-overwhelmed',
  'feel anxious and overwhelmed': 'anxious-overwhelmed',

  // Anger
  angry: 'feel-angry',
  'feel angry': 'feel-angry',

  // Neutral/fine states
  fine: 'feeling-fine',
  'feeling fine': 'feeling-fine',

  // Energy boost
  'low energy': 'need-energy-boost',
  'need a boost': 'need-energy-boost',
  'low on energy': 'need-energy-boost',
  'low on energy, need a boost': 'need-energy-boost',

  // Pause/reset
  'need to pause': 'need-to-pause',
  'overwhelmed, need to pause': 'need-to-pause',

  // Spiritual
  spiritual: 'spiritual-experience',
  'deeper experience': 'spiritual-experience',
  'seeking deeper spiritual experience': 'spiritual-experience',

  // Time-based tags - NOTE: These now map to the timings field, not UserChoices
  // See TIMING_SLUGS constant and extractTimingsFromTags() for handling
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  'morning-general': 'morning',
  'afternoon-general': 'afternoon',
  'evening-general': 'evening',

  // Positive states (mapped based on who benefits from the meditation)
  calm: 'mind-racing',
  peace: 'spiritual-experience',
  balanced: 'anxious-overwhelmed',
  content: 'feeling-fine',
  humble: 'spiritual-experience',
  relaxed: 'want-to-unwind',
  happy: 'feeling-good',
  joy: 'excited-today',
  fulfilled: 'want-to-reconnect',
  satisfied: 'feeling-fine',

  // Mental/activity states
  focus: 'hard-to-focus',
  overactive: 'restless-thoughts',
  bored: 'demotivated-uninspired',
  creative: 'demotivated-uninspired',

  // Connection/spiritual
  realisation: 'spiritual-experience',
  harmony: 'want-to-reconnect',
  love: 'want-to-reconnect',

  // Self-esteem related
  confidence: 'low-self-esteem',
  esteem: 'low-self-esteem',
}

/**
 * Timing slugs that should be handled as timings field values, not UserChoices.
 * Maps to the timings select field options: morning, afternoon, evening, night.
 *
 * Note: 'night' is intentionally excluded because legacy timing tags only included
 * morning, afternoon, and evening. The 'night' option was added as a new option
 * for future content and is not derived from legacy data.
 */
const TIMING_SLUGS = new Set(['morning', 'afternoon', 'evening'])

const LEGACY_TO_MUSIC_TAG_SLUG: Record<string, string> = {
  // Instrument mappings
  nature: 'nature',
  flute: 'flute',
  strings: 'strings',
  sitar: 'strings',
  santoor: 'strings',
  saxophone: 'flute',
  piano: 'piano',
  // Time-of-day mappings
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
}

// ============================================================================
// MEDITATIONS IMPORTER CLASS
// ============================================================================

export class MeditationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditations'
  protected readonly cacheDir = CACHE_DIR

  // ============================================================================
  // STATIC FACTORY METHOD (for migration use)
  // ============================================================================

  /**
   * Run the importer from a PayloadCMS migration.
   * Uses the provided Payload instance instead of creating a new one.
   */
  static async runFromMigration(payload: Payload): Promise<void> {
    const importer = new MeditationsImporter({
      dryRun: false,
      clearCache: false,
      payload,
    })
    await importer.run()
  }

  // ============================================================================
  // PRIVATE FIELDS
  // ============================================================================

  private mediaUploader!: MediaUploader
  private placeholderMediaId: number | string | null = null
  private pathPlaceholderMediaId: number | string | null = null

  // Image tag names for categorizing uploaded images (now inline enum values)
  private thumbnailTag: string = 'thumbnail'
  private meditationImageTag: string = 'meditation'
  private placeholderTag: string = 'placeholder'

  // In-memory maps for import (legacy ID → new Payload ID)
  private idMaps = {
    userChoices: new Map<number, number | string>(),
    songTags: new Map<number, number | string>(),
    frames: new Map<string, number | string>(), // key format: "{legacyId}_{gender}"
    meditations: new Map<number, number | string>(),
    songs: new Map<number, number | string>(),
    narrators: new Map<number, number | string>(),
    albumsByArtist: new Map<string, number | string>(), // key: artist name (lowercase)
    subtleSystemNodes: new Map<string, number | string>(), // key: node slug
  }

  // Preload cache for songs lookup (composite key: "title|albumId")
  private songCache: Map<string, number | string> = new Map()

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    if (!this.options.dryRun) {
      this.mediaUploader = new MediaUploader(this.payload, this.logger)

      // Preload collections for efficient skip/update mode
      // This dramatically reduces D1 queries by caching existence checks
      // Note: meditations preloaded by label (the unique natural key after duplicate-title suffixing)
      await Promise.all([
        this.preloadCollection('frames', 'filename'),
        this.preloadCollection('meditations', 'label'),
        this.preloadCollection('narrators', 'name'),
        this.preloadCollection('user-choices', 'slug'),
        this.preloadCollection('song-tags', 'slug'),
        this.preloadCollection('songs', 'slug'),
        this.preloadSongsWithCompositeKey(),
      ])
    }
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup()
  }

  /**
   * Reconstruct ID maps from database when resuming paginated import.
   * Called automatically by BaseImporter when pagination is active.
   *
   * NOTE: When targeting `meditations` collection, dependencies (narrators, frames, tags)
   * are auto-imported in the same request (see import() method). This ensures idMaps
   * are populated. The counts below are primarily for logging when running in
   * paginated frames mode (targeting `frames` collection).
   *
   * Frame and tag ID maps CANNOT be fully reconstructed from the database because
   * the legacy source IDs (from the source data) are not stored in Payload.
   */
  protected async reconstructIdMaps(): Promise<void> {
    await this.logger.info('Reconstructing ID maps from database...')

    // Reconstruct narrator map (index → id)
    // Narrators CAN be fully reconstructed because we use gender-based indexing
    const narrators = await this.payload.find({
      collection: 'narrators',
      limit: 10,
      depth: 0,
    })
    for (const narrator of narrators.docs) {
      // Narrators are indexed 0 (male) and 1 (female)
      const index = narrator.gender === 'male' ? 0 : 1
      this.idMaps.narrators.set(index, narrator.id)
    }
    await this.logger.info(`✓ Reconstructed ${this.idMaps.narrators.size} narrators`)

    // NOTE: Frame and tag ID maps use legacy source IDs as keys, which are not
    // stored in Payload. These maps are populated during frame/tag import in
    // the same request (when targeting meditations). Counts below are informational.
    const framesCount = await this.payload.count({ collection: 'frames' })
    await this.logger.info(`✓ Found ${framesCount.totalDocs} existing frames`)

    const userChoicesCount = await this.payload.count({ collection: 'user-choices' })
    await this.logger.info(`✓ Found ${userChoicesCount.totalDocs} existing user choices`)

    const songTagsCount = await this.payload.count({ collection: 'song-tags' })
    await this.logger.info(`✓ Found ${songTagsCount.totalDocs} existing song tags`)

    // Load existing albums for music matching
    await this.loadExistingAlbums()
  }

  /**
   * Rebuild frames idMap by matching legacy frame data to existing frames.
   * Uses filename matching since legacy IDs aren't stored in Payload.
   *
   * This is called when skip mode is enabled and we need to know which frames
   * already exist to properly reference them in meditations.
   *
   * @param frames - Legacy frame data from source
   * @param attachments - Attachment records linking frames to blobs
   * @param blobs - Blob records with filenames
   */
  private async rebuildFramesIdMap(
    frames: ImportedData['frames'],
    attachments: ImportedData['attachments'],
    blobs: ImportedData['blobs'],
  ): Promise<void> {
    await this.logger.info('Rebuilding frames idMap from existing data...')

    // Preload all existing frames (just need id + filename)
    const existingFrames = await this.preloadCollection('frames', 'filename')

    let mappedCount = 0

    // For each legacy frame, compute expected filename and match
    for (const frame of frames) {
      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)

      // Process male frame
      const maleAtt = frameAttachments.find((att) => att.name === 'male')
      if (maleAtt?.blob?.filename) {
        const filename = maleAtt.blob.filename
        const existing = existingFrames.get(filename)
        if (existing) {
          this.idMaps.frames.set(`${frame.id}_male`, existing.id)
          mappedCount++
        }
      }

      // Process female frame
      const femaleAtt = frameAttachments.find((att) => att.name === 'female')
      if (femaleAtt?.blob?.filename) {
        const filename = femaleAtt.blob.filename
        const existing = existingFrames.get(filename)
        if (existing) {
          this.idMaps.frames.set(`${frame.id}_female`, existing.id)
          mappedCount++
        }
      }
    }

    await this.logger.info(
      `✓ Rebuilt ${mappedCount} frame mappings from ${existingFrames.size} existing frames`,
    )
  }

  /**
   * Rebuild tag idMaps by matching legacy tag names to existing tags.
   * Uses the same mapping logic as importTags().
   *
   * @param tags - Legacy tag data from source
   * @param taggings - Tagging relationships to determine which tags are used
   */
  private async rebuildTagsIdMaps(
    tags: ImportedData['tags'],
    taggings: ImportedData['taggings'],
  ): Promise<void> {
    await this.logger.info('Rebuilding tags idMaps from existing data...')

    // Filter taggings to only those with context = 'tags'
    const filteredTaggings = taggings.filter((t) => t.context === 'tags')

    const userChoiceTagIds = new Set<number>()
    const songTagIds = new Set<number>()

    filteredTaggings.forEach((tagging) => {
      if (tagging.taggable_type === 'Meditation') {
        userChoiceTagIds.add(tagging.tag_id)
      } else if (tagging.taggable_type === 'Music') {
        songTagIds.add(tagging.tag_id)
      }
    })

    // Preload existing tags
    const [userChoicesCache, songTagsCache] = await Promise.all([
      this.preloadCollection('user-choices', 'slug'),
      this.preloadCollection('song-tags', 'slug'),
    ])

    let userChoiceMapped = 0
    let musicMapped = 0

    for (const tag of tags) {
      const legacyName = tag.name.toLowerCase().trim()

      // Map meditation tags
      if (userChoiceTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MEDITATION_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = userChoicesCache.get(mappedSlug)
          if (existingTag) {
            this.idMaps.userChoices.set(tag.id, existingTag.id as number)
            userChoiceMapped++
          }
        }
      }

      // Map music tags
      if (songTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MUSIC_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = songTagsCache.get(mappedSlug)
          if (existingTag) {
            this.idMaps.songTags.set(tag.id, existingTag.id as number)
            musicMapped++
          }
        }
      }
    }

    await this.logger.info(`✓ Rebuilt ${userChoiceMapped} user choices, ${musicMapped} music tags`)
  }

  // ============================================================================
  // MAIN IMPORT LOGIC
  // ============================================================================

  protected async import(): Promise<void> {
    // Load data from PostgreSQL
    const data = await this.loadData()

    if (this.options.dryRun) {
      await this.showDryRunSummary(data)
      return
    }

    // Check if we're targeting a specific collection (paginated mode)
    const isPaginated = this.isPaginated()

    // Check if we're in skip mode (not update mode) - can use rebuild instead of full import
    const isSkipMode = !this.options.updateMode

    // Check if this is the first batch (offset=0) to avoid re-running setup on subsequent batches
    const isFirstBatch = !this.options.pagination?.offset || this.options.pagination.offset === 0

    // Setup tags and placeholders
    // - First batch: create if they don't exist, then cache IDs
    // - Subsequent batches: just look up existing IDs (needed for thumbnail assignment)
    if (isFirstBatch) {
      await this.setupImageTags()
      await this.uploadPlaceholderImages()
    } else {
      // On subsequent batches, just look up existing placeholder IDs
      await this.lookupPlaceholderIds()
    }

    // Import in order of dependencies
    // Narrators - import on first batch only (they don't change between batches)
    if (!isPaginated || this.isCollectionTargeted('narrators')) {
      await this.importNarrators()
    } else if (this.isCollectionTargeted('meditations') && isFirstBatch) {
      // When targeting meditations, import narrators only on first batch
      await this.importNarrators()
    }

    // Tags are needed by frames and meditations
    // In skip mode when targeting meditations (not frames), rebuild tags idMaps instead of importing
    // On subsequent batches when targeting meditations, just rebuild idMaps (no re-import needed)
    const shouldImportTags =
      !isPaginated ||
      this.isCollectionTargeted('user-choices') ||
      this.isCollectionTargeted('frames')
    const shouldRebuildTags =
      isSkipMode &&
      this.isCollectionTargeted('meditations') &&
      !this.isCollectionTargeted('frames') &&
      !this.isCollectionTargeted('user-choices')
    const isSubsequentMeditationsBatch =
      this.isCollectionTargeted('meditations') &&
      !this.isCollectionTargeted('user-choices') &&
      !this.isCollectionTargeted('frames') &&
      !isFirstBatch

    if (shouldRebuildTags || isSubsequentMeditationsBatch) {
      await this.rebuildTagsIdMaps(data.tags, data.taggings)
    } else if (shouldImportTags || this.isCollectionTargeted('meditations')) {
      await this.importTags(data.tags, data.taggings)
    }

    // Frames - also run when targeting meditations (to populate idMaps for keyframe references)
    // In skip mode when targeting meditations (not frames), rebuild frames idMap instead of importing
    // On subsequent batches when targeting meditations, just rebuild idMap (no re-import needed)
    const shouldImportFrames = !isPaginated || this.isCollectionTargeted('frames')
    const shouldRebuildFrames =
      isSkipMode && this.isCollectionTargeted('meditations') && !this.isCollectionTargeted('frames')

    if (shouldRebuildFrames || isSubsequentMeditationsBatch) {
      await this.rebuildFramesIdMap(data.frames, data.attachments, data.blobs)
    } else if (shouldImportFrames || this.isCollectionTargeted('meditations')) {
      await this.importFrames(data.frames, data.attachments, data.blobs)
    }

    // Music (no pagination - small collection)
    if (!isPaginated) {
      await this.importSongs(data.musics, data.taggings, data.attachments, data.blobs)
    }

    // Meditations
    if (!isPaginated || this.isCollectionTargeted('meditations')) {
      await this.importMeditations(
        data.meditations,
        data.keyframes,
        data.taggings,
        data.attachments,
        data.blobs,
        data.tags,
      )
    }

    // Print media upload stats
    const mediaStats = this.mediaUploader.getStats()
    await this.logger.info(
      `\n📁 Media: ${mediaStats.uploaded} uploaded, ${mediaStats.reused} reused`,
    )
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadData(): Promise<ImportedData> {
    await this.logger.info('Loading data from JSON...')

    const localPath = path.resolve(process.cwd(), 'seeds/meditations/data.json')
    const workerUrl = `${GITHUB_RAW_BASE}/seeds/meditations/data.json`

    const jsonContent = await this.loadDataFile(localPath, workerUrl)
    const data = JSON.parse(jsonContent) as ImportedData

    await this.logger.info(
      `✓ Loaded: ${data.tags.length} tags, ${data.frames.length} frames, ${data.meditations.length} meditations, ${data.musics.length} music`,
    )

    return data
  }

  private async showDryRunSummary(data: ImportedData): Promise<void> {
    await this.logger.info('\nData to be imported:')
    await this.logger.info(`- ${data.tags.length} tags`)
    await this.logger.info(`- ${data.frames.length} frames`)
    await this.logger.info(`- ${data.meditations.length} meditations`)
    await this.logger.info(`- ${data.musics.length} music tracks`)
    await this.logger.info(`- ${data.taggings.length} tagging relationships`)
    await this.logger.info(`- ${data.attachments.length} file attachments`)

    await this.logger.info(
      '\nSample tags: ' +
        data.tags
          .slice(0, 5)
          .map((t) => t.name)
          .join(', '),
    )
    await this.logger.info(
      'Sample frames: ' +
        data.frames
          .slice(0, 3)
          .map((f) => f.category)
          .join(', '),
    )
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Download file with dual-mode support:
   * - Local development: Cache to disk for faster iteration
   * - Cloudflare Workers: Stream directly without disk
   */
  private async downloadFile(storageKey: string, filename: string): Promise<Buffer | null> {
    const baseUrl = seedEnv.STORAGE_BASE_URL
    const fileUrl = `${baseUrl}/${storageKey}`

    // Build cache path for local mode
    const sanitizedKey = storageKey.replace(/[^a-zA-Z0-9.-]/g, '_')
    const cachedPath = path.join(this.cacheDir, `${sanitizedKey}_${filename}`)

    try {
      // Try cache first (returns null in Workers mode)
      const cached = await readCache(cachedPath)
      if (cached) {
        await this.logger.log(`  ✓ Using cached: ${filename}`)
        return cached
      }

      // Download and cache (fetchAsset handles caching internally in local mode)
      await this.logger.log(`  Downloading: ${filename}`)
      const buffer = await fetchAsset(fileUrl, { cachePath: cachedPath })
      await this.logger.log(`  ✓ Downloaded: ${filename}`)
      return buffer
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.addWarning(`Error downloading ${filename}: ${message}`)
      return null
    }
  }

  /**
   * Create FileData object from buffer for Payload upload
   */
  private createFileData(buffer: Buffer, filename: string): FileData {
    return {
      data: buffer,
      name: filename,
      size: buffer.length,
      mimetype: this.fileUtils.getMimeType(filename),
    }
  }

  /**
   * Upload file to Payload CMS collection
   * Accepts FileData object with buffer for Workers-compatible uploads
   */
  private async uploadToPayload(
    fileData: FileData,
    collection: CollectionSlug,
    metadata: Record<string, any> = {},
  ): Promise<any | null> {
    try {
      // Validate MIME type for songs collection
      if (collection === 'songs') {
        const acceptedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg']

        if (fileData.name.toLowerCase().endsWith('.m4a')) {
          await this.skip(`m4a file (MIME detection conflicts): ${fileData.name}`, {
            collection,
            identifier: fileData.name,
          })
          return null
        }

        if (!acceptedMimeTypes.includes(fileData.mimetype)) {
          await this.skip(`unsupported audio format: ${fileData.name} (${fileData.mimetype})`, {
            collection,
            identifier: fileData.name,
          })
          return null
        }
      }

      const createOptions: any = {
        collection,
        data: metadata,
        file: fileData,
        overrideAccess: true, // Bypass access control for seed script
      }

      if (collection === 'songs' || collection === 'meditations') {
        createOptions.locale = 'en'
      }

      const result = await this.payload.create(createOptions)
      await this.logger.log(`    ✓ Uploaded: ${fileData.name}`)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('exceeds maximum allowed duration')) {
        await this.skip(`media (exceeds duration limit): ${fileData.name}`, {
          collection,
          identifier: fileData.name,
        })
        return null
      }
      this.addWarning(`Failed to upload ${fileData.name}: ${message}`)
      return null
    }
  }

  private getAttachmentsForRecord(
    recordType: string,
    recordId: number,
    attachments: any[],
    blobs: any[],
  ): any[] {
    return attachments
      .filter((att) => att.record_type === recordType && att.record_id === recordId)
      .map((att) => {
        const blob = blobs.find((b) => b.id === att.blob_id)
        return blob ? { ...att, blob } : null
      })
      .filter(Boolean)
  }

  // ============================================================================
  // TAG SETUP
  // ============================================================================

  /**
   * Setup image tags for categorizing meditation thumbnails.
   * Image tags are now inline enum select values on the Images collection,
   * so we just log that they're ready (no collection setup needed).
   */
  private async setupImageTags(): Promise<void> {
    await this.logger.info('\nSetting up image tags...')
    // Image tags are now inline enum values: 'thumbnail', 'meditation', 'placeholder'
    // No collection setup needed - just use the string values directly
    await this.logger.log(
      `    ✓ Tags ready (inline enum values): ${this.thumbnailTag}, ${this.meditationImageTag}, ${this.placeholderTag}`,
    )
  }

  /**
   * Get placeholder image buffer with dual-mode support:
   * - Workers mode: fetch from GitHub directly
   * - Local mode: read from cache or fetch and cache
   */
  private async getPlaceholderBuffer(filename: string): Promise<Buffer | null> {
    const githubUrl = `${GITHUB_RAW_BASE}/seeds/meditations/${filename}`
    const cachedPath = path.join(this.cacheDir, filename)

    try {
      // Try cache first (returns null in Workers mode)
      const cached = await readCache(cachedPath)
      if (cached) {
        return cached
      }

      // Fetch from GitHub
      await this.logger.log(`  Fetching ${filename} from GitHub...`)
      const response = await fetch(githubUrl)
      if (!response.ok) {
        await this.logger.warn(`Failed to fetch placeholder ${filename}: ${response.status}`)
        return null
      }

      const arrayBuffer = await response.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        await this.logger.warn(`Empty response for placeholder ${filename}`)
        return null
      }

      const buffer = safeBufferFrom(arrayBuffer)

      // Cache for local mode (no-op in Workers)
      await writeCache(cachedPath, buffer)

      return buffer
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.warn(`Error fetching ${filename}: ${message}`)
      return null
    }
  }

  private async uploadPlaceholderImages(): Promise<void> {
    await this.logger.info('\nChecking placeholder images...')

    // Check for existing placeholders by alt text (filename changes with Cloudflare Images)
    const [existingPlaceholder, existingPathPlaceholder] = await Promise.all([
      this.payload.find({
        collection: 'images',
        where: { alt: { equals: 'Meditation placeholder image' } },
        limit: 1,
      }),
      this.payload.find({
        collection: 'images',
        where: { alt: { equals: 'Path meditation placeholder image' } },
        limit: 1,
      }),
    ])

    if (existingPlaceholder.docs.length > 0) {
      this.placeholderMediaId = existingPlaceholder.docs[0].id
      await this.logger.log(`    ✓ Using existing placeholder.jpg (ID: ${this.placeholderMediaId})`)
    } else {
      const buffer = await this.getPlaceholderBuffer('placeholder.jpg')
      if (buffer) {
        // Placeholder images get: thumbnail + meditation + placeholder
        const tags = [this.thumbnailTag, this.meditationImageTag, this.placeholderTag]
        const fileData = this.createFileData(buffer, 'placeholder.jpg')
        const result = await this.uploadToPayload(fileData, 'images', {
          alt: 'Meditation placeholder image',
          tags,
        })
        if (result) {
          this.placeholderMediaId = result.id
          await this.logger.log(`    ✓ Uploaded placeholder.jpg (ID: ${this.placeholderMediaId})`)
        }
      } else {
        this.addWarning('placeholder.jpg not available')
      }
    }

    if (existingPathPlaceholder.docs.length > 0) {
      this.pathPlaceholderMediaId = existingPathPlaceholder.docs[0].id
      await this.logger.log(`    ✓ Using existing path.jpg (ID: ${this.pathPlaceholderMediaId})`)
    } else {
      const buffer = await this.getPlaceholderBuffer('path.jpg')
      if (buffer) {
        // Path placeholder images get: thumbnail + meditation + placeholder
        const tags = [this.thumbnailTag, this.meditationImageTag, this.placeholderTag]
        const fileData = this.createFileData(buffer, 'path.jpg')
        const result = await this.uploadToPayload(fileData, 'images', {
          alt: 'Path meditation placeholder image',
          tags,
        })
        if (result) {
          this.pathPlaceholderMediaId = result.id
          await this.logger.log(`    ✓ Uploaded path.jpg (ID: ${this.pathPlaceholderMediaId})`)
        }
      } else {
        this.addWarning('path.jpg not available')
      }
    }
  }

  /**
   * Look up existing placeholder IDs without uploading.
   * Used on subsequent batches after placeholders have been created.
   */
  private async lookupPlaceholderIds(): Promise<void> {
    const [existingPlaceholder, existingPathPlaceholder] = await Promise.all([
      this.payload.find({
        collection: 'images',
        where: { alt: { equals: 'Meditation placeholder image' } },
        limit: 1,
      }),
      this.payload.find({
        collection: 'images',
        where: { alt: { equals: 'Path meditation placeholder image' } },
        limit: 1,
      }),
    ])

    if (existingPlaceholder.docs.length > 0) {
      this.placeholderMediaId = existingPlaceholder.docs[0].id
    }

    if (existingPathPlaceholder.docs.length > 0) {
      this.pathPlaceholderMediaId = existingPathPlaceholder.docs[0].id
    }
  }

  // ============================================================================
  // NARRATORS IMPORT
  // ============================================================================

  private async importNarrators(): Promise<void> {
    await this.logger.info('\n=== Importing Narrators ===')

    const narrators = [
      { name: 'Female Narrator', gender: 'female' as const },
      { name: 'Male Narrator', gender: 'male' as const },
    ]

    for (let i = 0; i < narrators.length; i++) {
      const narratorData = narrators[i]

      try {
        const result = await this.upsert<{ id: number }>(
          'narrators',
          { name: { equals: narratorData.name } },
          narratorData,
        )
        this.idMaps.narrators.set(i, result.doc.id)
      } catch (error) {
        this.addError(`Importing narrator "${narratorData.name}"`, error as Error)
      }
    }
  }

  // ============================================================================
  // TAG MAPPING
  // ============================================================================

  private async importTags(
    tags: ImportedData['tags'],
    taggings: ImportedData['taggings'],
  ): Promise<void> {
    await this.logger.info('\n=== Mapping Legacy Tags ===')

    // Filter taggings to only those with context = 'tags'
    const filteredTaggings = taggings.filter((t) => t.context === 'tags')

    const userChoiceTagIds = new Set<number>()
    const songTagIds = new Set<number>()

    filteredTaggings.forEach((tagging) => {
      if (tagging.taggable_type === 'Meditation') {
        userChoiceTagIds.add(tagging.tag_id)
      } else if (tagging.taggable_type === 'Music') {
        songTagIds.add(tagging.tag_id)
      }
    })

    await this.logger.info(`    ℹ️  ${userChoiceTagIds.size} tags used by meditations`)
    await this.logger.info(`    ℹ️  ${songTagIds.size} tags used by songs`)

    // Load existing predefined tags
    const [existingUserChoices, existingSongTags] = await Promise.all([
      this.payload.find({ collection: 'user-choices', limit: 1000 }),
      this.payload.find({ collection: 'song-tags', limit: 1000 }),
    ])

    const userChoicesBySlug = new Map<string, UserChoice>()
    const songTagsBySlug = new Map<string, SongTag>()

    existingUserChoices.docs.forEach((tag) => {
      if (tag.slug) userChoicesBySlug.set(tag.slug, tag)
    })
    existingSongTags.docs.forEach((tag) => {
      if (tag.slug) songTagsBySlug.set(tag.slug, tag)
    })

    let userChoiceMapped = 0,
      musicMapped = 0

    for (const tag of tags) {
      const legacyName = tag.name.toLowerCase().trim()

      // Map meditation tags
      if (userChoiceTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MEDITATION_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = userChoicesBySlug.get(mappedSlug)
          if (existingTag) {
            this.idMaps.userChoices.set(tag.id, existingTag.id as number)
            await this.logger.log(`    ✓ Mapped "${tag.name}" → "${mappedSlug}"`)
            userChoiceMapped++
          } else {
            this.addWarning(`Predefined tag "${mappedSlug}" not found - run tags import first`)
          }
        } else if (legacyName !== 'path') {
          // 'path' tag is handled by setting type='lesson', not via tag mapping
          this.addWarning(`No mapping for meditation tag "${tag.name}"`)
        }
      }

      // Map song tags
      if (songTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MUSIC_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = songTagsBySlug.get(mappedSlug)
          if (existingTag) {
            this.idMaps.songTags.set(tag.id, existingTag.id as number)
            await this.logger.log(`    ✓ Mapped song "${tag.name}" → "${mappedSlug}"`)
            musicMapped++
          } else {
            this.addWarning(`Predefined song tag "${mappedSlug}" not found - run tags import first`)
          }
        } else {
          this.addWarning(`No mapping for song tag "${tag.name}"`)
        }
      }
    }

    await this.logger.info(
      `✓ Mapped ${userChoiceMapped} meditation tags, ${musicMapped} music tags`,
    )
  }

  // ============================================================================
  // FRAMES IMPORT
  // ============================================================================

  /**
   * Maps a legacy `category` string from the source data to the post-rename
   * shape. Chakras / nadis become a `subtleSystemNode` relationship; the four
   * non-chakra values (clearing, meditate, ready, namaste) ride along on the
   * frame's `tags` array instead.
   *
   * Returns `null` when the legacy value is unrecognised so the importer can
   * skip the frame loudly.
   */
  private mapFrameCategoryToSubtleSystemNode(
    oldCategory: string,
  ): { node: string | null; extraTags: string[] } | null {
    const SUBTLE_SYSTEM_SLUGS: Record<string, string> = {
      heart: 'anahat',
      mooladhara: 'mooladhara',
      swadhistan: 'swadhistan',
      nabhi: 'nabhi',
      void: 'void',
      anahat: 'anahat',
      vishuddhi: 'vishuddhi',
      agnya: 'agnya',
      sahasrara: 'sahasrara',
      kundalini: 'kundalini',
    }
    const TAG_FALLBACK = new Set(['clearing', 'meditate', 'ready', 'namaste'])

    const key = oldCategory.toLowerCase().trim()
    const slug = SUBTLE_SYSTEM_SLUGS[key]
    if (slug) return { node: slug, extraTags: [] }
    if (TAG_FALLBACK.has(key)) return { node: null, extraTags: [key] }
    return null
  }

  private async loadSubtleSystemNodes(): Promise<void> {
    const result = await this.payload.find({
      collection: 'subtle-system-nodes',
      limit: 100,
      depth: 0,
    })
    for (const node of result.docs) {
      if (node.slug) this.idMaps.subtleSystemNodes.set(node.slug, node.id)
    }
    await this.logger.info(`✓ Loaded ${this.idMaps.subtleSystemNodes.size} subtle system nodes`)
  }

  private async importFrames(
    frames: ImportedData['frames'],
    attachments: any[],
    blobs: any[],
  ): Promise<void> {
    // ida/pingala/kundalini are now expressed via the subtleSystemNode relationship.
    const validFrameTags = [
      'anahat',
      'back',
      'bandhan',
      'both hands',
      'center',
      'channel',
      'clearing',
      'earth',
      'ego',
      'feel',
      'ham ksham',
      'hamsa',
      'hand',
      'hands',
      'left',
      'lefthanded',
      'massage',
      'meditate',
      'namaste',
      'raise',
      'ready',
      'right',
      'righthanded',
      'rising',
      'silent',
      'superego',
      'tapping',
    ]

    if (this.idMaps.subtleSystemNodes.size === 0) {
      await this.loadSubtleSystemNodes()
    }

    // Apply pagination if active, BUT run in bulk when meditations is targeted
    // (we need all frames to populate idMaps for meditation keyframe references)
    let paginatedFrames: typeof frames
    let offset: number

    if (this.isCollectionTargeted('meditations')) {
      // Run all frames in bulk to populate idMaps for meditations
      paginatedFrames = frames
      offset = 0
      this.paginationState = {
        processedCount: frames.length,
        hasMore: false,
        nextOffset: frames.length,
      }
    } else {
      paginatedFrames = this.paginateItems(frames)
      offset = this.options.pagination?.offset || 0
    }

    const total = frames.length

    await this.logger.info(
      `Processing ${paginatedFrames.length} frames (offset: ${offset}, total: ${total})`,
    )

    for (let i = 0; i < paginatedFrames.length; i++) {
      const frame = paginatedFrames[i]
      const globalIndex = offset + i
      const identifier = `${frame.category}-${frame.id}`

      const mapping = this.mapFrameCategoryToSubtleSystemNode(frame.category)
      if (!mapping) {
        await this.skip(`frame with unknown category "${frame.category}"`, {
          collection: 'frames',
          identifier,
          current: globalIndex + 1,
          total,
        })
        continue
      }

      const subtleSystemNodeId = mapping.node
        ? ((this.idMaps.subtleSystemNodes.get(mapping.node) as number | undefined) ?? null)
        : null
      if (mapping.node && subtleSystemNodeId === null) {
        this.addWarning(`SubtleSystemNode "${mapping.node}" not found - was the migration applied?`)
      }

      // Drop legacy chakra/nadi tag values that are now expressed via the relationship.
      const droppedFromTags = new Set(['ida', 'pingala', 'kundalini'])
      const frameTagNames = frame.tags
        ? frame.tags
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : []
      const tagValues = Array.from(
        new Set(
          frameTagNames
            .filter((tag) => validFrameTags.includes(tag) && !droppedFromTags.has(tag))
            .concat(mapping.extraTags),
        ),
      )

      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)
      const maleAttachment = frameAttachments.find((att) => att.name === 'male')
      const femaleAttachment = frameAttachments.find((att) => att.name === 'female')

      // Process male frame
      if (maleAttachment) {
        await this.processFrame(
          frame.id,
          'male',
          maleAttachment,
          subtleSystemNodeId,
          tagValues,
          globalIndex + 1,
          total,
        )
      }

      // Process female frame
      if (femaleAttachment) {
        await this.processFrame(
          frame.id,
          'female',
          femaleAttachment,
          subtleSystemNodeId,
          tagValues,
          globalIndex + 1,
          total,
        )
      }

      if (!maleAttachment && !femaleAttachment) {
        await this.skip(`frame without attachments: ${frame.category}`, {
          collection: 'frames',
          identifier,
          current: globalIndex + 1,
          total,
        })
      }
    }
  }

  private async processFrame(
    legacyFrameId: number,
    gender: 'male' | 'female',
    attachment: any,
    subtleSystemNodeId: number | null,
    tagValues: string[],
    current: number,
    total: number,
  ): Promise<void> {
    const filename = attachment.blob.filename
    // Identifier for logging — the legacy ID + gender + filename keeps it unique
    // even after the move from `category` to a relationship.
    const identifier = `frame-${legacyFrameId}-${gender} (${filename})`

    // Check preload cache (fast, in-memory)
    // Preload caches by both filename (Cloudflare ID) and originalFilename (source filename)
    // No fallback DB query needed - preloadCollection() already indexes by originalFilename
    const existingFromCache = this.getPreloaded('frames', filename)
    if (existingFromCache) {
      this.idMaps.frames.set(`${legacyFrameId}_${gender}`, existingFromCache.id)

      // Skip mode: just skip
      if (!this.options.updateMode) {
        this.report.incrementSkipped()
        await this.reportDocument('frames', identifier, 'skipped', { current, total })
        return
      }

      // Update mode: update metadata without re-uploading image
      try {
        const frameData = {
          imageSet: gender,
          subtleSystemNode: subtleSystemNodeId ?? undefined,
          tags: tagValues as any[],
        }
        await this.payload.update({
          collection: 'frames',
          id: existingFromCache.id,
          data: frameData,
        })
        this.report.incrementUpdated()
        await this.reportDocument('frames', identifier, 'updated', { current, total })
      } catch (error) {
        this.addError(`Updating frame ${filename}`, error as Error)
        await this.reportDocument('frames', identifier, 'error', {
          error: (error as Error).message,
          current,
          total,
        })
      }
      return
    }

    // Not in cache = doesn't exist in DB. Download and upload new frame.
    const buffer = await this.downloadFile(attachment.blob.key, filename)
    if (!buffer) {
      await this.reportDocument('frames', identifier, 'error', {
        error: 'Download failed',
        current,
        total,
      })
      return
    }

    try {
      const frameData = {
        imageSet: gender,
        subtleSystemNode: subtleSystemNodeId ?? undefined,
        tags: tagValues as any[],
        // Store original filename for preload cache matching in development mode
        // (Cloudflare adapters set this automatically, but local storage doesn't)
        fileMetadata: { originalFilename: filename },
      }

      const fileData = this.createFileData(buffer, filename)
      const result = await this.uploadToPayload(fileData, 'frames', frameData)
      if (result) {
        this.idMaps.frames.set(`${legacyFrameId}_${gender}`, result.id)
        this.report.incrementCreated()
        await this.reportDocument('frames', identifier, 'created', { current, total })
      }
    } catch (error) {
      this.addError(`Uploading frame ${filename}`, error as Error)
      await this.reportDocument('frames', identifier, 'error', {
        error: (error as Error).message,
        current,
        total,
      })
    }
  }

  // ============================================================================
  // ALBUM HELPER
  // ============================================================================

  /**
   * Load existing albums from wemeditate import into the albumsByArtist map.
   * This should be called before importing music.
   */
  private async loadExistingAlbums(): Promise<void> {
    await this.logger.info('\n=== Loading Existing Albums ===')

    const albums = await this.payload.find({
      collection: 'albums',
      limit: 1000,
    })

    for (const album of albums.docs) {
      if (album.artist) {
        const artistKey = album.artist.toLowerCase().trim()
        this.idMaps.albumsByArtist.set(artistKey, album.id)
      }
    }

    await this.logger.info(`✓ Loaded ${this.idMaps.albumsByArtist.size} albums`)
  }

  /**
   * Pre-load songs with composite key (title|albumId) for O(1) lookups.
   * This eliminates per-record queries in importSongs().
   */
  private async preloadSongsWithCompositeKey(): Promise<void> {
    await this.logger.info('Pre-loading songs with composite keys...')
    const BATCH_SIZE = 500
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await this.payload.find({
        collection: 'songs',
        limit: BATCH_SIZE,
        page,
        depth: 0,
        select: { title: true, album: true },
      })

      for (const doc of result.docs) {
        if (doc.title && doc.album) {
          // Composite key: "title|albumId"
          const key = `${doc.title}|${doc.album}`
          this.songCache.set(key, doc.id)
        }
      }
      hasMore = result.hasNextPage
      page++
    }
    await this.logger.info(`✓ Pre-loaded ${this.songCache.size} songs`)
  }

  /**
   * Get or create an album for a song based on the credit/artist.
   * First tries to find an existing album by artist name.
   * If not found, creates a new album with a placeholder image.
   */
  private async getOrCreateAlbumForArtist(artistName: string): Promise<number | string | null> {
    const artistKey = artistName.toLowerCase().trim()

    // Check cache first
    const cachedId = this.idMaps.albumsByArtist.get(artistKey)
    if (cachedId) {
      return cachedId
    }

    // Check database (in case it wasn't in cache)
    const existing = await this.payload.find({
      collection: 'albums',
      where: { artist: { equals: artistName } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      this.idMaps.albumsByArtist.set(artistKey, existing.docs[0].id)
      return existing.docs[0].id
    }

    // Create new album with placeholder image
    await this.logger.info(`    Creating album for artist: ${artistName}`)
    const buffer = await this.getAlbumPlaceholderBuffer()
    if (!buffer) {
      this.addError(`Album for ${artistName}`, new Error('No placeholder image available'))
      return null
    }

    try {
      const fileData = this.createFileData(buffer, 'placeholder-album.png')
      const result = await this.uploadToPayload(fileData, 'albums', {
        title: artistName, // Use artist name as album title
        artist: artistName,
      })

      if (result) {
        this.idMaps.albumsByArtist.set(artistKey, result.id)
        return result.id
      }

      this.addError(`Album for ${artistName}`, new Error('Upload returned no result'))
      return null
    } catch (error) {
      this.addError(`Album creation for ${artistName}`, error as Error)
      return null
    }
  }

  /**
   * Get album placeholder image buffer with dual-mode support:
   * - Workers mode: fetch from GitHub
   * - Local mode: read from cache or fetch and cache
   */
  private async getAlbumPlaceholderBuffer(): Promise<Buffer | null> {
    const filename = 'placeholder-album.png'
    const githubUrl = `${GITHUB_RAW_BASE}/seeds/wemeditate/preview.png`
    const cachedPath = path.join(this.cacheDir, filename)
    const localPlaceholder = path.resolve(process.cwd(), 'seeds/wemeditate/preview.png')

    try {
      // Try cache first (returns null in Workers mode)
      const cached = await readCache(cachedPath)
      if (cached) {
        return cached
      }

      // Local mode: try to seed cache from local source file
      const localBuffer = await readCache(localPlaceholder)
      if (localBuffer) {
        await writeCache(cachedPath, localBuffer)
        return localBuffer
      }

      // Fetch from GitHub (handles caching in local mode)
      await this.logger.log(`  Fetching album placeholder from GitHub...`)
      return await fetchAsset(githubUrl, { cachePath: cachedPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.addWarning(`Error fetching album placeholder: ${message}`)
      return null
    }
  }

  // ============================================================================
  // SONGS IMPORT
  // ============================================================================

  private async importSongs(
    musics: ImportedData['musics'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
  ): Promise<void> {
    // Load existing albums from wemeditate import
    await this.loadExistingAlbums()

    const total = musics.length
    for (let i = 0; i < total; i++) {
      const music = musics[i]
      const identifier = music.title || `song-${music.id}`

      // Get song tags
      const songTaggings = taggings.filter(
        (t) => t.taggable_type === 'Music' && t.taggable_id === music.id && t.context === 'tags',
      )
      const songTagIds = songTaggings
        .map((t) => this.idMaps.songTags.get(t.tag_id))
        .filter((id): id is number => Boolean(id))

      // Get album based on credit field (artist name)
      // If no credit, skip this track
      if (!music.credit) {
        await this.skip(`Song "${music.title}": no credit/artist specified`, {
          collection: 'songs',
          identifier,
          current: i + 1,
          total,
        })
        continue
      }

      const albumId = await this.getOrCreateAlbumForArtist(music.credit)
      if (albumId === null) {
        // Error already logged by getOrCreateAlbumForArtist
        await this.reportDocument('songs', identifier, 'error', {
          error: 'Failed to get or create album',
          current: i + 1,
          total,
        })
        continue
      }

      const songData = {
        title: music.title || 'Untitled Song',
        album: albumId as number,
        tags: songTagIds.length > 0 ? songTagIds : undefined,
      }

      try {
        // Check preload cache for existing song by title AND album (composite key)
        const cacheKey = `${music.title}|${albumId}`
        const existingId = this.songCache.get(cacheKey)

        if (existingId) {
          // SKIP MODE: Just reuse existing song, don't update
          // UPDATE MODE: Update existing song with tags
          if (this.options.updateMode && songTagIds.length > 0) {
            await this.payload.update({
              collection: 'songs',
              id: existingId,
              data: { tags: songTagIds },
            })
            this.idMaps.songs.set(music.id, existingId)
            this.report.incrementUpdated()
            await this.reportDocument('songs', identifier, 'updated', {
              current: i + 1,
              total,
            })
          } else {
            this.idMaps.songs.set(music.id, existingId)
            this.report.incrementSkipped()
            await this.reportDocument('songs', identifier, 'skipped', {
              current: i + 1,
              total,
            })
          }
        } else {
          // Upload with audio file if available
          const songAttachments = this.getAttachmentsForRecord(
            'Music',
            music.id,
            attachments,
            blobs,
          )
          const audioAttachment = songAttachments.find((att) => att.name === 'audio')

          let result
          if (audioAttachment) {
            const buffer = await this.downloadFile(
              audioAttachment.blob.key,
              audioAttachment.blob.filename,
            )
            if (buffer) {
              const fileData = this.createFileData(buffer, audioAttachment.blob.filename)
              result = await this.uploadToPayload(fileData, 'songs', songData)
            }
          }

          if (!result) {
            result = await this.payload.create({
              collection: 'songs',
              data: songData,
              locale: 'en',
            })
          }

          if (result) {
            this.idMaps.songs.set(music.id, result.id)
            // Add to cache so subsequent imports in same session can find it
            this.songCache.set(cacheKey, result.id)
            this.report.incrementCreated()
            await this.reportDocument('songs', identifier, 'created', {
              current: i + 1,
              total,
            })
          }
        }
      } catch (error) {
        this.addError(`Importing song "${music.title}"`, error as Error)
        await this.reportDocument('songs', identifier, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
      }
    }
  }

  // ============================================================================
  // MEDITATIONS IMPORT
  // ============================================================================

  /**
   * Generate a unique label for meditations that share the same base title.
   * Adds duration suffix like "(5 min)" when multiple meditations have the same title.
   * The label is used for admin display and cache indexing, while title stays clean.
   */
  private generateUniqueLabel(
    meditation: ImportedData['meditations'][0],
    titleCounts: Map<string, number>,
  ): string {
    const baseTitle = meditation.title
    const count = titleCounts.get(baseTitle) || 1

    // If title is unique (count === 1), use it as-is
    if (count === 1) return baseTitle

    // Multiple meditations share this title - add duration suffix to label
    if (meditation.duration) {
      const minutes = Math.round(meditation.duration / 60)
      return `${baseTitle} (${minutes} min)`
    }

    // Fallback: add legacy ID as suffix
    return `${baseTitle} (${meditation.id})`
  }

  private async importMeditations(
    meditations: ImportedData['meditations'],
    keyframes: ImportedData['keyframes'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
    allTags: ImportedData['tags'],
  ): Promise<void> {
    // Build map of title occurrence counts for duplicate detection
    const titleCounts = new Map<string, number>()
    for (const m of meditations) {
      titleCounts.set(m.title, (titleCounts.get(m.title) || 0) + 1)
    }

    // Apply pagination if enabled for meditations collection
    const paginatedMeditations = this.paginateItems(meditations)
    const total = meditations.length
    const offset = this.options.pagination?.offset || 0

    for (let i = 0; i < paginatedMeditations.length; i++) {
      const meditation = paginatedMeditations[i]
      const globalIndex = offset + i

      // Generate unique label for meditations with duplicate base titles
      const uniqueLabel = this.generateUniqueLabel(meditation, titleCounts)
      const identifier = uniqueLabel

      // Check for existing meditation using preload cache (by unique label)
      // Label is unique after duration suffix is added for duplicates
      const existingFromCache = this.getPreloaded('meditations', uniqueLabel)
      if (existingFromCache) {
        this.idMaps.meditations.set(meditation.id, existingFromCache.id)

        // Skip mode: just skip
        if (!this.options.updateMode) {
          this.report.incrementSkipped()
          await this.reportDocument('meditations', identifier, 'skipped', {
            current: globalIndex + 1,
            total,
          })
          continue
        }

        // Update mode: update metadata without re-uploading audio
        try {
          await this.updateMeditation(
            meditation,
            uniqueLabel,
            existingFromCache.id as number | string,
            keyframes,
            taggings,
            attachments,
            blobs,
            allTags,
            globalIndex + 1,
            total,
          )
        } catch (error) {
          this.addError(`Updating meditation "${meditation.title}"`, error as Error)
          await this.reportDocument('meditations', identifier, 'error', {
            error: (error as Error).message,
            current: globalIndex + 1,
            total,
          })
        }
        continue
      }

      try {
        await this.createMeditation(
          meditation,
          uniqueLabel,
          keyframes,
          taggings,
          attachments,
          blobs,
          allTags,
          globalIndex + 1,
          total,
        )
      } catch (error) {
        this.addError(`Importing meditation "${meditation.title}"`, error as Error)
        await this.reportDocument('meditations', identifier, 'error', {
          error: (error as Error).message,
          current: globalIndex + 1,
          total,
        })
      }
    }
  }

  private async createMeditation(
    meditation: ImportedData['meditations'][0],
    label: string,
    keyframes: ImportedData['keyframes'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
    allTags: ImportedData['tags'],
    current: number,
    total: number,
  ): Promise<void> {
    // Get narrator ID and gender
    const narratorIndex = meditation.narrator
    const narratorId = this.idMaps.narrators.get(narratorIndex)
    const narratorGender = narratorIndex === 0 ? 'male' : 'female'

    // Build frames array
    const meditationKeyframes = keyframes.filter((kf) => kf.media_id === meditation.id)
    const frames = meditationKeyframes
      .map((kf) => {
        const frameKey = `${kf.frame_id}_${narratorGender}`
        const frameId = this.idMaps.frames.get(frameKey)
        const timestamp = typeof kf.seconds === 'number' ? kf.seconds : 0

        if (!frameId) {
          this.addWarning(`Frame ${kf.frame_id} not found for ${meditation.title}`)
          return null
        }

        return { id: frameId, timestamp }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => a.timestamp - b.timestamp)

    // Remove duplicate timestamps
    const seen = new Set<number>()
    const validFrames = frames.filter((f) => {
      if (seen.has(f.timestamp)) return false
      seen.add(f.timestamp)
      return true
    })

    // Get meditation tags
    const meditationTaggings = taggings.filter(
      (t) =>
        t.taggable_type === 'Meditation' && t.taggable_id === meditation.id && t.context === 'tags',
    )

    // Extract timings from timing-related tags (morning, afternoon, evening)
    const { timings, timingTagIds } = this.extractTimingsFromTags(meditationTaggings, allTags)

    // Get regular tag IDs, excluding timing-related tags
    const _userChoiceTagIds = meditationTaggings
      .filter((t) => !timingTagIds.has(t.tag_id))
      .map((t) => this.idMaps.userChoices.get(t.tag_id))
      .filter((id): id is number => Boolean(id))

    // Check for path tag (used for type and thumbnail)
    const hasPathTag = this.checkHasPathTag(meditation.id, meditationTaggings, allTags)

    // Handle thumbnail
    let thumbnailId = await this.getThumbnailId(meditation, attachments, blobs)
    if (!thumbnailId) {
      thumbnailId = hasPathTag ? this.pathPlaceholderMediaId : this.placeholderMediaId
    }

    const meditationData: any = {
      label,
      locale: 'en',
      duration: meditation.duration,
      narrator: narratorId,
      type: this.getMeditationType(meditation.title, hasPathTag),
      timings: timings.length > 0 ? timings : undefined,
      _status: meditation.published ? 'published' : 'draft',
    }

    if (thumbnailId) meditationData.thumbnail = thumbnailId
    if (validFrames.length > 0) meditationData.frames = validFrames

    // Get audio attachment
    const meditationAttachments = this.getAttachmentsForRecord(
      'Meditation',
      meditation.id,
      attachments,
      blobs,
    )
    const audioAttachment = meditationAttachments.find((att) => att.name === 'audio')

    let result
    if (audioAttachment) {
      const buffer = await this.downloadFile(
        audioAttachment.blob.key,
        audioAttachment.blob.filename,
      )
      if (buffer) {
        const fileData = this.createFileData(buffer, audioAttachment.blob.filename)
        result = await this.uploadToPayload(fileData, 'meditations', meditationData)
      }
    }

    if (!result) {
      result = await this.payload.create({
        collection: 'meditations',
        data: meditationData,
      })
    }

    if (result) {
      this.idMaps.meditations.set(meditation.id, result.id)
      this.report.incrementCreated()
      await this.reportDocument('meditations', meditation.title, 'created', {
        current,
        total,
      })
    }
  }

  /**
   * Update an existing meditation with metadata only (no audio re-upload).
   * Used in update mode to efficiently update tags, frames, thumbnail, etc.
   */
  private async updateMeditation(
    meditation: ImportedData['meditations'][0],
    label: string,
    existingId: number | string,
    keyframes: ImportedData['keyframes'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
    allTags: ImportedData['tags'],
    current: number,
    total: number,
  ): Promise<void> {
    // Get narrator ID and gender
    const narratorIndex = meditation.narrator
    const narratorId = this.idMaps.narrators.get(narratorIndex)
    const narratorGender = narratorIndex === 0 ? 'male' : 'female'

    // Build frames array
    const meditationKeyframes = keyframes.filter((kf) => kf.media_id === meditation.id)
    const frames = meditationKeyframes
      .map((kf) => {
        const frameKey = `${kf.frame_id}_${narratorGender}`
        const frameId = this.idMaps.frames.get(frameKey)
        const timestamp = typeof kf.seconds === 'number' ? kf.seconds : 0

        if (!frameId) {
          this.addWarning(`Frame ${kf.frame_id} not found for ${meditation.title}`)
          return null
        }

        return { id: frameId, timestamp }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => a.timestamp - b.timestamp)

    // Remove duplicate timestamps
    const seen = new Set<number>()
    const validFrames = frames.filter((f) => {
      if (seen.has(f.timestamp)) return false
      seen.add(f.timestamp)
      return true
    })

    // Get meditation tags
    const meditationTaggings = taggings.filter(
      (t) =>
        t.taggable_type === 'Meditation' && t.taggable_id === meditation.id && t.context === 'tags',
    )

    // Extract timings from timing-related tags (morning, afternoon, evening)
    const { timings, timingTagIds } = this.extractTimingsFromTags(meditationTaggings, allTags)

    // Get regular tag IDs, excluding timing-related tags
    const _userChoiceTagIds = meditationTaggings
      .filter((t) => !timingTagIds.has(t.tag_id))
      .map((t) => this.idMaps.userChoices.get(t.tag_id))
      .filter((id): id is number => Boolean(id))

    // Check for path tag (used for type and thumbnail)
    const hasPathTag = this.checkHasPathTag(meditation.id, meditationTaggings, allTags)

    // Handle thumbnail (reuse existing if possible, update if source has new one)
    let thumbnailId = await this.getThumbnailId(meditation, attachments, blobs)
    if (!thumbnailId) {
      thumbnailId = hasPathTag ? this.pathPlaceholderMediaId : this.placeholderMediaId
    }

    // Build update data (metadata only, no audio file)
    const updateData: any = {
      label,
      duration: meditation.duration,
      narrator: narratorId,
      type: this.getMeditationType(meditation.title, hasPathTag),
      timings: timings.length > 0 ? timings : undefined,
      _status: meditation.published ? 'published' : 'draft',
    }

    if (thumbnailId) updateData.thumbnail = thumbnailId
    if (validFrames.length > 0) updateData.frames = validFrames

    // Update the meditation (no file upload)
    await this.payload.update({
      collection: 'meditations',
      id: existingId,
      data: updateData,
      locale: 'en',
    })

    this.report.incrementUpdated()
    await this.reportDocument('meditations', meditation.title, 'updated', {
      current,
      total,
    })
  }

  private async getThumbnailId(
    meditation: ImportedData['meditations'][0],
    attachments: any[],
    blobs: any[],
  ): Promise<number | string | null> {
    const meditationAttachments = this.getAttachmentsForRecord(
      'Meditation',
      meditation.id,
      attachments,
      blobs,
    )
    const artAttachment = meditationAttachments.find((att) => att.name === 'art')

    if (!artAttachment) {
      // Log available attachments to help diagnose issues
      const availableNames = meditationAttachments.map((a) => a.name).join(', ') || 'none'
      await this.logger.log(
        `    ⚠ No 'art' attachment for meditation ${meditation.id} (available: ${availableNames})`,
      )
      return null
    }

    const buffer = await this.downloadFile(artAttachment.blob.key, artAttachment.blob.filename)
    if (!buffer) {
      await this.logger.log(`    ⚠ Failed to download thumbnail: ${artAttachment.blob.filename}`)
      return null
    }

    const tags = [this.thumbnailTag, this.meditationImageTag]
    // Pass buffer in options for Workers mode, use filename as localPath for cache key
    const result = await this.mediaUploader.uploadWithDeduplication(artAttachment.blob.filename, {
      alt: `${meditation.title} thumbnail`,
      tags,
      buffer,
    })

    await this.logger.log(
      `    ✓ Thumbnail ${result.wasReused ? 'reused' : 'uploaded'}: ${result.filename} (ID: ${result.id})`,
    )
    return result?.id ?? null
  }

  private checkHasPathTag(
    _meditationId: number,
    meditationTaggings: any[],
    allTags: ImportedData['tags'],
  ): boolean {
    for (const tagging of meditationTaggings) {
      const tag = allTags.find((t) => t.id === tagging.tag_id)
      if (tag && tag.name.toLowerCase() === 'path') {
        return true
      }
    }
    return false
  }

  /**
   * Extract timing values from meditation taggings.
   * Returns array of timing values (morning, afternoon, evening) for the timings field.
   * Also returns the tag IDs that should NOT be assigned as regular tags.
   */
  private extractTimingsFromTags(
    meditationTaggings: any[],
    allTags: ImportedData['tags'],
  ): { timings: string[]; timingTagIds: Set<number> } {
    const timings: string[] = []
    const timingTagIds = new Set<number>()

    for (const tagging of meditationTaggings) {
      const tag = allTags.find((t) => t.id === tagging.tag_id)
      if (!tag) continue

      const legacyName = tag.name.toLowerCase().trim()
      const mappedSlug = LEGACY_TO_MEDITATION_TAG_SLUG[legacyName]

      // Check if this maps to a timing slug
      if (mappedSlug && TIMING_SLUGS.has(mappedSlug)) {
        timings.push(mappedSlug)
        timingTagIds.add(tag.id)
      }
    }

    return { timings: [...new Set(timings)], timingTagIds }
  }

  private getMeditationType(title: string, hasPathTag: boolean): 'daily' | 'lesson' {
    // 'path' tag takes priority - sets type to 'lesson' (displays as "Path" in UI)
    if (hasPathTag) {
      return 'lesson'
    }
    if (title.startsWith('Step')) {
      return 'lesson'
    }
    // Everything else is 'daily'. The legacy 'quick' type (timing-tagged
    // meditations) was retired in #445 and folded into 'daily'.
    return 'daily'
  }
}
