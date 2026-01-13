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
 * - JSON file (imports/meditations/data.json) - pre-extracted from legacy PostgreSQL
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

import type { MeditationTag, MusicTag } from '@/payload-types'

import {
  BaseImporter,
  BaseImportOptions,
  fetchAsset,
  MediaUploader,
  readCache,
  TagManager,
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

const CACHE_DIR = path.resolve(process.cwd(), 'imports/cache/meditations')

/**
 * GitHub raw URL base for fetching data files when running in Cloudflare Workers
 */
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/sydevs/SahajCloud/main'

// ============================================================================
// TAG MAPPING CONSTANTS
// ============================================================================
// Maps legacy tag names from PostgreSQL to predefined tag slugs from imports/tags/import.ts
// These mappings ensure meditations use the same tags that the tags import script creates

const LEGACY_TO_MEDITATION_TAG_SLUG: Record<string, string> = {
  // Morning states
  'excited for the day': 'excited-today',
  'excited': 'excited-today',

  // Stress states
  'stressed and tense': 'stressed-tense',
  'stressed': 'feel-stressed',
  'feel stressed': 'feel-stressed',
  "can't let go of the day": 'stressed-tense',
  'tense': 'stressed-tense',

  // Sad/down states
  'sad': 'emotionally-down',
  'emotionally down': 'emotionally-down',
  'sad, emotionally down': 'emotionally-down',

  // Tired/lethargic states
  "can't wake up": 'feeling-lethargic',
  'lethargic': 'feeling-lethargic',
  "can't wake up, lethargic": 'feeling-lethargic',
  'tired': 'tired-overwhelmed',
  'tired and overwhelmed': 'tired-overwhelmed',
  'exhausted': 'feel-exhausted',
  'feel exhausted': 'feel-exhausted',

  // Focus issues
  'hard to focus': 'hard-to-focus',
  'too many thoughts': 'hard-to-focus',
  'too many thoughts, hard to focus': 'hard-to-focus',

  // Guilt/regret
  'guilty': 'guilty-regretful',
  'regretful': 'guilty-regretful',
  'feel guilty': 'guilty-regretful',
  'feel guilty and regretful': 'guilty-regretful',

  // Motivation
  'demotivated': 'demotivated-uninspired',
  'uninspired': 'demotivated-uninspired',
  'demotivated, uninspired': 'demotivated-uninspired',

  // Relaxation
  'want to unwind': 'want-to-unwind',
  'unwind': 'want-to-unwind',
  'feel fine, just want to unwind': 'want-to-unwind',

  // Loneliness
  'lonely': 'feel-lonely',
  'feel lonely': 'feel-lonely',

  // Restlessness
  'restless': 'restless-thoughts',
  'restless, too many thoughts': 'restless-thoughts',

  // Mind racing
  'mind racing': 'mind-racing',
  "mind is racing, can't relax": 'mind-racing',
  "can't relax": 'mind-racing',

  // Reconnection
  'reconnect': 'want-to-reconnect',
  'want to reconnect': 'want-to-reconnect',
  'fine, just want to reconnect': 'want-to-reconnect',

  // Agitation
  'wired': 'wired-agitated',
  'agitated': 'wired-agitated',
  'wired and agitated': 'wired-agitated',

  // Self-esteem
  'insecure': 'low-self-esteem',
  'low self esteem': 'low-self-esteem',
  'feel insecure': 'low-self-esteem',
  'feel insecure, lacking self esteem': 'low-self-esteem',

  // Positive states
  'feeling good': 'feeling-good',
  'great day': 'feeling-good',
  'had a great day': 'feeling-good',
  'had a great day, feeling good!': 'feeling-good',

  // Anxiety
  'anxious': 'anxious-overwhelmed',
  'overwhelmed': 'anxious-overwhelmed',
  'feel anxious': 'anxious-overwhelmed',
  'feel anxious and overwhelmed': 'anxious-overwhelmed',

  // Anger
  'angry': 'feel-angry',
  'feel angry': 'feel-angry',

  // Neutral/fine states
  'fine': 'feeling-fine',
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
  'spiritual': 'spiritual-experience',
  'deeper experience': 'spiritual-experience',
  'seeking deeper spiritual experience': 'spiritual-experience',

  // Time-based tags
  'morning': 'morning',
  'afternoon': 'afternoon',
  'evening': 'evening',
  'morning-general': 'morning',
  'afternoon-general': 'afternoon',
  'evening-general': 'evening',

  // Positive states (mapped based on who benefits from the meditation)
  'calm': 'mind-racing',
  'peace': 'spiritual-experience',
  'balanced': 'anxious-overwhelmed',
  'content': 'feeling-fine',
  'humble': 'spiritual-experience',
  'relaxed': 'want-to-unwind',
  'happy': 'feeling-good',
  'joy': 'excited-today',
  'fulfilled': 'want-to-reconnect',
  'satisfied': 'feeling-fine',

  // Mental/activity states
  'focus': 'hard-to-focus',
  'overactive': 'restless-thoughts',
  'bored': 'demotivated-uninspired',
  'creative': 'demotivated-uninspired',

  // Connection/spiritual
  'realisation': 'spiritual-experience',
  'harmony': 'want-to-reconnect',
  'love': 'want-to-reconnect',

  // Self-esteem related
  'confidence': 'low-self-esteem',
  'esteem': 'low-self-esteem',
}

const LEGACY_TO_MUSIC_TAG_SLUG: Record<string, string> = {
  // Instrument mappings
  'nature': 'nature',
  'flute': 'flute',
  'strings': 'strings',
  'sitar': 'strings',
  'santoor': 'strings',
  'saxophone': 'flute',
  'piano': 'piano',
  // Time-of-day mappings
  'morning': 'morning',
  'afternoon': 'afternoon',
  'evening': 'evening',
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

  private tagManager!: TagManager
  private mediaUploader!: MediaUploader
  private placeholderMediaId: number | string | null = null
  private pathPlaceholderMediaId: number | string | null = null

  // Image tags for categorizing uploaded images
  private thumbnailTagId: number | null = null
  private meditationTagId: number | null = null
  private placeholderTagId: number | null = null

  // In-memory maps for import (legacy ID → new Payload ID)
  private idMaps = {
    meditationTags: new Map<number, number | string>(),
    musicTags: new Map<number, number | string>(),
    frames: new Map<string, number | string>(), // key format: "{legacyId}_{gender}"
    meditations: new Map<number, number | string>(),
    musics: new Map<number, number | string>(),
    narrators: new Map<number, number | string>(),
    albumsByArtist: new Map<string, number | string>(), // key: artist name (lowercase)
  }

  // Preload cache for music lookup (composite key: "title|albumId")
  private musicCache: Map<string, number | string> = new Map()

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    if (!this.options.dryRun) {
      this.tagManager = new TagManager(this.payload, this.logger)
      this.mediaUploader = new MediaUploader(this.payload, this.logger)

      // Preload collections for efficient skip/update mode
      // This dramatically reduces D1 queries by caching existence checks
      // Note: meditations preloaded by title (more reliable than generated slug which may differ from stored)
      await Promise.all([
        this.preloadCollection('frames', 'filename'),
        this.preloadCollection('meditations', 'title'),
        this.preloadCollection('narrators', 'slug'),
        this.preloadCollection('meditation-tags', 'slug'),
        this.preloadCollection('music-tags', 'slug'),
        this.preloadCollection('music', 'slug'),
        this.preloadMusicWithCompositeKey(),
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

    const meditationTagsCount = await this.payload.count({ collection: 'meditation-tags' })
    await this.logger.info(`✓ Found ${meditationTagsCount.totalDocs} existing meditation tags`)

    const musicTagsCount = await this.payload.count({ collection: 'music-tags' })
    await this.logger.info(`✓ Found ${musicTagsCount.totalDocs} existing music tags`)

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

    await this.logger.info(`✓ Rebuilt ${mappedCount} frame mappings from ${existingFrames.size} existing frames`)
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

    const meditationTagIds = new Set<number>()
    const musicTagIds = new Set<number>()

    filteredTaggings.forEach((tagging) => {
      if (tagging.taggable_type === 'Meditation') {
        meditationTagIds.add(tagging.tag_id)
      } else if (tagging.taggable_type === 'Music') {
        musicTagIds.add(tagging.tag_id)
      }
    })

    // Preload existing tags
    const [meditationTagsCache, musicTagsCache] = await Promise.all([
      this.preloadCollection('meditation-tags', 'slug'),
      this.preloadCollection('music-tags', 'slug'),
    ])

    let meditationMapped = 0
    let musicMapped = 0

    for (const tag of tags) {
      const legacyName = tag.name.toLowerCase().trim()

      // Map meditation tags
      if (meditationTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MEDITATION_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = meditationTagsCache.get(mappedSlug)
          if (existingTag) {
            this.idMaps.meditationTags.set(tag.id, existingTag.id as number)
            meditationMapped++
          }
        }
      }

      // Map music tags
      if (musicTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MUSIC_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = musicTagsCache.get(mappedSlug)
          if (existingTag) {
            this.idMaps.musicTags.set(tag.id, existingTag.id as number)
            musicMapped++
          }
        }
      }
    }

    await this.logger.info(`✓ Rebuilt ${meditationMapped} meditation tags, ${musicMapped} music tags`)
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

    // Setup tags and placeholders - only on first batch (they check for existing and skip if found)
    if (isFirstBatch) {
      await this.setupImageTags()
      await this.uploadPlaceholderImages()
    }

    // Import in order of dependencies
    // When targeting meditations, also run dependencies to populate idMaps
    if (!isPaginated || this.isCollectionTargeted('narrators') || this.isCollectionTargeted('meditations')) {
      await this.importNarrators()
    }

    // Tags are needed by frames and meditations
    // In skip mode when targeting meditations (not frames), rebuild tags idMaps instead of importing
    const shouldImportTags =
      !isPaginated ||
      this.isCollectionTargeted('meditation-tags') ||
      this.isCollectionTargeted('frames')
    const shouldRebuildTags =
      isSkipMode &&
      this.isCollectionTargeted('meditations') &&
      !this.isCollectionTargeted('frames') &&
      !this.isCollectionTargeted('meditation-tags')

    if (shouldRebuildTags) {
      await this.rebuildTagsIdMaps(data.tags, data.taggings)
    } else if (shouldImportTags || this.isCollectionTargeted('meditations')) {
      await this.importTags(data.tags, data.taggings)
    }

    // Frames - also run when targeting meditations (to populate idMaps for keyframe references)
    // In skip mode when targeting meditations (not frames), rebuild frames idMap instead of importing
    const shouldImportFrames = !isPaginated || this.isCollectionTargeted('frames')
    const shouldRebuildFrames =
      isSkipMode &&
      this.isCollectionTargeted('meditations') &&
      !this.isCollectionTargeted('frames')

    if (shouldRebuildFrames) {
      await this.rebuildFramesIdMap(data.frames, data.attachments, data.blobs)
    } else if (shouldImportFrames || this.isCollectionTargeted('meditations')) {
      await this.importFrames(data.frames, data.attachments, data.blobs)
    }

    // Music (no pagination - small collection)
    if (!isPaginated) {
      await this.importMusic(data.musics, data.taggings, data.attachments, data.blobs)
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
    await this.logger.info(`\n📁 Media: ${mediaStats.uploaded} uploaded, ${mediaStats.reused} reused`)
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadData(): Promise<ImportedData> {
    await this.logger.info('Loading data from JSON...')

    const localPath = path.resolve(process.cwd(), 'imports/meditations/data.json')
    const workerUrl = `${GITHUB_RAW_BASE}/imports/meditations/data.json`

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
    const baseUrl =
      process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/media.sydevelopers.com'
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
      // Validate MIME type for music collection
      if (collection === 'music') {
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

      if (collection === 'music' || collection === 'meditations') {
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
   * Uses the new tag pattern: thumbnail + meditation (+ placeholder for placeholders)
   */
  private async setupImageTags(): Promise<void> {
    await this.logger.info('\nSetting up image tags...')

    // Create tags in parallel for efficiency
    const [thumbnailId, meditationId, placeholderId] = await Promise.all([
      this.tagManager.ensureTag('image-tags', 'thumbnail'),
      this.tagManager.ensureTag('image-tags', 'meditation'),
      this.tagManager.ensureTag('image-tags', 'placeholder'),
    ])

    this.thumbnailTagId = thumbnailId
    this.meditationTagId = meditationId
    this.placeholderTagId = placeholderId

    await this.logger.log(`    ✓ Tags ready: thumbnail(${thumbnailId}), meditation(${meditationId}), placeholder(${placeholderId})`)
  }

  /**
   * Get placeholder image buffer with dual-mode support:
   * - Workers mode: fetch from GitHub directly
   * - Local mode: read from cache or fetch and cache
   */
  private async getPlaceholderBuffer(filename: string): Promise<Buffer | null> {
    const githubUrl = `${GITHUB_RAW_BASE}/imports/meditations/${filename}`
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

      const buffer = Buffer.from(arrayBuffer)

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

    // Check for existing placeholders
    const [existingPlaceholder, existingPathPlaceholder] = await Promise.all([
      this.payload.find({
        collection: 'images',
        where: { filename: { equals: 'placeholder.jpg' } },
        limit: 1,
      }),
      this.payload.find({
        collection: 'images',
        where: { filename: { equals: 'path.jpg' } },
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
        const tags = [this.thumbnailTagId, this.meditationTagId, this.placeholderTagId].filter(
          (id): id is number => id !== null,
        )
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
        const tags = [this.thumbnailTagId, this.meditationTagId, this.placeholderTagId].filter(
          (id): id is number => id !== null,
        )
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

  private async importTags(tags: ImportedData['tags'], taggings: ImportedData['taggings']): Promise<void> {
    await this.logger.info('\n=== Mapping Legacy Tags ===')

    // Filter taggings to only those with context = 'tags'
    const filteredTaggings = taggings.filter((t) => t.context === 'tags')

    const meditationTagIds = new Set<number>()
    const musicTagIds = new Set<number>()

    filteredTaggings.forEach((tagging) => {
      if (tagging.taggable_type === 'Meditation') {
        meditationTagIds.add(tagging.tag_id)
      } else if (tagging.taggable_type === 'Music') {
        musicTagIds.add(tagging.tag_id)
      }
    })

    await this.logger.info(`    ℹ️  ${meditationTagIds.size} tags used by meditations`)
    await this.logger.info(`    ℹ️  ${musicTagIds.size} tags used by music`)

    // Load existing predefined tags
    const [existingMeditationTags, existingMusicTags] = await Promise.all([
      this.payload.find({ collection: 'meditation-tags', limit: 1000 }),
      this.payload.find({ collection: 'music-tags', limit: 1000 }),
    ])

    const meditationTagsBySlug = new Map<string, MeditationTag>()
    const musicTagsBySlug = new Map<string, MusicTag>()

    existingMeditationTags.docs.forEach((tag) => {
      if (tag.slug) meditationTagsBySlug.set(tag.slug, tag)
    })
    existingMusicTags.docs.forEach((tag) => {
      if (tag.slug) musicTagsBySlug.set(tag.slug, tag)
    })

    let meditationMapped = 0,
      musicMapped = 0

    for (const tag of tags) {
      const legacyName = tag.name.toLowerCase().trim()

      // Map meditation tags
      if (meditationTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MEDITATION_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = meditationTagsBySlug.get(mappedSlug)
          if (existingTag) {
            this.idMaps.meditationTags.set(tag.id, existingTag.id as number)
            await this.logger.log(`    ✓ Mapped "${tag.name}" → "${mappedSlug}"`)
            meditationMapped++
          } else {
            this.addWarning(`Predefined tag "${mappedSlug}" not found - run tags import first`)
          }
        } else {
          this.addWarning(`No mapping for meditation tag "${tag.name}"`)
        }
      }

      // Map music tags
      if (musicTagIds.has(tag.id)) {
        const mappedSlug = LEGACY_TO_MUSIC_TAG_SLUG[legacyName]
        if (mappedSlug) {
          const existingTag = musicTagsBySlug.get(mappedSlug)
          if (existingTag) {
            this.idMaps.musicTags.set(tag.id, existingTag.id as number)
            await this.logger.log(`    ✓ Mapped music "${tag.name}" → "${mappedSlug}"`)
            musicMapped++
          } else {
            this.addWarning(`Predefined music tag "${mappedSlug}" not found - run tags import first`)
          }
        } else {
          this.addWarning(`No mapping for music tag "${tag.name}"`)
        }
      }
    }

    await this.logger.info(
      `✓ Mapped ${meditationMapped} meditation tags, ${musicMapped} music tags`,
    )
  }

  // ============================================================================
  // FRAMES IMPORT
  // ============================================================================

  private mapFrameCategory(oldCategory: string): string | null {
    const categoryMap: Record<string, string> = {
      heart: 'anahat',
      mooladhara: 'mooladhara',
      swadhistan: 'swadhistan',
      nabhi: 'nabhi',
      void: 'void',
      anahat: 'anahat',
      vishuddhi: 'vishuddhi',
      agnya: 'agnya',
      sahasrara: 'sahasrara',
      clearing: 'clearing',
      kundalini: 'kundalini',
      meditate: 'meditate',
      ready: 'ready',
      namaste: 'namaste',
    }
    return categoryMap[oldCategory.toLowerCase().trim()] || null
  }

  private async importFrames(
    frames: ImportedData['frames'],
    attachments: any[],
    blobs: any[],
  ): Promise<void> {
    const validFrameTags = [
      'anahat', 'back', 'bandhan', 'both hands', 'center', 'channel', 'earth', 'ego',
      'feel', 'ham ksham', 'hamsa', 'hand', 'hands', 'ida', 'left', 'lefthanded',
      'massage', 'pingala', 'raise', 'right', 'righthanded', 'rising', 'silent',
      'superego', 'tapping',
    ]

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

      const mappedCategory = this.mapFrameCategory(frame.category)
      if (!mappedCategory) {
        await this.skip(`frame with unknown category "${frame.category}"`, {
          collection: 'frames',
          identifier,
          current: globalIndex + 1,
          total,
        })
        continue
      }

      const frameTagNames = frame.tags
        ? frame.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        : []
      const tagValues = frameTagNames.filter((tag) => validFrameTags.includes(tag))

      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)
      const maleAttachment = frameAttachments.find((att) => att.name === 'male')
      const femaleAttachment = frameAttachments.find((att) => att.name === 'female')

      // Process male frame
      if (maleAttachment) {
        await this.processFrame(
          frame.id,
          'male',
          maleAttachment,
          mappedCategory,
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
          mappedCategory,
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
    category: string,
    tagValues: string[],
    current: number,
    total: number,
  ): Promise<void> {
    const filename = attachment.blob.filename
    // Include filename in identifier for unique identification (multiple frames can share same category)
    const identifier = `${category}-${gender} (${filename})`

    // Check preload cache (fast, in-memory)
    // Preload caches by both filename (Cloudflare ID) and originalFilename (source filename)
    // No fallback DB query needed - preloadCollection() already indexes by originalFilename
    const existingFromCache = this.getPreloaded('frames', filename)
    if (existingFromCache) {
      this.idMaps.frames.set(`${legacyFrameId}_${gender}`, existingFromCache.id)
      this.report.incrementSkipped()
      await this.reportDocument('frames', identifier, 'skipped', { current, total })
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
        category: category as any,
        tags: tagValues as any[],
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
   * Pre-load music tracks with composite key (title|albumId) for O(1) lookups.
   * This eliminates per-record queries in importMusics().
   */
  private async preloadMusicWithCompositeKey(): Promise<void> {
    await this.logger.info('Pre-loading music with composite keys...')
    const BATCH_SIZE = 500
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await this.payload.find({
        collection: 'music',
        limit: BATCH_SIZE,
        page,
        depth: 0,
        select: { id: true, title: true, album: true },
      })

      for (const doc of result.docs) {
        if (doc.title && doc.album) {
          // Composite key: "title|albumId"
          const key = `${doc.title}|${doc.album}`
          this.musicCache.set(key, doc.id)
        }
      }
      hasMore = result.hasNextPage
      page++
    }
    await this.logger.info(`✓ Pre-loaded ${this.musicCache.size} music tracks`)
  }

  /**
   * Get or create an album for a music track based on the credit/artist.
   * First tries to find an existing album by artist name.
   * If not found, creates a new album with a placeholder image.
   */
  private async getOrCreateAlbumForArtist(artistName: string): Promise<number | string> {
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
      throw new Error('No placeholder image available for album creation')
    }
    const fileData = this.createFileData(buffer, 'placeholder-album.png')
    const result = await this.uploadToPayload(fileData, 'albums', {
      title: artistName, // Use artist name as album title
      artist: artistName,
    })

    if (result) {
      this.idMaps.albumsByArtist.set(artistKey, result.id)
      return result.id
    }

    throw new Error(`Failed to create album for artist: ${artistName}`)
  }

  /**
   * Get album placeholder image buffer with dual-mode support:
   * - Workers mode: fetch from GitHub
   * - Local mode: read from cache or fetch and cache
   */
  private async getAlbumPlaceholderBuffer(): Promise<Buffer | null> {
    const filename = 'placeholder-album.png'
    const githubUrl = `${GITHUB_RAW_BASE}/imports/wemeditate/preview.png`
    const cachedPath = path.join(this.cacheDir, filename)
    const localPlaceholder = path.resolve(process.cwd(), 'imports/wemeditate/preview.png')

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
  // MUSIC IMPORT
  // ============================================================================

  private async importMusic(
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
      const identifier = music.title || `music-${music.id}`

      // Get music tags
      const musicTaggings = taggings.filter(
        (t) => t.taggable_type === 'Music' && t.taggable_id === music.id && t.context === 'tags',
      )
      const musicTagIds = musicTaggings
        .map((t) => this.idMaps.musicTags.get(t.tag_id))
        .filter((id): id is number => Boolean(id))

      // Get album based on credit field (artist name)
      // If no credit, skip this track
      if (!music.credit) {
        await this.skip(`Music "${music.title}": no credit/artist specified`, {
          collection: 'music',
          identifier,
          current: i + 1,
          total,
        })
        continue
      }

      let albumId: number | string
      try {
        albumId = await this.getOrCreateAlbumForArtist(music.credit)
      } catch (error) {
        this.addError(`Getting album for music "${music.title}"`, error as Error)
        await this.reportDocument('music', identifier, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
        continue
      }

      const musicData = {
        title: music.title || 'Untitled Music',
        album: albumId as number,
        tags: musicTagIds.length > 0 ? musicTagIds : undefined,
      }

      try {
        // Check preload cache for existing music by title AND album (composite key)
        const cacheKey = `${music.title}|${albumId}`
        const existingId = this.musicCache.get(cacheKey)

        if (existingId) {
          // SKIP MODE: Just reuse existing music, don't update
          // UPDATE MODE: Update existing music with tags
          if (this.options.updateMode && musicTagIds.length > 0) {
            await this.payload.update({
              collection: 'music',
              id: existingId,
              data: { tags: musicTagIds },
            })
            this.idMaps.musics.set(music.id, existingId)
            this.report.incrementUpdated()
            await this.reportDocument('music', identifier, 'updated', {
              current: i + 1,
              total,
            })
          } else {
            this.idMaps.musics.set(music.id, existingId)
            this.report.incrementSkipped()
            await this.reportDocument('music', identifier, 'skipped', {
              current: i + 1,
              total,
            })
          }
        } else {
          // Upload with audio file if available
          const musicAttachments = this.getAttachmentsForRecord('Music', music.id, attachments, blobs)
          const audioAttachment = musicAttachments.find((att) => att.name === 'audio')

          let result
          if (audioAttachment) {
            const buffer = await this.downloadFile(
              audioAttachment.blob.key,
              audioAttachment.blob.filename,
            )
            if (buffer) {
              const fileData = this.createFileData(buffer, audioAttachment.blob.filename)
              result = await this.uploadToPayload(fileData, 'music', musicData)
            }
          }

          if (!result) {
            result = await this.payload.create({
              collection: 'music',
              data: musicData,
              locale: 'en',
            })
          }

          if (result) {
            this.idMaps.musics.set(music.id, result.id)
            // Add to cache so subsequent imports in same session can find it
            this.musicCache.set(cacheKey, result.id)
            this.report.incrementCreated()
            await this.reportDocument('music', identifier, 'created', {
              current: i + 1,
              total,
            })
          }
        }
      } catch (error) {
        this.addError(`Importing music "${music.title}"`, error as Error)
        await this.reportDocument('music', identifier, 'error', {
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

  private async importMeditations(
    meditations: ImportedData['meditations'],
    keyframes: ImportedData['keyframes'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
    allTags: ImportedData['tags'],
  ): Promise<void> {
    // Apply pagination if enabled for meditations collection
    const paginatedMeditations = this.paginateItems(meditations)
    const total = meditations.length
    const offset = this.options.pagination?.offset || 0

    for (let i = 0; i < paginatedMeditations.length; i++) {
      const meditation = paginatedMeditations[i]
      const globalIndex = offset + i
      const identifier = meditation.title

      // Generate unique slug with duration
      const baseSlug = meditation.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const uniqueSlug = meditation.duration
        ? `${baseSlug}-${meditation.duration}`
        : `${baseSlug}-${meditation.id}`

      // Check for existing meditation using preload cache (by title for reliability)
      // Title is more reliable than slug since PayloadCMS slugField may auto-generate different slug
      const existingFromCache = this.getPreloaded('meditations', meditation.title)
      if (existingFromCache) {
        this.idMaps.meditations.set(meditation.id, existingFromCache.id)
        this.report.incrementSkipped()
        await this.reportDocument('meditations', identifier, 'skipped', {
          current: globalIndex + 1,
          total,
        })
        continue
      }

      try {
        await this.createMeditation(
          meditation,
          uniqueSlug,
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
    slug: string,
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
      (t) => t.taggable_type === 'Meditation' && t.taggable_id === meditation.id && t.context === 'tags',
    )
    const meditationTagIds = meditationTaggings
      .map((t) => this.idMaps.meditationTags.get(t.tag_id))
      .filter((id): id is number => Boolean(id))

    // Handle thumbnail
    let thumbnailId = await this.getThumbnailId(meditation, attachments, blobs)
    if (!thumbnailId) {
      const hasPathTag = this.checkHasPathTag(meditation.id, meditationTaggings, allTags)
      thumbnailId = hasPathTag ? this.pathPlaceholderMediaId : this.placeholderMediaId
    }

    const meditationData: any = {
      title: meditation.title,
      label: meditation.title,
      locale: 'en',
      slug,
      duration: meditation.duration,
      narrator: narratorId,
      tags: meditationTagIds,
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

    if (!artAttachment) return null

    const buffer = await this.downloadFile(artAttachment.blob.key, artAttachment.blob.filename)
    if (!buffer) return null

    const tags = [this.thumbnailTagId, this.meditationTagId].filter(
      (id): id is number => id !== null,
    )
    // Pass buffer in options for Workers mode, use filename as localPath for cache key
    const result = await this.mediaUploader.uploadWithDeduplication(artAttachment.blob.filename, {
      alt: `${meditation.title} thumbnail`,
      tags,
      buffer,
    })

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
}

