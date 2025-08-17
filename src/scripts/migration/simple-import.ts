#!/usr/bin/env tsx

import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../../payload.config'
import chalk from 'chalk'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

interface ImportedData {
  tags: Array<{ id: number; name: string }>
  frames: Array<{ id: number; category: string; tags: string }>
  meditations: Array<{ 
    id: number; 
    title: string; 
    duration?: number; 
    published: boolean;
    narrator: number;
    music_tag?: string;
  }>
  musics: Array<{ 
    id: number; 
    title: string; 
    duration?: number; 
    credit?: string;
  }>
  keyframes: Array<{
    media_type: string;
    media_id: number;
    frame_id: number;
    seconds?: number;
  }>
  attachments: Array<{
    name: string;
    record_type: string;
    record_id: number;
    blob_id: number;
  }>
  blobs: Array<{
    id: number;
    key: string;
    filename: string;
    content_type: string;
    byte_size: number;
  }>
}

class SimpleImporter {
  private payload: any
  private tempDb: Client
  private tempDir: string
  private dryRun: boolean
  private idMaps = {
    tags: new Map<number, string>(),
    frames: new Map<number, string>(),
    meditations: new Map<number, string>(),
    musics: new Map<number, string>(),
    narrators: new Map<number, string>(),
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
    this.tempDir = path.join(os.tmpdir(), 'payload-migration-files')
  }

  async run() {
    const modeText = this.dryRun ? ' (DRY RUN)' : ''
    console.log(chalk.blue(`\n🚀 Simple Migration from Heroku Postgres Dump${modeText}\n`))

    try {
      // 1. Import dump to temporary database
      await this.setupTempDatabase()

      // 2. Initialize Payload (skip in dry run for speed)
      if (!this.dryRun) {
        console.log('Initializing Payload CMS...')
        const payloadConfig = await configPromise
        this.payload = await getPayload({ config: payloadConfig })
        console.log('✓ Payload CMS initialized')

        // 3. Setup file handling
        await this.setupFileDirectory()
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
        console.log(`- ${data.attachments.length} file attachments`)
        
        // Show sample data
        console.log('\nSample tags:', data.tags.slice(0, 5).map(t => t.name).join(', '))
        console.log('Sample frames:', data.frames.slice(0, 3).map(f => f.category).join(', '))
        
        console.log(chalk.yellow('\n✅ Dry run completed - no data was imported'))
        return
      }

      // 5. Import in order
      await this.importNarrators()
      await this.importTags(data.tags)
      await this.importFrames(data.frames, data.tags, data.attachments, data.blobs)
      await this.importMusic(data.musics, data.attachments, data.blobs)
      await this.importMeditations(data.meditations, data.keyframes, data.attachments, data.blobs)

      console.log(chalk.green('\n✅ Migration completed successfully!'))

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
      execSync(`pg_restore -d temp_migration --no-owner --no-privileges --clean --if-exists src/scripts/migration/data.bin 2>/dev/null || true`)
      
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

    const [tags, frames, meditations, musics, keyframes, attachments, blobs] = await Promise.all([
      this.tempDb.query('SELECT id, name FROM tags ORDER BY id'),
      this.tempDb.query('SELECT id, category, tags FROM frames ORDER BY id'),
      this.tempDb.query('SELECT id, title, duration, published, narrator, music_tag FROM meditations WHERE published = true ORDER BY id'),
      this.tempDb.query('SELECT id, title, duration, credit FROM musics ORDER BY id'),
      this.tempDb.query('SELECT media_type, media_id, frame_id, seconds FROM keyframes WHERE media_type = \'Meditation\' ORDER BY media_id, seconds'),
      this.tempDb.query('SELECT name, record_type, record_id, blob_id FROM active_storage_attachments'),
      this.tempDb.query('SELECT id, key, filename, content_type, byte_size FROM active_storage_blobs'),
    ])

    console.log(`✓ Loaded: ${tags.rows.length} tags, ${frames.rows.length} frames, ${meditations.rows.length} meditations, ${musics.rows.length} music tracks`)

    return {
      tags: tags.rows,
      frames: frames.rows,
      meditations: meditations.rows,
      musics: musics.rows,
      keyframes: keyframes.rows,
      attachments: attachments.rows,
      blobs: blobs.rows,
    }
  }

  private async setupFileDirectory() {
    await fs.mkdir(this.tempDir, { recursive: true })
    console.log(`✓ Created temp directory: ${this.tempDir}`)
  }

  private async downloadFile(storageKey: string, filename: string): Promise<string | null> {
    try {
      // You'll need to replace this URL pattern with your actual storage URL
      // This is likely Google Cloud Storage or AWS S3
      const baseUrl = process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/media.sydevelopers.com'
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
          }
        })
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          console.warn(`  ⚠️  Failed to download ${filename}: ${response.status}`)
          return null
        }

        const buffer = await response.arrayBuffer()
        const localPath = path.join(this.tempDir, `${storageKey}_${filename}`)
        await fs.writeFile(localPath, Buffer.from(buffer))
        
        return localPath
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`  ⚠️  Timeout downloading ${filename}`)
      } else {
        console.warn(`  ⚠️  Error downloading ${filename}:`, error.message || error)
      }
      return null
    }
  }

  private async uploadToPayload(localPath: string, collection: string, metadata: any = {}): Promise<any> {
    try {
      const fileBuffer = await fs.readFile(localPath)
      const filename = path.basename(localPath).replace(/^[^_]+_/, '') // Remove hash prefix
      const mimeType = this.getMimeType(filename)

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

      // For other collections
      const result = await this.payload.create({
        collection,
        data: metadata,
        filePath: localPath,
      })

      console.log(`    ✓ Uploaded: ${filename}`)
      return result
    } catch (error: any) {
      // Check if it's a duration error (video or audio)
      if (error.message?.includes('exceeds maximum allowed duration')) {
        console.warn(`    ⚠️  Skipping media (exceeds duration limit): ${path.basename(localPath)}`)
        return null
      }
      console.warn(`    ⚠️  Failed to upload ${path.basename(localPath)}:`, error.message || error)
      return null
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  private getAttachmentsForRecord(recordType: string, recordId: number, attachments: any[], blobs: any[]): any[] {
    return attachments
      .filter(att => att.record_type === recordType && att.record_id === recordId)
      .map(att => {
        const blob = blobs.find(b => b.id === att.blob_id)
        return blob ? { ...att, blob } : null
      })
      .filter(Boolean)
  }

  private async importNarrators() {
    console.log('\nCreating narrators...')
    
    const narrators = [
      { name: 'Female Narrator', gender: 'female', slug: 'female-narrator' },
      { name: 'Male Narrator', gender: 'male', slug: 'male-narrator' },
    ]

    for (let i = 0; i < narrators.length; i++) {
      // Check if narrator already exists to avoid duplicates
      const existing = await this.payload.find({
        collection: 'narrators',
        where: {
          slug: {
            equals: narrators[i].slug
          }
        },
        limit: 1,
      })

      let created
      if (existing.docs.length > 0) {
        created = existing.docs[0]
        console.log(`    ✓ Found existing narrator: ${created.name}`)
      } else {
        created = await this.payload.create({
          collection: 'narrators',
          data: narrators[i],
        })
        console.log(`    ✓ Created narrator: ${created.name}`)
      }
      
      this.idMaps.narrators.set(i, created.id)
    }

    console.log(`✓ Processed ${narrators.length} narrators`)
  }

  private async importTags(tags: ImportedData['tags']) {
    console.log('\nImporting tags...')
    
    for (const tag of tags) {
      // Check if tag already exists
      const existing = await this.payload.find({
        collection: 'tags',
        where: {
          title: {
            equals: tag.name
          }
        },
        locale: 'en',
        limit: 1,
      })

      let created
      if (existing.docs.length > 0) {
        created = existing.docs[0]
        console.log(`    ✓ Found existing tag: ${created.title}`)
      } else {
        created = await this.payload.create({
          collection: 'tags',
          data: {
            title: tag.name,
          },
          locale: 'en',
        })
        console.log(`    ✓ Created tag: ${created.title}`)
      }
      
      this.idMaps.tags.set(tag.id, created.id)
    }

    console.log(`✓ Processed ${tags.length} tags`)
  }

  private async importFrames(frames: ImportedData['frames'], allTags: ImportedData['tags'], attachments: any[], blobs: any[]) {
    console.log('\nImporting frames...')
    
    for (const frame of frames) {
      // Parse comma-separated tags
      const frameTagNames = frame.tags
        ? frame.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []
      
      // Find tag IDs
      const tagIds: string[] = []
      for (const tagName of frameTagNames) {
        const tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
        if (tag && this.idMaps.tags.has(tag.id)) {
          tagIds.push(this.idMaps.tags.get(tag.id)!)
        }
      }

      // Determine imageSet from category
      const imageSet = this.determineImageSet(frame.category)

      // Get frame attachments (images/videos)
      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)
      
      let frameData: any = {
        name: `${frame.category} frame`,
        imageSet,
        tags: tagIds,
        legacyId: frame.id,
      }

      // If there are file attachments, upload the first one as the frame image/video
      if (frameAttachments.length > 0) {
        const attachment = frameAttachments[0] // Take first attachment
        const localPath = await this.downloadFile(attachment.blob.key, attachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'frames', frameData)
          if (uploaded) {
            this.idMaps.frames.set(frame.id, uploaded.id)
            continue
          }
        }
      }

      // Skip frames without files (frames collection requires uploads)
      console.log(`    ⚠️  Skipping frame without file: ${frame.category}`)
    }

    console.log(`✓ Imported ${frames.length} frames`)
  }

  private determineImageSet(category: string): 'male' | 'female' {
    // You can adjust this logic based on your specific categories
    const femaleCategories = ['female', 'woman', 'goddess']
    return femaleCategories.some(cat => category?.toLowerCase().includes(cat)) ? 'female' : 'male'
  }

  private async importMusic(musics: ImportedData['musics'], attachments: any[], blobs: any[]) {
    console.log('\nImporting music...')
    
    for (const music of musics) {
      // Create localized title for proper slug generation
      const musicData = {
        title: {
          en: music.title || 'Untitled Music',
          it: music.title || 'Musica Senza Titolo',
        },
        credit: {
          en: music.credit || '',
          it: music.credit || '',
        },
        duration: music.duration,
        legacyId: music.id,
      }

      // Get music audio attachments
      const musicAttachments = this.getAttachmentsForRecord('Music', music.id, attachments, blobs)
      const audioAttachment = musicAttachments.find(att => att.name === 'audio')
      
      if (audioAttachment) {
        const localPath = await this.downloadFile(audioAttachment.blob.key, audioAttachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'music', musicData)
          if (uploaded) {
            this.idMaps.musics.set(music.id, uploaded.id)
            console.log(`    ✓ Created music with file: ${music.title}`)
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
        
        this.idMaps.musics.set(music.id, created.id)
        console.log(`    ✓ Created music without file: ${music.title}`)
      } catch (error: any) {
        console.warn(`    ⚠️  Failed to create music ${music.title}:`, error.message)
      }
    }

    console.log(`✓ Processed ${musics.length} music tracks`)
  }

  private async importMeditations(meditations: ImportedData['meditations'], keyframes: ImportedData['keyframes'], attachments: any[], blobs: any[]) {
    console.log('\nImporting meditations...')
    
    for (const meditation of meditations) {
      // Build frames array from keyframes
      const meditationKeyframes = keyframes.filter(kf => kf.media_id === meditation.id)
      const frames = meditationKeyframes.map(kf => ({
        frame: this.idMaps.frames.get(kf.frame_id),
        timestamp: kf.seconds || 0,
      })).filter(f => f.frame) // Only include frames that exist

      // Sort by timestamp
      frames.sort((a, b) => a.timestamp - b.timestamp)

      // Get narrator ID
      const narratorId = this.idMaps.narrators.get(meditation.narrator)

      // Find music tag if specified
      let musicTagId: string | undefined
      if (meditation.music_tag) {
        const musicTag = await this.payload.find({
          collection: 'tags',
          where: {
            title: {
              equals: meditation.music_tag,
            },
          },
          limit: 1,
        })
        
        if (musicTag.docs.length > 0) {
          musicTagId = musicTag.docs[0].id
        }
      }

      // Handle thumbnail and audio attachments
      const meditationAttachments = this.getAttachmentsForRecord('Meditation', meditation.id, attachments, blobs)
      const audioAttachment = meditationAttachments.find(att => att.name === 'audio')
      const artAttachment = meditationAttachments.find(att => att.name === 'art')

      let thumbnailId: string | undefined
      
      // Upload thumbnail if available
      if (artAttachment) {
        const localPath = await this.downloadFile(artAttachment.blob.key, artAttachment.blob.filename)
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'media', {
            alt: `${meditation.title} thumbnail`,
          })
          if (uploaded) {
            thumbnailId = uploaded.id
          }
        }
      }

      const meditationData = {
        title: meditation.title,
        locale: 'en',
        duration: meditation.duration,
        narrator: narratorId,
        musicTag: musicTagId,
        frames: frames,
        isPublished: meditation.published,
        thumbnail: thumbnailId,
        legacyId: meditation.id,
      }

      // Upload audio and create meditation
      if (audioAttachment) {
        const localPath = await this.downloadFile(audioAttachment.blob.key, audioAttachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'meditations', meditationData)
          if (uploaded) {
            this.idMaps.meditations.set(meditation.id, uploaded.id)
            continue
          }
        }
      }

      // Create without audio file if no attachment or upload failed
      const created = await this.payload.create({
        collection: 'meditations',
        data: meditationData,
      })
      
      this.idMaps.meditations.set(meditation.id, created.id)
    }

    console.log(`✓ Imported ${meditations.length} meditations`)
  }

  private async cleanup() {
    try {
      await this.tempDb.end()
      execSync('dropdb temp_migration 2>/dev/null || true')
      await fs.rm(this.tempDir, { recursive: true, force: true })
      console.log('✓ Cleaned up temporary database and files')
    } catch (error) {
      console.warn('Warning: Could not clean up temp resources')
    }
  }
}

// Run the migration
const dryRun = process.argv.includes('--dry-run')
const importer = new SimpleImporter(dryRun)
importer.run().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})