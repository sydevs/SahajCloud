import { BaseMigrator } from './BaseMigrator'
import { TagsMigrator } from './TagsMigrator'
import chalk from 'chalk'

export class MeditationsMigrator extends BaseMigrator {
  private tagCache: Map<string, string>
  private frameIdMap: Map<any, string>
  private narratorIdMap: Map<any, string> = new Map()
  private mediaFilesTransferred: number = 0
  private mediaSizeBytes: number = 0

  constructor(
    db: any,
    payload: any,
    mediaTransfer: any,
    mappings: any[],
    options: any,
    tagCache: Map<string, string>,
    frameIdMap: Map<any, string>
  ) {
    super(db, payload, mediaTransfer, mappings, options)
    this.tagCache = tagCache
    this.frameIdMap = frameIdMap
  }

  getSourceTable(): string {
    return 'meditations'
  }

  getTargetCollection(): string {
    return 'meditations'
  }

  async initialize(): Promise<void> {
    // Load or create narrators
    await this.loadNarrators()
  }

  private async loadNarrators(): Promise<void> {
    console.log('Loading narrators...')
    
    // Check if narrators table exists
    try {
      const narrators = await this.db.query('SELECT * FROM narrators')
      
      for (const narrator of narrators) {
        // Create narrator in Payload
        if (!this.options.dryRun) {
          const created = await this.payload.create({
            collection: 'narrators',
            data: {
              name: narrator.name,
              gender: narrator.gender || 'male',
              slug: narrator.slug || narrator.name.toLowerCase().replace(/\s+/g, '-'),
            },
            depth: 0,
          })
          
          this.narratorIdMap.set(narrator.id, created.id as string)
        }
      }
      
      console.log(`  Created ${narrators.length} narrators`)
    } catch (error) {
      console.log(chalk.yellow('  No narrators table found, will create default narrator'))
      
      // Create a default narrator
      if (!this.options.dryRun) {
        const defaultNarrator = await this.payload.create({
          collection: 'narrators',
          data: {
            name: 'Default Narrator',
            gender: 'male',
            slug: 'default-narrator',
          },
          depth: 0,
        })
        
        this.narratorIdMap.set('default', defaultNarrator.id as string)
      }
    }
  }

  async transformRow(row: any): Promise<any> {
    const transformed: any = {
      title: row.title || row.name || 'Untitled Meditation',
      locale: row.locale || row.language || 'en',
      legacyId: row.id, // Store original ID for reference
      isPublished: row.is_published || row.published || false,
    }

    // Handle published date
    if (row.published_date || row.published_at) {
      transformed.publishedDate = new Date(row.published_date || row.published_at).toISOString()
    }

    // Handle narrator
    if (row.narrator_id) {
      const narratorId = this.narratorIdMap.get(row.narrator_id)
      if (narratorId) {
        transformed.narrator = narratorId
      } else {
        // Use default narrator
        transformed.narrator = this.narratorIdMap.get('default')
      }
    } else {
      transformed.narrator = this.narratorIdMap.get('default')
    }

    // Handle tags
    if (row.tags) {
      const tagNames = TagsMigrator.parseTags(row.tags)
      const tagIds = await this.getTagIds(tagNames)
      if (tagIds.length > 0) {
        transformed.tags = tagIds
      }
    }

    // Handle music tag
    if (row.music_tag) {
      const musicTagIds = await this.getTagIds([row.music_tag])
      if (musicTagIds.length > 0) {
        transformed.musicTag = musicTagIds[0]
      }
    }

    // Handle thumbnail
    if (row.thumbnail_url || row.image_url) {
      const thumbnailUrl = row.thumbnail_url || row.image_url
      
      if (!this.options.dryRun) {
        try {
          const uploadResult = await this.mediaTransfer.transferFile(
            thumbnailUrl,
            'media',
            {
              alt: {
                en: `${transformed.title} thumbnail`,
                it: `${transformed.title} miniatura`,
              },
            }
          )

          if (uploadResult) {
            transformed.thumbnail = uploadResult.id
            this.mediaFilesTransferred++
            this.mediaSizeBytes += uploadResult.filesize
            console.log(chalk.green(`    ✓ Transferred thumbnail: ${uploadResult.filename}`))
          }
        } catch (error) {
          console.error(chalk.red(`    ✗ Failed to transfer thumbnail: ${thumbnailUrl}`))
          // Continue without thumbnail
        }
      }
    }

    // Handle audio file
    if (row.audio_file || row.audio_url) {
      const audioUrl = row.audio_file || row.audio_url
      
      if (!this.options.dryRun) {
        try {
          const uploadResult = await this.mediaTransfer.transferFile(
            audioUrl,
            'meditations',
            {
              title: transformed.title,
              locale: transformed.locale,
            }
          )

          if (uploadResult) {
            // Duration will be auto-extracted by Payload hooks
            this.mediaFilesTransferred++
            this.mediaSizeBytes += uploadResult.filesize
            console.log(chalk.green(`    ✓ Transferred audio: ${uploadResult.filename}`))
          } else {
            throw new Error('Failed to transfer audio file')
          }
        } catch (error) {
          console.error(chalk.red(`    ✗ Failed to transfer audio: ${audioUrl}`))
          throw error
        }
      } else {
        console.log(chalk.yellow(`    [DRY RUN] Would transfer audio: ${audioUrl}`))
      }
    }

    // Handle frame relationships
    transformed.frames = await this.getFrameRelationships(row.id)

    return transformed
  }

  private async getFrameRelationships(meditationId: any): Promise<any[]> {
    const frames: any[] = []
    
    try {
      // Query meditation_frames join table
      const frameRelations = await this.db.query(
        `SELECT * FROM meditation_frames 
         WHERE meditation_id = $1 
         ORDER BY timestamp ASC`,
        [meditationId]
      )

      for (const relation of frameRelations) {
        const newFrameId = this.frameIdMap.get(relation.frame_id)
        
        if (newFrameId) {
          frames.push({
            frame: newFrameId,
            timestamp: relation.timestamp || 0,
          })
        } else {
          console.warn(`    ⚠ Frame ${relation.frame_id} not found in mapping`)
        }
      }

      if (frames.length > 0) {
        console.log(chalk.cyan(`    → Added ${frames.length} frame relationships`))
      }
    } catch (error) {
      console.log(chalk.yellow('    No meditation_frames table found'))
    }

    return frames
  }

  private async getTagIds(tagNames: string[]): Promise<string[]> {
    const ids: string[] = []

    for (const name of tagNames) {
      const normalizedName = name.toLowerCase().trim()
      
      // Check cache
      if (this.tagCache.has(normalizedName)) {
        ids.push(this.tagCache.get(normalizedName)!)
        continue
      }

      // Query from database
      try {
        const result = await this.payload.find({
          collection: 'tags',
          where: {
            'title.en': {
              equals: normalizedName,
            },
          },
          limit: 1,
        })

        if (result.docs.length > 0) {
          const id = result.docs[0].id as string
          this.tagCache.set(normalizedName, id)
          ids.push(id)
        }
      } catch (error) {
        console.warn(`Tag not found: ${name}`)
      }
    }

    return ids
  }

  getResult(): any {
    const result = super.getResult()
    return {
      ...result,
      mediaTransferred: this.mediaFilesTransferred,
      mediaSizeBytes: this.mediaSizeBytes,
    }
  }
}