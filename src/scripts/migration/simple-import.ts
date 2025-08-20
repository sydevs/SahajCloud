#!/usr/bin/env tsx

import 'dotenv/config'
import { CollectionSlug, getPayload, Payload } from 'payload'
import configPromise from '../../payload.config'
import chalk from 'chalk'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

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

// Configuration constant to control update behavior
const UPDATE_EXISTING_RECORDS = true // Set to true to update existing records instead of skipping them

class SimpleImporter {
  private payload!: Payload
  private tempDb: Client
  private cacheDir: string
  private dryRun: boolean
  private idMapsFile: string
  private idMaps = {
    meditationTags: new Map<number, string>(),
    musicTags: new Map<number, string>(),
    frames: new Map<string, string>(),
    meditations: new Map<number, string>(),
    musics: new Map<number, string>(),
    narrators: new Map<number, string>(),
    media: new Map<string, string>(), // filename -> media ID mapping for deduplication
  }

  // Summary statistics
  private summary = {
    narrators: { created: 0, existing: 0, updated: 0 },
    meditationTags: { created: 0, existing: 0, updated: 0 },
    musicTags: { created: 0, existing: 0, updated: 0 },
    frames: { created: 0, existing: 0, updated: 0, skipped: 0 },
    music: { created: 0, existing: 0, updated: 0 },
    meditations: { created: 0, existing: 0, updated: 0 },
    media: { uploaded: 0, reused: 0 },
    alerts: {
      warnings: [] as string[],
      errors: [] as string[],
      skipped: [] as string[],
    },
  }

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun
    this.tempDb = new Client({
      host: 'localhost',
      port: 5432,
      database: 'temp_migration',
      user: process.env.USER || 'postgres',
      password: '',
    })
    // Use persistent cache directory (git-ignored)
    this.cacheDir = path.join(process.cwd(), 'migration-cache')
    this.idMapsFile = path.join(this.cacheDir, 'id-mappings.json')
  }

  // Helper methods for tracking alerts
  private addWarning(message: string) {
    this.summary.alerts.warnings.push(message)
    console.warn(`    ⚠️  ${message}`)
  }

  private addError(message: string) {
    this.summary.alerts.errors.push(message)
    console.error(`    ❌ ${message}`)
  }

  private addSkipped(message: string) {
    this.summary.alerts.skipped.push(message)
    console.log(`    ⚠️  ${message}`)
  }

  async run() {
    const modeText = this.dryRun ? ' (DRY RUN)' : ''
    const updateMode = UPDATE_EXISTING_RECORDS ? ' [UPDATE MODE]' : ' [SKIP MODE]'
    console.log(
      chalk.blue(`\n🚀 Simple Migration from Heroku Postgres Dump${modeText}${updateMode}\n`),
    )

    if (UPDATE_EXISTING_RECORDS) {
      console.log(
        chalk.yellow('⚠️  UPDATE MODE: Existing records will be updated across all collections'),
      )
    } else {
      console.log(chalk.cyan('ℹ️  SKIP MODE: Existing records will be preserved'))
    }

    try {
      // 1. Import dump to temporary database
      await this.setupTempDatabase()

      // 2. Initialize Payload (skip in dry run for speed)
      if (!this.dryRun) {
        console.log('Initializing Payload CMS...')
        const payloadConfig = await configPromise
        this.payload = await getPayload({ config: payloadConfig })
        console.log('✓ Payload CMS initialized')

        // 3. Setup file handling and load ID mappings
        await this.setupFileDirectory()
        await this.loadIdMappingsFromCache()
      } else {
        console.log('⚠️  DRY RUN - Skipping Payload initialization')
      }

      // 4. Load data from temp database
      const data = await this.loadData()

      if (this.dryRun) {
        // Just show what would be imported
        console.log('\nData to be imported:')
        console.log(`- ${data.tags.length} tags`)
        console.log(`- ${data.frames.length} frames`)
        console.log(`- ${data.meditations.length} meditations`)
        console.log(`- ${data.musics.length} music tracks`)
        console.log(`- ${data.taggings.length} taggings relationships`)
        console.log(`- ${data.attachments.length} file attachments`)

        // Show sample data
        console.log(
          '\nSample tags:',
          data.tags
            .slice(0, 5)
            .map((t) => t.name)
            .join(', '),
        )
        console.log(
          'Sample frames:',
          data.frames
            .slice(0, 3)
            .map((f) => f.category)
            .join(', '),
        )

        console.log(chalk.yellow('\n✅ Dry run completed - no data was imported'))
        return
      }

      // 5. Load existing data into idMaps for resumability
      await this.loadExistingData(data)

      // 6. Import in order and save ID mappings after each step
      await this.importNarrators()
      await this.saveIdMappingsToCache()

      await this.importTags(data.tags)
      await this.saveIdMappingsToCache()

      await this.importFrames(data.frames, data.attachments, data.blobs)
      await this.saveIdMappingsToCache()

      await this.importMusic(data.musics, data.taggings, data.attachments, data.blobs)
      await this.saveIdMappingsToCache()

      await this.importMeditations(
        data.meditations,
        data.keyframes,
        data.taggings,
        data.attachments,
        data.blobs,
      )
      await this.saveIdMappingsToCache()

      console.log(chalk.green('\n✅ Migration completed successfully!'))
      this.printSummary()
    } catch (error) {
      console.error(chalk.red('\n❌ Migration failed:'), error)
    } finally {
      await this.cleanup()
    }
  }

  private async setupTempDatabase() {
    console.log('Setting up temporary database...')

    try {
      // Create temp database
      execSync('createdb temp_migration 2>/dev/null || true')

      // Import the dump (ignore role errors which are just ownership issues)
      execSync(
        `pg_restore -d temp_migration --no-owner --no-privileges --clean --if-exists src/scripts/migration/data.bin 2>/dev/null || true`,
      )

      // Connect to temp database
      await this.tempDb.connect()
      console.log('✓ Data imported to temporary database')
    } catch (error) {
      console.error('Failed to setup temp database:', error)
      throw error
    }
  }

  private async loadData(): Promise<ImportedData> {
    console.log('Loading data from temporary database...')

    const [tags, frames, meditations, musics, keyframes, taggings, attachments, blobs] =
      await Promise.all([
        this.tempDb.query('SELECT id, name FROM tags ORDER BY id'),
        this.tempDb.query('SELECT id, category, tags FROM frames ORDER BY id'),
        this.tempDb.query(
          'SELECT id, title, duration, published, narrator, music_tag FROM meditations WHERE published = true ORDER BY id',
        ),
        this.tempDb.query('SELECT id, title, duration, credit FROM musics ORDER BY id'),
        this.tempDb.query(
          "SELECT media_type, media_id, frame_id, seconds FROM keyframes WHERE media_type = 'Meditation' ORDER BY media_id, seconds",
        ),
        this.tempDb.query('SELECT tag_id, taggable_type, taggable_id, context FROM taggings'),
        this.tempDb.query(
          'SELECT name, record_type, record_id, blob_id FROM active_storage_attachments',
        ),
        this.tempDb.query(
          'SELECT id, key, filename, content_type, byte_size FROM active_storage_blobs',
        ),
      ])

    console.log(
      `✓ Loaded: ${tags.rows.length} tags, ${frames.rows.length} frames, ${meditations.rows.length} meditations, ${musics.rows.length} music tracks`,
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

  private async setupFileDirectory() {
    await fs.mkdir(this.cacheDir, { recursive: true })
    console.log(`✓ Using cache directory: ${this.cacheDir}`)
  }

  private async loadIdMappingsFromCache() {
    try {
      const data = await fs.readFile(this.idMapsFile, 'utf-8')
      const cached = JSON.parse(data)

      // Restore ID mappings from cache
      if (cached.meditationTags) {
        this.idMaps.meditationTags = new Map(
          Object.entries(cached.meditationTags).map(([k, v]) => [parseInt(k), v as string]),
        )
      }
      if (cached.musicTags) {
        this.idMaps.musicTags = new Map(
          Object.entries(cached.musicTags).map(([k, v]) => [parseInt(k), v as string]),
        )
      }
      if (cached.frames) {
        this.idMaps.frames = new Map(
          Object.entries(cached.frames).map(([k, v]) => [k, v as string]),
        )
      }
      if (cached.meditations) {
        this.idMaps.meditations = new Map(
          Object.entries(cached.meditations).map(([k, v]) => [parseInt(k), v as string]),
        )
      }
      if (cached.musics) {
        this.idMaps.musics = new Map(
          Object.entries(cached.musics).map(([k, v]) => [parseInt(k), v as string]),
        )
      }
      if (cached.narrators) {
        this.idMaps.narrators = new Map(
          Object.entries(cached.narrators).map(([k, v]) => [parseInt(k), v as string]),
        )
      }
      if (cached.media) {
        this.idMaps.media = new Map(Object.entries(cached.media).map(([k, v]) => [k, v as string]))
      }

      console.log('✓ Loaded ID mappings from cache')
    } catch (error) {
      // Cache file doesn't exist or is invalid, start fresh
      console.log('ℹ️  No existing ID mappings cache found, starting fresh')
    }
  }

  private async saveIdMappingsToCache() {
    const cache = {
      meditationTags: Object.fromEntries(this.idMaps.meditationTags),
      musicTags: Object.fromEntries(this.idMaps.musicTags),
      frames: Object.fromEntries(this.idMaps.frames),
      meditations: Object.fromEntries(this.idMaps.meditations),
      musics: Object.fromEntries(this.idMaps.musics),
      narrators: Object.fromEntries(this.idMaps.narrators),
      media: Object.fromEntries(this.idMaps.media),
    }

    await fs.writeFile(this.idMapsFile, JSON.stringify(cache, null, 2), 'utf-8')
  }

  private async loadExistingData(data: ImportedData) {
    console.log('\nLoading existing data for resumability...')

    // If we already have ID mappings from cache, skip loading from database
    const hasCachedMappings =
      this.idMaps.meditationTags.size > 0 ||
      this.idMaps.musicTags.size > 0 ||
      this.idMaps.frames.size > 0 ||
      this.idMaps.meditations.size > 0 ||
      this.idMaps.musics.size > 0 ||
      this.idMaps.media.size > 0

    if (hasCachedMappings) {
      console.log('✓ Using cached ID mappings for resumability')
      return
    }

    // Load all existing entries to check for duplicates using natural keys
    const [
      existingNarrators,
      existingFrames,
      existingMusic,
      existingMeditations,
      existingMeditationTags,
      existingMusicTags,
      existingMedia,
    ] = await Promise.all([
      this.payload.find({
        collection: 'narrators',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'frames',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'music',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'meditations',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'meditation-tags',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'music-tags',
        limit: 1000,
      }),
      this.payload.find({
        collection: 'media',
        limit: 1000,
      }),
    ])

    console.log(
      `✓ Loaded existing data: ${existingNarrators.docs.length} narrators, ${existingFrames.docs.length} frames, ${existingMusic.docs.length} music, ${existingMeditations.docs.length} meditations, ${existingMeditationTags.docs.length} meditation tags, ${existingMusicTags.docs.length} music tags, ${existingMedia.docs.length} media files`,
    )

    // Build media filename mapping for deduplication
    existingMedia.docs.forEach((media: any) => {
      if (media.filename) {
        this.idMaps.media.set(media.filename, String(media.id))
      }
    })
  }

  private async downloadFile(storageKey: string, filename: string): Promise<string | null> {
    try {
      // Create cache filename from storage key (sanitize for filesystem)
      const sanitizedKey = storageKey.replace(/[^a-zA-Z0-9.-]/g, '_')
      const cachedPath = path.join(this.cacheDir, `${sanitizedKey}_${filename}`)

      // Check if file already exists in cache
      try {
        await fs.access(cachedPath)
        console.log(`  ✓ Using cached: ${filename}`)
        return cachedPath
      } catch {
        // File doesn't exist, need to download
      }

      // You'll need to replace this URL pattern with your actual storage URL
      // This is likely Google Cloud Storage or AWS S3
      const baseUrl =
        process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/media.sydevelopers.com'
      const fileUrl = `${baseUrl}/${storageKey}`

      console.log(`  Downloading: ${filename}`)

      // Add timeout to fetch
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      try {
        const response = await fetch(fileUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PayloadMigration/1.0)',
          },
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          this.addWarning(`Failed to download ${filename}: ${response.status}`)
          return null
        }

        const buffer = await response.arrayBuffer()
        await fs.writeFile(cachedPath, Buffer.from(buffer))
        console.log(`  ✓ Downloaded and cached: ${filename}`)

        return cachedPath
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.addWarning(`Timeout downloading ${filename}`)
      } else {
        this.addWarning(`Error downloading ${filename}: ${error.message || error}`)
      }
      return null
    }
  }

  private async uploadToPayload(localPath: string, collection: CollectionSlug, metadata: any = {}) {
    try {
      const fileBuffer = await fs.readFile(localPath)
      const filename = path.basename(localPath).replace(/^[^_]+_/, '') // Remove hash prefix
      const mimeType = this.getMimeType(filename)

      // Validate MIME type for music collection
      if (collection === 'music') {
        const acceptedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg']

        // Skip m4a files due to Payload MIME detection issues
        if (filename.toLowerCase().endsWith('.m4a')) {
          this.addSkipped(`m4a file due to MIME detection conflicts: ${filename}`)
          return null
        }

        if (!acceptedMimeTypes.includes(mimeType)) {
          this.addSkipped(`unsupported audio format: ${filename} (${mimeType})`)
          return null
        }
      }

      // For frames collection, we need to provide the file data properly
      if (collection === 'frames') {
        const result = await this.payload.create({
          collection,
          data: metadata,
          file: {
            data: fileBuffer,
            mimetype: mimeType,
            name: filename,
            size: fileBuffer.length,
          },
        })
        console.log(`    ✓ Uploaded: ${filename}`)
        return result
      }

      // For other collections - use explicit file object to control MIME type
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

      // Add locale for collections with localized fields
      if (collection === 'music' || collection === 'meditations') {
        createOptions.locale = 'en'
      }

      const result = await this.payload.create(createOptions)

      console.log(`    ✓ Uploaded: ${filename}`)
      return result
    } catch (error: any) {
      // Check if it's a duration error (video or audio)
      if (error.message?.includes('exceeds maximum allowed duration')) {
        this.addSkipped(`media (exceeds duration limit): ${path.basename(localPath)}`)
        return null
      }
      // Enhanced error logging for slug validation issues
      if (
        error.message?.includes('slug') ||
        error.data?.errors?.some((e: any) => e.field === 'slug')
      ) {
        let slugError = `Slug validation error for ${path.basename(localPath)}: ${error.message}`
        if (error.data?.errors) {
          error.data.errors.forEach((e: any) => {
            if (e.field === 'slug') {
              slugError += ` | Field: ${e.field}, Message: ${e.message}`
            }
          })
        }
        this.addWarning(slugError)
        return null
      }
      this.addWarning(`Failed to upload ${path.basename(localPath)}: ${error.message || error}`)
      return null
    }
  }

  private async uploadMediaWithDeduplication(
    localPath: string,
    metadata: any = {},
  ): Promise<string | null> {
    try {
      const filename = path.basename(localPath).replace(/^[^_]+_/, '') // Remove hash prefix

      // Check if media with this filename already exists
      const existingMediaId = this.idMaps.media.get(filename)
      if (existingMediaId) {
        this.summary.media.reused++
        console.log(`    ✓ Reusing existing media: ${filename}`)
        return existingMediaId
      }

      // Upload new media file
      const uploaded = await this.uploadToPayload(localPath, 'media', metadata)
      if (uploaded) {
        // Add to media mapping for future deduplication
        this.idMaps.media.set(filename, String(uploaded.id))
        this.summary.media.uploaded++
        console.log(`    ✓ Uploaded new media: ${filename}`)
        return String(uploaded.id)
      }

      return null
    } catch (error: any) {
      this.addWarning(
        `Failed to upload media ${path.basename(localPath)}: ${error.message || error}`,
      )
      return null
    }
  }

  private async uploadToPayloadForUpdate(
    localPath: string,
    collection: CollectionSlug,
    recordId: string,
    metadata: any = {},
  ) {
    try {
      const fileBuffer = await fs.readFile(localPath)
      const filename = path.basename(localPath).replace(/^[^_]+_/, '') // Remove hash prefix
      const mimeType = this.getMimeType(filename)

      // Validate MIME type for specific collections
      if (collection === 'music') {
        const acceptedMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg']

        // Skip m4a files due to Payload MIME detection issues
        if (filename.toLowerCase().endsWith('.m4a')) {
          this.addSkipped(`m4a file due to MIME detection conflicts: ${filename}`)
          return null
        }

        if (!acceptedMimeTypes.includes(mimeType)) {
          this.addSkipped(`unsupported audio format: ${filename} (${mimeType})`)
          return null
        }
      }

      // Update existing record with new file and metadata
      const updateOptions: any = {
        collection,
        id: recordId,
        data: metadata,
        file: {
          data: fileBuffer,
          mimetype: mimeType,
          name: filename,
          size: fileBuffer.length,
        },
      }

      // Add locale for collections with localized fields
      if (collection === 'music' || collection === 'meditations') {
        updateOptions.locale = 'en'
      }

      const result = await this.payload.update(updateOptions)

      console.log(`    ✓ Updated with file: ${filename}`)
      return result
    } catch (error: any) {
      this.addWarning(
        `Failed to update ${collection} record with file ${path.basename(localPath)}: ${error.message || error}`,
      )
      return null
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/aac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    }
    return mimeTypes[ext] || 'application/octet-stream'
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

  private async importNarrators() {
    console.log('\nImporting narrators...')

    const narrators = [
      { name: 'Female Narrator', gender: 'female' },
      { name: 'Male Narrator', gender: 'male' },
    ]

    // First, load all existing narrators to populate idMaps
    const existingNarrators = await this.payload.find({
      collection: 'narrators',
      limit: 1000, // Should be enough for narrators
    })

    // Build a map of existing narrators by name
    const existingByName = new Map<string, any>()
    existingNarrators.docs.forEach((narrator: any) => {
      existingByName.set(narrator.name, narrator)
    })

    let createdCount = 0
    let foundCount = 0

    for (let i = 0; i < narrators.length; i++) {
      const narratorData = narrators[i]

      // Check if narrator already exists
      let narrator = existingByName.get(narratorData.name)

      if (narrator) {
        console.log(`    ✓ Found existing narrator: ${narrator.name}`)
        foundCount++
      } else {
        narrator = await this.payload.create({
          collection: 'narrators',
          data: narratorData,
        })
        console.log(`    ✓ Created narrator: ${narrator.name}`)
        createdCount++
      }

      this.idMaps.narrators.set(i, String(narrator.id))
    }

    // Update summary
    this.summary.narrators.created = createdCount
    this.summary.narrators.existing = foundCount

    console.log(
      `✓ Processed ${narrators.length} narrators (${createdCount} created, ${foundCount} existing)`,
    )
  }

  private async importTags(tags: ImportedData['tags']) {
    console.log('\nImporting tags...')

    // Load all existing tags to avoid duplicates
    const [existingMeditationTags, existingMusicTags] = await Promise.all([
      this.payload.find({ collection: 'meditation-tags', limit: 1000 }),
      this.payload.find({ collection: 'music-tags', limit: 1000 }),
    ])

    // Build maps of existing tags by name
    const existingMeditationByName = new Map<string, any>()
    const existingMusicByName = new Map<string, any>()

    existingMeditationTags.docs.forEach((tag: any) => existingMeditationByName.set(tag.name, tag))
    existingMusicTags.docs.forEach((tag: any) => existingMusicByName.set(tag.name, tag))

    let meditationCreated = 0,
      meditationFound = 0
    let musicCreated = 0,
      musicFound = 0

    // Note: We'll create tags in both meditation-tags and music-tags collections
    // since the old system didn't distinguish between them
    for (const tag of tags) {
      const tagData = {
        name: tag.name,
        title: tag.name, // Simple string, not localized object
      }

      // Handle meditation-tags
      let meditationTag = existingMeditationByName.get(tag.name)
      if (meditationTag) {
        console.log(`    ✓ Found existing meditation tag: ${meditationTag.name}`)
        meditationFound++
      } else {
        meditationTag = await this.payload.create({
          collection: 'meditation-tags',
          data: tagData,
        })
        console.log(`    ✓ Created meditation tag: ${meditationTag.name}`)
        meditationCreated++
      }
      this.idMaps.meditationTags.set(tag.id, String(meditationTag.id))

      // Handle music-tags
      let musicTag = existingMusicByName.get(tag.name)
      if (musicTag) {
        console.log(`    ✓ Found existing music tag: ${musicTag.name}`)
        musicFound++
      } else {
        musicTag = await this.payload.create({
          collection: 'music-tags',
          data: tagData,
        })
        console.log(`    ✓ Created music tag: ${musicTag.name}`)
        musicCreated++
      }
      this.idMaps.musicTags.set(tag.id, String(musicTag.id))
    }

    // Update summary
    this.summary.meditationTags.created = meditationCreated
    this.summary.meditationTags.existing = meditationFound
    this.summary.musicTags.created = musicCreated
    this.summary.musicTags.existing = musicFound

    console.log(
      `✓ Processed ${tags.length} tags (meditation: ${meditationCreated} created, ${meditationFound} existing | music: ${musicCreated} created, ${musicFound} existing)`,
    )
  }

  private async importFrames(frames: ImportedData['frames'], attachments: any[], blobs: any[]) {
    console.log('\nImporting frames...')

    // Load existing frames to avoid duplicates
    const existingFrames = await this.payload.find({
      collection: 'frames',
      limit: 1000,
    })

    // Build map of existing frames by name+imageSet combination
    const existingByKey = new Map<string, any>()
    existingFrames.docs.forEach((frame: any) => {
      const key = `${frame.name}-${frame.imageSet}`
      existingByKey.set(key, frame)
    })

    // Valid frame tag values from FRAME_CATEGORIES constant
    const validFrameTags = [
      'mooladhara',
      'swadhistan',
      'nabhi',
      'anahat',
      'vishuddhi',
      'agnya',
      'sahasrara',
      'left',
      'right',
      'center',
      'misc',
    ]

    let createdCount = 0
    let foundCount = 0
    let updatedCount = 0
    let skippedCount = 0

    for (const frame of frames) {
      // Parse comma-separated tags and filter to valid values
      const frameTagNames = frame.tags
        ? frame.tags
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : []

      // Filter to only valid frame tags
      const validTags = frameTagNames.filter((tag) => validFrameTags.includes(tag))
      const frameName = `${frame.category} frame`

      // Get frame attachments (should have both male and female)
      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)
      const maleAttachment = frameAttachments.find((att) => att.name === 'male')
      const femaleAttachment = frameAttachments.find((att) => att.name === 'female')

      // Process male frame if attachment exists
      if (maleAttachment) {
        const maleFrameKey = `${frameName}-male`
        const existingMaleFrame = existingByKey.get(maleFrameKey)

        const frameData = {
          name: frameName,
          imageSet: 'male' as const,
          tags: validTags,
        }

        if (existingMaleFrame && UPDATE_EXISTING_RECORDS) {
          // Update existing male frame metadata (not file)
          try {
            await this.payload.update({
              collection: 'frames',
              id: existingMaleFrame.id,
              data: frameData,
            })
            this.idMaps.frames.set(`${frame.id}_male`, String(existingMaleFrame.id))
            console.log(`    ✓ Updated male frame: ${frameData.name}`)
            updatedCount++
          } catch (error: any) {
            this.addWarning(`Failed to update male frame ${frameName}: ${error.message}`)
            this.idMaps.frames.set(`${frame.id}_male`, String(existingMaleFrame.id))
            foundCount++
          }
        } else if (existingMaleFrame && !UPDATE_EXISTING_RECORDS) {
          console.log(`    ✓ Found existing male frame: ${existingMaleFrame.name} (skipping)`)
          this.idMaps.frames.set(`${frame.id}_male`, String(existingMaleFrame.id))
          foundCount++
        } else {
          // Create new male frame
          const localPath = await this.downloadFile(
            maleAttachment.blob.key,
            maleAttachment.blob.filename,
          )
          if (localPath) {
            const uploaded = await this.uploadToPayload(localPath, 'frames', frameData)
            if (uploaded) {
              this.idMaps.frames.set(`${frame.id}_male`, String(uploaded.id))
              console.log(`    ✓ Created male frame: ${uploaded.name}`)
              createdCount++
            }
          }
        }
      }

      // Process female frame if attachment exists
      if (femaleAttachment) {
        const femaleFrameKey = `${frameName}-female`
        const existingFemaleFrame = existingByKey.get(femaleFrameKey)

        const frameData = {
          name: frameName,
          imageSet: 'female' as const,
          tags: validTags,
        }

        if (existingFemaleFrame && UPDATE_EXISTING_RECORDS) {
          // Update existing female frame metadata (not file)
          try {
            const updated = await this.payload.update({
              collection: 'frames',
              id: existingFemaleFrame.id,
              data: frameData,
            })
            this.idMaps.frames.set(`${frame.id}_female`, String(updated.id))
            console.log(`    ✓ Updated female frame: ${updated.name}`)
            updatedCount++
          } catch (error: any) {
            this.addWarning(`Failed to update female frame ${frameName}: ${error.message}`)
            this.idMaps.frames.set(`${frame.id}_female`, String(existingFemaleFrame.id))
            foundCount++
          }
        } else if (existingFemaleFrame && !UPDATE_EXISTING_RECORDS) {
          console.log(`    ✓ Found existing female frame: ${existingFemaleFrame.name} (skipping)`)
          this.idMaps.frames.set(`${frame.id}_female`, String(existingFemaleFrame.id))
          foundCount++
        } else {
          // Create new female frame
          const localPath = await this.downloadFile(
            femaleAttachment.blob.key,
            femaleAttachment.blob.filename,
          )
          if (localPath) {
            const uploaded = await this.uploadToPayload(localPath, 'frames', frameData)
            if (uploaded) {
              this.idMaps.frames.set(`${frame.id}_female`, String(uploaded.id))
              console.log(`    ✓ Created female frame: ${uploaded.name}`)
              createdCount++
            }
          }
        }
      }

      // Log warning if neither attachment exists
      if (!maleAttachment && !femaleAttachment) {
        this.addSkipped(`frame without attachments: ${frame.category}`)
        skippedCount++
      }
    }

    // Update summary
    this.summary.frames.created = createdCount
    this.summary.frames.existing = foundCount
    this.summary.frames.updated = updatedCount
    this.summary.frames.skipped = skippedCount

    const statusParts = [`${createdCount} created`]
    if (UPDATE_EXISTING_RECORDS && updatedCount > 0) {
      statusParts.push(`${updatedCount} updated`)
    }
    if (foundCount > 0) {
      statusParts.push(`${foundCount} existing`)
    }
    if (skippedCount > 0) {
      statusParts.push(`${skippedCount} skipped`)
    }
    console.log(`✓ Processed ${frames.length} frames (${statusParts.join(', ')})`)
  }

  private async importMusic(
    musics: ImportedData['musics'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
  ) {
    console.log('\nImporting music...')

    // Load existing music to avoid duplicates
    const existingMusic = await this.payload.find({
      collection: 'music',
      limit: 1000,
    })

    // Build map of existing music by slug
    const existingBySlug = new Map<string, any>()
    existingMusic.docs.forEach((musicItem: any) => {
      if (musicItem.slug) {
        existingBySlug.set(musicItem.slug, musicItem)
      }
    })

    let createdCount = 0
    let foundCount = 0
    let updatedCount = 0

    for (const music of musics) {
      // Generate expected slug for this music
      const expectedSlug = (music.title || 'untitled-music')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      // Check if music already exists by slug
      const existingMusicItem = existingBySlug.get(expectedSlug)
      if (existingMusicItem && !UPDATE_EXISTING_RECORDS) {
        console.log(
          `    ✓ Found existing music: ${existingMusicItem.title?.en || existingMusicItem.title} (skipping)`,
        )
        this.idMaps.musics.set(music.id, String(existingMusicItem.id))
        foundCount++
        continue
      }

      // Get music tags from taggings table
      const musicTaggings = taggings.filter(
        (tagging) =>
          tagging.taggable_type === 'Music' &&
          tagging.taggable_id === music.id &&
          tagging.context === 'tags',
      )
      const musicTagIds = musicTaggings
        .map((tagging) => this.idMaps.musicTags.get(tagging.tag_id))
        .filter(Boolean)

      if (musicTagIds.length > 0) {
        console.log(`    ℹ️  Music "${music.title}" has ${musicTagIds.length} tags`)
      }

      // Create music data with simple strings (localization handled by locale parameter)
      const musicData = {
        title: music.title || 'Untitled Music',
        credit: music.credit || '',
        duration: music.duration,
        tags: musicTagIds, // Add tags to music data
      }

      // Handle existing music update or create new music
      if (existingMusicItem && UPDATE_EXISTING_RECORDS) {
        // Update existing music metadata (no file replacement)
        try {
          const updated = await this.payload.update({
            collection: 'music',
            id: existingMusicItem.id,
            data: musicData,
            locale: 'en',
          })
          this.idMaps.musics.set(music.id, String(updated.id))
          console.log(`    ✓ Updated music metadata: ${music.title}`)
          updatedCount++
        } catch (error: any) {
          this.addWarning(`Failed to update music ${music.title}: ${error.message}`)
          // Fall back to using existing ID
          this.idMaps.musics.set(music.id, String(existingMusicItem.id))
          foundCount++
        }
        continue
      }

      // Create new music (with or without audio file)
      const musicAttachments = this.getAttachmentsForRecord('Music', music.id, attachments, blobs)
      const audioAttachment = musicAttachments.find((att) => att.name === 'audio')

      if (audioAttachment) {
        const localPath = await this.downloadFile(
          audioAttachment.blob.key,
          audioAttachment.blob.filename,
        )

        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'music', musicData)
          if (uploaded) {
            this.idMaps.musics.set(music.id, String(uploaded.id))
            console.log(`    ✓ Created music with file: ${music.title}`)
            createdCount++
            continue
          }
        }
      }

      // Create without file if no attachment or upload failed
      try {
        const created = await this.payload.create({
          collection: 'music',
          data: musicData,
          locale: 'en',
        })

        this.idMaps.musics.set(music.id, String(created.id))
        console.log(`    ✓ Created music without file: ${music.title}`)
        createdCount++
      } catch (error: any) {
        this.addWarning(`Failed to create music ${music.title}: ${error.message}`)
      }
    }

    // Update summary
    this.summary.music.created = createdCount
    this.summary.music.existing = foundCount
    this.summary.music.updated = updatedCount

    const statusParts = [`${createdCount} created`]
    if (UPDATE_EXISTING_RECORDS && updatedCount > 0) {
      statusParts.push(`${updatedCount} updated`)
    }
    if (foundCount > 0) {
      statusParts.push(`${foundCount} existing`)
    }
    console.log(`✓ Processed ${musics.length} music tracks (${statusParts.join(', ')})`)
  }

  private async importMeditations(
    meditations: ImportedData['meditations'],
    keyframes: ImportedData['keyframes'],
    taggings: ImportedData['taggings'],
    attachments: any[],
    blobs: any[],
  ) {
    console.log('\nImporting meditations...')

    // Load existing meditations to avoid duplicates
    const existingMeditations = await this.payload.find({
      collection: 'meditations',
      limit: 1000,
    })

    // Build map of existing meditations by slug
    const existingBySlug = new Map<string, any>()
    existingMeditations.docs.forEach((meditation: any) => {
      if (meditation.slug) {
        existingBySlug.set(meditation.slug, meditation)
      }
    })

    let createdCount = 0
    let foundCount = 0
    let updatedCount = 0

    for (const meditation of meditations) {
      // Generate unique slug with duration suffix to avoid conflicts
      const baseSlug = meditation.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const uniqueSlug = meditation.duration
        ? `${baseSlug}-${meditation.duration}`
        : `${baseSlug}-${meditation.id}` // Fallback to ID if no duration

      // Check if meditation already exists by unique slug
      const existingMeditation = existingBySlug.get(uniqueSlug)
      if (existingMeditation && !UPDATE_EXISTING_RECORDS) {
        console.log(`    ✓ Found existing meditation: ${existingMeditation.title} (skipping)`)
        this.idMaps.meditations.set(meditation.id, String(existingMeditation.id))
        foundCount++
        continue
      }

      // Get narrator ID and gender to select appropriate frames
      const narratorIndex = meditation.narrator // This is the narrator index (0 or 1)
      const narratorId = this.idMaps.narrators.get(narratorIndex)
      const narratorGender = narratorIndex === 0 ? 'female' : 'male'

      // Build frames array from keyframes, selecting gender-appropriate frames
      const meditationKeyframes = keyframes.filter((kf) => kf.media_id === meditation.id)
      const frames = meditationKeyframes
        .map((kf) => {
          // Select frame based on narrator gender
          const frameKey = `${kf.frame_id}_${narratorGender}`
          const frameId = this.idMaps.frames.get(frameKey)
          const timestamp = typeof kf.seconds === 'number' ? kf.seconds : 0

          if (!frameId) {
            this.addWarning(
              `${narratorGender} frame ID ${kf.frame_id} not found in idMaps for meditation ${meditation.title}`,
            )
            return null
          }

          return {
            frame: frameId,
            timestamp: timestamp,
          }
        })
        .filter(Boolean) // Remove null entries

      // Sort by timestamp
      frames.sort((a, b) => a.timestamp - b.timestamp)

      // Validate frames array structure and filter out invalid entries
      const validFrames = frames.filter((frame) => {
        if (!frame.frame || typeof frame.frame !== 'string') {
          this.addWarning(
            `Removing invalid frame ID for meditation ${meditation.title}: ${frame.frame}`,
          )
          return false
        }
        if (typeof frame.timestamp !== 'number' || frame.timestamp < 0 || isNaN(frame.timestamp)) {
          this.addWarning(
            `Removing invalid timestamp for meditation ${meditation.title}: ${frame.timestamp}`,
          )
          return false
        }
        return true
      })

      // Check for duplicate timestamps in valid frames
      if (validFrames.length > 0) {
        const timestamps = validFrames.map((f) => f.timestamp)
        const uniqueTimestamps = new Set(timestamps)
        if (timestamps.length !== uniqueTimestamps.size) {
          this.addWarning(
            `Found duplicate timestamps for meditation ${meditation.title}, removing duplicates`,
          )
          const seen = new Set()
          const filteredFrames = validFrames.filter((frame) => {
            if (seen.has(frame.timestamp)) {
              return false
            }
            seen.add(frame.timestamp)
            return true
          })
          validFrames.splice(0, validFrames.length, ...filteredFrames)
        }
      }

      console.log(`    ℹ️  Meditation ${meditation.title} has ${validFrames.length} valid frames`)

      // Get meditation tags from taggings table
      const meditationTaggings = taggings.filter(
        (tagging) =>
          tagging.taggable_type === 'Meditation' &&
          tagging.taggable_id === meditation.id &&
          tagging.context === 'tags',
      )
      const meditationTagIds = meditationTaggings
        .map((tagging) => this.idMaps.meditationTags.get(tagging.tag_id))
        .filter(Boolean)

      // narratorId already retrieved above for debugging

      // Find music tag if specified
      let musicTagId: string | undefined
      if (meditation.music_tag) {
        const musicTag = await this.payload.find({
          collection: 'music-tags',
          where: {
            name: {
              equals: meditation.music_tag,
            },
          },
          limit: 1,
        })

        if (musicTag.docs.length > 0) {
          musicTagId = String(musicTag.docs[0].id)
        }
      }

      // Handle thumbnail and audio attachments
      const meditationAttachments = this.getAttachmentsForRecord(
        'Meditation',
        meditation.id,
        attachments,
        blobs,
      )
      const audioAttachment = meditationAttachments.find((att) => att.name === 'audio')
      const artAttachment = meditationAttachments.find((att) => att.name === 'art')

      let thumbnailId: string | null

      // Upload thumbnail if available (with deduplication)
      if (artAttachment) {
        const localPath = await this.downloadFile(
          artAttachment.blob.key,
          artAttachment.blob.filename,
        )
        if (localPath) {
          thumbnailId = await this.uploadMediaWithDeduplication(localPath, {
            alt: `${meditation.title} thumbnail`,
          })
        }
      }

      const meditationData: any = {
        title: meditation.title, // Keep original title
        locale: 'en',
        slug: uniqueSlug, // Explicit unique slug
        duration: meditation.duration,
        narrator: narratorId,
        tags: meditationTagIds,
        musicTag: musicTagId,
        // If published, set publishAt to today's date so it's immediately published
        publishAt: meditation.published ? new Date().toISOString() : undefined,
        thumbnail: thumbnailId,
      }

      // Only include frames if we have valid frames
      if (validFrames.length > 0) {
        meditationData.frames = validFrames
      }

      let processed = false

      // Handle audio attachment
      if (audioAttachment) {
        const localPath = await this.downloadFile(
          audioAttachment.blob.key,
          audioAttachment.blob.filename,
        )

        if (localPath) {
          if (existingMeditation && UPDATE_EXISTING_RECORDS) {
            // Update existing meditation with correct narrator and frames
            const updated = await this.uploadToPayloadForUpdate(
              localPath,
              'meditations',
              existingMeditation.id,
              meditationData,
            )
            if (updated) {
              this.idMaps.meditations.set(meditation.id, String(updated.id))
              console.log(
                `    ✓ Updated meditation with audio (narrator: ${narratorGender}): ${meditation.title}`,
              )
              updatedCount++
              processed = true
            }
          } else if (!existingMeditation) {
            // Create new meditation
            const created = await this.uploadToPayload(localPath, 'meditations', meditationData)
            if (created) {
              this.idMaps.meditations.set(meditation.id, String(created.id))
              console.log(
                `    ✓ Created meditation with audio (narrator: ${narratorGender}): ${meditation.title}`,
              )
              createdCount++
              processed = true
            }
          }
        }
      }

      // Handle without audio file
      if (!processed) {
        if (existingMeditation && UPDATE_EXISTING_RECORDS) {
          // Update existing meditation metadata
          try {
            const updated = await this.payload.update({
              collection: 'meditations',
              id: existingMeditation.id,
              data: meditationData,
            })
            this.idMaps.meditations.set(meditation.id, String(updated.id))
            console.log(
              `    ✓ Updated meditation metadata (narrator: ${narratorGender}): ${meditation.title}`,
            )
            updatedCount++
          } catch (error: any) {
            this.addWarning(`Failed to update meditation ${meditation.title}: ${error.message}`)
          }
        } else if (!existingMeditation) {
          // Create new meditation without audio
          try {
            const created = await this.payload.create({
              collection: 'meditations',
              data: meditationData,
            })
            this.idMaps.meditations.set(meditation.id, String(created.id))
            console.log(
              `    ✓ Created meditation without audio (narrator: ${narratorGender}): ${meditation.title}`,
            )
            createdCount++
          } catch (error: any) {
            this.addWarning(`Failed to create meditation ${meditation.title}: ${error.message}`)
          }
        }
      }
    }

    // Update summary
    this.summary.meditations.created = createdCount
    this.summary.meditations.existing = foundCount
    this.summary.meditations.updated = updatedCount

    const statusParts = [`${createdCount} created`]
    if (UPDATE_EXISTING_RECORDS && updatedCount > 0) {
      statusParts.push(`${updatedCount} updated`)
    }
    if (foundCount > 0) {
      statusParts.push(`${foundCount} skipped`)
    }
    console.log(`✓ Processed ${meditations.length} meditations (${statusParts.join(', ')})`)
  }

  private printSummary() {
    console.log(chalk.blue('\n📊 MIGRATION SUMMARY'))
    console.log(chalk.blue('=========================================='))

    // Calculate totals
    const totalCreated =
      this.summary.narrators.created +
      this.summary.meditationTags.created +
      this.summary.musicTags.created +
      this.summary.frames.created +
      this.summary.music.created +
      this.summary.meditations.created

    const totalUpdated = UPDATE_EXISTING_RECORDS
      ? this.summary.frames.updated + this.summary.music.updated + this.summary.meditations.updated
      : 0

    const totalExisting =
      this.summary.narrators.existing +
      this.summary.meditationTags.existing +
      this.summary.musicTags.existing +
      this.summary.frames.existing +
      this.summary.music.existing +
      this.summary.meditations.existing

    const totalProcessed = totalCreated + totalUpdated + totalExisting

    // Print collection-by-collection breakdown
    console.log(chalk.cyan('\nBy Collection:'))
    console.log(
      `  📖 Narrators:        ${this.summary.narrators.created} created, ${this.summary.narrators.existing} existing`,
    )
    console.log(
      `  🏷️  Meditation Tags:  ${this.summary.meditationTags.created} created, ${this.summary.meditationTags.existing} existing`,
    )
    console.log(
      `  🏷️  Music Tags:       ${this.summary.musicTags.created} created, ${this.summary.musicTags.existing} existing`,
    )

    const framesParts = [`${this.summary.frames.created} created`]
    if (UPDATE_EXISTING_RECORDS && this.summary.frames.updated > 0) {
      framesParts.push(`${this.summary.frames.updated} updated`)
    }
    framesParts.push(`${this.summary.frames.existing} existing`)
    if (this.summary.frames.skipped > 0) {
      framesParts.push(`${this.summary.frames.skipped} skipped`)
    }
    console.log(`  🖼️  Frames:           ${framesParts.join(', ')}`)

    const musicParts = [`${this.summary.music.created} created`]
    if (UPDATE_EXISTING_RECORDS && this.summary.music.updated > 0) {
      musicParts.push(`${this.summary.music.updated} updated`)
    }
    musicParts.push(`${this.summary.music.existing} existing`)
    console.log(`  🎵 Music:            ${musicParts.join(', ')}`)

    const meditationParts = [`${this.summary.meditations.created} created`]
    if (UPDATE_EXISTING_RECORDS && this.summary.meditations.updated > 0) {
      meditationParts.push(`${this.summary.meditations.updated} updated`)
    }
    meditationParts.push(`${this.summary.meditations.existing} existing`)
    console.log(`  🧘 Meditations:      ${meditationParts.join(', ')}`)

    console.log(
      `  📁 Media Files:      ${this.summary.media.uploaded} uploaded, ${this.summary.media.reused} reused`,
    )

    // Print totals
    console.log(chalk.cyan('\nTotals:'))
    console.log(`  📦 Total Records:    ${totalProcessed}`)
    console.log(`  ✨ Created:          ${totalCreated}`)
    if (UPDATE_EXISTING_RECORDS && totalUpdated > 0) {
      console.log(`  🔄 Updated:          ${totalUpdated}`)
    }
    console.log(`  ♻️  Existing/Skipped: ${totalExisting}`)
    console.log(
      `  📄 Media Files:      ${this.summary.media.uploaded + this.summary.media.reused} total`,
    )

    // Update mode summary
    const modeText = UPDATE_EXISTING_RECORDS ? 'UPDATE MODE' : 'SKIP MODE'
    const modeColor = UPDATE_EXISTING_RECORDS ? chalk.yellow : chalk.cyan
    console.log(modeColor(`\n⚙️  Mode: ${modeText}`))

    if (UPDATE_EXISTING_RECORDS) {
      console.log(chalk.yellow('   • Existing records were updated with new data'))
      console.log(chalk.yellow('   • Files were replaced where applicable'))
    } else {
      console.log(chalk.cyan('   • Existing records were preserved'))
      console.log(chalk.cyan('   • Only new records were created'))
    }

    // Print alerts section
    const totalAlerts =
      this.summary.alerts.warnings.length +
      this.summary.alerts.errors.length +
      this.summary.alerts.skipped.length

    if (totalAlerts > 0) {
      console.log(chalk.cyan('\nAlerts During Migration:'))

      if (this.summary.alerts.errors.length > 0) {
        console.log(chalk.red(`  ❌ Errors (${this.summary.alerts.errors.length}):`))
        this.summary.alerts.errors.forEach((error, index) => {
          console.log(chalk.red(`     ${index + 1}. ${error}`))
        })
      }

      if (this.summary.alerts.warnings.length > 0) {
        console.log(chalk.yellow(`  ⚠️  Warnings (${this.summary.alerts.warnings.length}):`))
        this.summary.alerts.warnings.forEach((warning, index) => {
          console.log(chalk.yellow(`     ${index + 1}. ${warning}`))
        })
      }

      if (this.summary.alerts.skipped.length > 0) {
        console.log(chalk.gray(`  ⏭️  Skipped Items (${this.summary.alerts.skipped.length}):`))
        this.summary.alerts.skipped.forEach((skipped, index) => {
          console.log(chalk.gray(`     ${index + 1}. ${skipped}`))
        })
      }
    } else {
      console.log(chalk.green('\n✨ No alerts - migration completed without issues!'))
    }

    console.log(chalk.blue('\n=========================================='))
  }

  private async cleanup() {
    try {
      await this.tempDb.end()
      execSync('dropdb temp_migration 2>/dev/null || true')
      console.log('✓ Cleaned up temporary database (cache directory preserved for resumability)')
    } catch (error) {
      console.warn('Warning: Could not clean up temp resources')
    }
  }
}

// Run the migration
const dryRun = process.argv.includes('--dry-run')
const importer = new SimpleImporter(dryRun)
importer.run().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
