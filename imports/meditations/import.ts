#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Meditations Import Script
 *
 * Imports meditation content from Google Cloud Storage and PostgreSQL database into Payload CMS.
 *
 * DUAL-DATABASE ARCHITECTURE:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * This script uses TWO different databases:
 *
 * 1. PostgreSQL (SOURCE - temporary, read-only):
 *    - Created from data.bin (meditation database dump)
 *    - Used to READ legacy meditation data
 *    - Automatically cleaned up after import
 *    - NOT related to Payload's database
 *
 * 2. SQLite/D1 (TARGET - Payload CMS):
 *    - Current Payload database (configured in payload.config.ts)
 *    - Where imported content is WRITTEN
 *    - Uses Payload's API for all operations
 *    - Database-agnostic (works with SQLite, D1, PostgreSQL, MongoDB)
 *
 * The script reads from PostgreSQL (legacy data) and writes to Payload (SQLite/D1).
 * These are completely separate databases serving different purposes.
 *
 * Features:
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Natural key-based upsert for all collections
 * - Tag mapping from legacy names to predefined slugs
 * - Downloads and caches media files from Google Cloud Storage
 *
 * Usage:
 *   pnpm import meditations [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import { execSync } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'

import { CollectionSlug } from 'payload'
import { Client } from 'pg'

import { BaseImporter, BaseImportOptions, parseArgs, TagManager, MediaUploader } from '../lib'

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

// ============================================================================
// TAG MAPPING CONSTANTS
// ============================================================================
// Maps legacy tag names from PostgreSQL to predefined tag slugs from imports/tags/import.ts
// These mappings ensure meditations use the same tags that the tags import script creates

const LEGACY_TO_MEDITATION_TAG_SLUG: Record<string, string> = {
  // Morning states
  'excited for the day': 'excited-today',
  'excited': 'excited-today',
  'morning': 'excited-today',

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
}

const LEGACY_TO_MUSIC_TAG_SLUG: Record<string, string> = {
  'nature': 'nature',
  'flute': 'flute',
  'none': 'none',
  'silence': 'none',
  'strings': 'strings',
}

// ============================================================================
// MEDITATIONS IMPORTER CLASS
// ============================================================================

class MeditationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditations'
  protected readonly cacheDir = CACHE_DIR

  private dbClient!: Client
  private tagManager!: TagManager
  private mediaUploader!: MediaUploader
  private placeholderMediaId: number | string | null = null
  private pathPlaceholderMediaId: number | string | null = null
  private meditationThumbnailTagId: number | string | null = null

  // In-memory maps for import (legacy ID → new Payload ID)
  private idMaps = {
    meditationTags: new Map<number, number | string>(),
    musicTags: new Map<number, number | string>(),
    frames: new Map<string, number | string>(), // key format: "{legacyId}_{gender}"
    meditations: new Map<number, number | string>(),
    musics: new Map<number, number | string>(),
    narrators: new Map<number, number | string>(),
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    await this.setupTempDatabase()

    if (!this.options.dryRun) {
      this.tagManager = new TagManager(this.payload, this.logger)
      this.mediaUploader = new MediaUploader(this.payload, this.logger)
    }
  }

  protected async cleanup(): Promise<void> {
    await this.cleanupTempDatabase()
    await super.cleanup()
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

    // Setup tags and placeholders
    await this.setupMeditationThumbnailTag()
    await this.uploadPlaceholderImages()

    // Import in order of dependencies
    await this.importNarrators()
    await this.importTags(data.tags)
    await this.importFrames(data.frames, data.attachments, data.blobs)
    await this.importMusic(data.musics, data.taggings, data.attachments, data.blobs)
    await this.importMeditations(
      data.meditations,
      data.keyframes,
      data.taggings,
      data.attachments,
      data.blobs,
      data.tags,
    )

    // Print media upload stats
    const mediaStats = this.mediaUploader.getStats()
    await this.logger.info(`\n📁 Media: ${mediaStats.uploaded} uploaded, ${mediaStats.reused} reused`)
  }

  // ============================================================================
  // DATABASE SETUP
  // ============================================================================

  private async setupTempDatabase(): Promise<void> {
    await this.logger.info('Setting up temporary PostgreSQL database...')

    try {
      execSync('createdb temp_migration 2>/dev/null || true')
      execSync(
        `pg_restore -d temp_migration --no-owner --no-privileges --clean --if-exists imports/meditations/data.bin 2>/dev/null || true`,
      )

      this.dbClient = new Client({
        host: 'localhost',
        port: 5432,
        database: 'temp_migration',
        user: process.env.USER || 'postgres',
        password: '',
      })
      await this.dbClient.connect()

      await this.logger.success('✓ Temporary database ready')
    } catch (error) {
      this.addError('Setting up temporary database', error as Error)
      throw error
    }
  }

  private async cleanupTempDatabase(): Promise<void> {
    try {
      if (this.dbClient) {
        await this.dbClient.end()
      }
      execSync('dropdb temp_migration 2>/dev/null || true')
      await this.logger.info('✓ Cleaned up temporary database')
    } catch (_error) {
      await this.logger.warn('Could not clean up temp database')
    }
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadData(): Promise<ImportedData> {
    await this.logger.info('Loading data from PostgreSQL...')

    const [tags, frames, meditations, musics, keyframes, taggings, attachments, blobs] =
      await Promise.all([
        this.dbClient.query('SELECT id, name FROM tags ORDER BY id'),
        this.dbClient.query('SELECT id, category, tags FROM frames ORDER BY id'),
        this.dbClient.query(
          'SELECT id, title, duration, published, narrator, music_tag FROM meditations WHERE published = true ORDER BY id',
        ),
        this.dbClient.query('SELECT id, title, duration, credit FROM musics ORDER BY id'),
        this.dbClient.query(
          "SELECT media_type, media_id, frame_id, seconds FROM keyframes WHERE media_type = 'Meditation' ORDER BY media_id, seconds",
        ),
        this.dbClient.query('SELECT tag_id, taggable_type, taggable_id, context FROM taggings'),
        this.dbClient.query(
          'SELECT name, record_type, record_id, blob_id FROM active_storage_attachments',
        ),
        this.dbClient.query(
          'SELECT id, key, filename, content_type, byte_size FROM active_storage_blobs',
        ),
      ])

    await this.logger.info(
      `✓ Loaded: ${tags.rows.length} tags, ${frames.rows.length} frames, ${meditations.rows.length} meditations, ${musics.rows.length} music`,
    )

    return {
      tags: tags.rows,
      frames: frames.rows,
      meditations: meditations.rows,
      musics: musics.rows,
      keyframes: keyframes.rows,
      taggings: taggings.rows,
      attachments: attachments.rows,
      blobs: blobs.rows,
    }
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

  private async downloadFile(storageKey: string, filename: string): Promise<string | null> {
    try {
      const sanitizedKey = storageKey.replace(/[^a-zA-Z0-9.-]/g, '_')
      const cachedPath = path.join(this.cacheDir, `${sanitizedKey}_${filename}`)

      if (await this.fileUtils.fileExists(cachedPath)) {
        await this.logger.log(`  ✓ Using cached: ${filename}`)
        return cachedPath
      }

      const baseUrl =
        process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/media.sydevelopers.com'
      const fileUrl = `${baseUrl}/${storageKey}`

      await this.logger.log(`  Downloading: ${filename}`)
      await this.fileUtils.downloadFileFetch(fileUrl, cachedPath)
      await this.logger.log(`  ✓ Downloaded: ${filename}`)

      return cachedPath
    } catch (error: any) {
      this.addWarning(`Error downloading ${filename}: ${error.message}`)
      return null
    }
  }

  private async uploadToPayload(
    localPath: string,
    collection: CollectionSlug,
    metadata: Record<string, any> = {},
  ): Promise<any | null> {
    try {
      const fileBuffer = await fs.readFile(localPath)
      const filename = path.basename(localPath).replace(/^[^_]+_/, '')
      const mimeType = this.fileUtils.getMimeType(filename)

      // Validate MIME type for music collection
      if (collection === 'music') {
        const acceptedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg']

        if (filename.toLowerCase().endsWith('.m4a')) {
          this.skip(`m4a file (MIME detection conflicts): ${filename}`)
          return null
        }

        if (!acceptedMimeTypes.includes(mimeType)) {
          this.skip(`unsupported audio format: ${filename} (${mimeType})`)
          return null
        }
      }

      const createOptions: any = {
        collection,
        data: metadata,
        file: {
          data: fileBuffer,
          mimetype: mimeType,
          name: filename,
          size: fileBuffer.length,
        },
      }

      if (collection === 'music' || collection === 'meditations') {
        createOptions.locale = 'en'
      }

      const result = await this.payload.create(createOptions)
      await this.logger.log(`    ✓ Uploaded: ${filename}`)
      return result
    } catch (error: any) {
      if (error.message?.includes('exceeds maximum allowed duration')) {
        this.skip(`media (exceeds duration limit): ${path.basename(localPath)}`)
        return null
      }
      this.addWarning(`Failed to upload ${path.basename(localPath)}: ${error.message}`)
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

  private async setupMeditationThumbnailTag(): Promise<void> {
    await this.logger.info('\nSetting up meditation thumbnail tag...')
    this.meditationThumbnailTagId = await this.tagManager.ensureTag(
      'image-tags',
      'meditation-thumbnail',
    )
    await this.logger.log(`    ✓ Tag ready (ID: ${this.meditationThumbnailTagId})`)
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
      const placeholderPath = path.join(this.cacheDir, 'placeholder.jpg')
      if (await this.fileUtils.fileExists(placeholderPath)) {
        const tags = this.meditationThumbnailTagId ? [this.meditationThumbnailTagId] : []
        const result = await this.uploadToPayload(placeholderPath, 'images', {
          alt: 'Meditation placeholder image',
          tags,
        })
        if (result) {
          this.placeholderMediaId = result.id
          await this.logger.log(`    ✓ Uploaded placeholder.jpg (ID: ${this.placeholderMediaId})`)
        }
      } else {
        this.addWarning('placeholder.jpg not found in cache folder')
      }
    }

    if (existingPathPlaceholder.docs.length > 0) {
      this.pathPlaceholderMediaId = existingPathPlaceholder.docs[0].id
      await this.logger.log(`    ✓ Using existing path.jpg (ID: ${this.pathPlaceholderMediaId})`)
    } else {
      const pathPlaceholderPath = path.join(this.cacheDir, 'path.jpg')
      if (await this.fileUtils.fileExists(pathPlaceholderPath)) {
        const tags = this.meditationThumbnailTagId ? [this.meditationThumbnailTagId] : []
        const result = await this.uploadToPayload(pathPlaceholderPath, 'images', {
          alt: 'Path meditation placeholder image',
          tags,
        })
        if (result) {
          this.pathPlaceholderMediaId = result.id
          await this.logger.log(`    ✓ Uploaded path.jpg (ID: ${this.pathPlaceholderMediaId})`)
        }
      } else {
        this.addWarning('path.jpg not found in cache folder')
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

  private async importTags(tags: ImportedData['tags']): Promise<void> {
    await this.logger.info('\n=== Mapping Legacy Tags ===')

    // Get tag usage from taggings table
    const taggingsQuery = await this.dbClient.query(
      "SELECT tag_id, taggable_type FROM taggings WHERE context = 'tags'",
    )
    const taggings = taggingsQuery.rows

    const meditationTagIds = new Set<number>()
    const musicTagIds = new Set<number>()

    taggings.forEach((tagging: any) => {
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

    const meditationTagsBySlug = new Map<string, any>()
    const musicTagsBySlug = new Map<string, any>()

    existingMeditationTags.docs.forEach((tag: any) => {
      if (tag.slug) meditationTagsBySlug.set(tag.slug, tag)
    })
    existingMusicTags.docs.forEach((tag: any) => {
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
    await this.logger.info('\n=== Importing Frames ===')
    await this.logger.progress(0, frames.length, 'Frames')

    const validFrameTags = [
      'anahat', 'back', 'bandhan', 'both hands', 'center', 'channel', 'earth', 'ego',
      'feel', 'ham ksham', 'hamsa', 'hand', 'hands', 'ida', 'left', 'lefthanded',
      'massage', 'pingala', 'raise', 'right', 'righthanded', 'rising', 'silent',
      'superego', 'tapping',
    ]

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]

      const mappedCategory = this.mapFrameCategory(frame.category)
      if (!mappedCategory) {
        this.skip(`frame with unknown category "${frame.category}"`)
        await this.logger.progress(i + 1, frames.length, 'Frames')
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
        )
      }

      if (!maleAttachment && !femaleAttachment) {
        this.skip(`frame without attachments: ${frame.category}`)
      }

      await this.logger.progress(i + 1, frames.length, 'Frames')
    }
  }

  private async processFrame(
    legacyFrameId: number,
    gender: 'male' | 'female',
    attachment: any,
    category: string,
    tagValues: string[],
  ): Promise<void> {
    const filename = attachment.blob.filename

    // Check for existing frame by filename (use equals for exact match to avoid SQLite LIKE pattern issues)
    const existing = await this.payload.find({
      collection: 'frames',
      where: { filename: { equals: filename } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      await this.logger.log(`    ✓ Using existing ${gender} frame: ${filename}`)
      this.idMaps.frames.set(`${legacyFrameId}_${gender}`, existing.docs[0].id)
      this.report.incrementSkipped()
      return
    }

    // Download and upload new frame
    const localPath = await this.downloadFile(attachment.blob.key, filename)
    if (!localPath) return

    try {
      const frameData = {
        imageSet: gender,
        category: category as any,
        tags: tagValues as any[],
      }

      const result = await this.uploadToPayload(localPath, 'frames', frameData)
      if (result) {
        this.idMaps.frames.set(`${legacyFrameId}_${gender}`, result.id)
        this.report.incrementCreated()
      }
    } catch (error) {
      this.addError(`Uploading frame ${filename}`, error as Error)
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
    await this.logger.info('\n=== Importing Music ===')
    await this.logger.progress(0, musics.length, 'Music')

    for (let i = 0; i < musics.length; i++) {
      const music = musics[i]

      // Generate slug
      const slug = (music.title || 'untitled-music')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      // Get music tags
      const musicTaggings = taggings.filter(
        (t) => t.taggable_type === 'Music' && t.taggable_id === music.id && t.context === 'tags',
      )
      const musicTagIds = musicTaggings
        .map((t) => this.idMaps.musicTags.get(t.tag_id))
        .filter((id): id is number => Boolean(id))

      const musicData = {
        title: music.title || 'Untitled Music',
        credit: music.credit || '',
        duration: music.duration,
        tags: musicTagIds,
      }

      try {
        // Check for existing music by slug
        const existing = await this.payload.find({
          collection: 'music',
          where: { slug: { equals: slug } },
          limit: 1,
        })

        if (existing.docs.length > 0) {
          await this.logger.log(`    ✓ Using existing music: ${music.title}`)
          this.idMaps.musics.set(music.id, existing.docs[0].id)
          this.report.incrementSkipped()
        } else {
          // Upload with audio file if available
          const musicAttachments = this.getAttachmentsForRecord('Music', music.id, attachments, blobs)
          const audioAttachment = musicAttachments.find((att) => att.name === 'audio')

          let result
          if (audioAttachment) {
            const localPath = await this.downloadFile(
              audioAttachment.blob.key,
              audioAttachment.blob.filename,
            )
            if (localPath) {
              result = await this.uploadToPayload(localPath, 'music', musicData)
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
            this.report.incrementCreated()
          }
        }
      } catch (error) {
        this.addError(`Importing music "${music.title}"`, error as Error)
      }

      await this.logger.progress(i + 1, musics.length, 'Music')
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
    await this.logger.info('\n=== Importing Meditations ===')
    await this.logger.progress(0, meditations.length, 'Meditations')

    for (let i = 0; i < meditations.length; i++) {
      const meditation = meditations[i]

      // Generate unique slug with duration
      const baseSlug = meditation.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const uniqueSlug = meditation.duration
        ? `${baseSlug}-${meditation.duration}`
        : `${baseSlug}-${meditation.id}`

      // Check for existing meditation by slug
      const existing = await this.payload.find({
        collection: 'meditations',
        where: { slug: { equals: uniqueSlug } },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        await this.logger.log(`    ✓ Using existing: ${meditation.title}`)
        this.idMaps.meditations.set(meditation.id, existing.docs[0].id)
        this.report.incrementSkipped()
        await this.logger.progress(i + 1, meditations.length, 'Meditations')
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
        )
      } catch (error) {
        this.addError(`Importing meditation "${meditation.title}"`, error as Error)
      }

      await this.logger.progress(i + 1, meditations.length, 'Meditations')
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
      publishAt: meditation.published ? new Date().toISOString() : undefined,
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
      const localPath = await this.downloadFile(
        audioAttachment.blob.key,
        audioAttachment.blob.filename,
      )
      if (localPath) {
        result = await this.uploadToPayload(localPath, 'meditations', meditationData)
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
      await this.logger.log(`    ✓ Created: ${meditation.title} (${narratorGender})`)
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

    const localPath = await this.downloadFile(artAttachment.blob.key, artAttachment.blob.filename)
    if (!localPath) return null

    const tags = this.meditationThumbnailTagId ? [this.meditationThumbnailTagId] : []
    const result = await this.mediaUploader.uploadWithDeduplication(localPath, {
      alt: `${meditation.title} thumbnail`,
      tags: tags as number[],
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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs()

  const importer = new MeditationsImporter(options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
