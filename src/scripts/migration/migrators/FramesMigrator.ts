import { BaseMigrator } from './BaseMigrator'
import { TagsMigrator } from './TagsMigrator'
import chalk from 'chalk'

export class FramesMigrator extends BaseMigrator {
  private tagCache: Map<string, string>
  private frameIdMap: Map<any, string> = new Map() // Maps old IDs to new IDs
  private mediaFilesTransferred: number = 0
  private mediaSizeBytes: number = 0

  constructor(
    db: any,
    payload: any,
    mediaTransfer: any,
    mappings: any[],
    options: any,
    tagCache: Map<string, string>
  ) {
    super(db, payload, mediaTransfer, mappings, options)
    this.tagCache = tagCache
  }

  getSourceTable(): string {
    return 'frames'
  }

  getTargetCollection(): string {
    return 'frames'
  }

  async transformRow(row: any): Promise<any> {
    const transformed: any = {
      name: row.name || row.title || `Frame ${row.id}`,
      legacyId: row.id, // Store original ID for reference
    }

    // Handle imageSet (gender)
    if (row.image_set || row.gender || row.type) {
      const imageSetValue = (row.image_set || row.gender || row.type || '').toLowerCase()
      if (imageSetValue.includes('male') && !imageSetValue.includes('female')) {
        transformed.imageSet = 'male'
      } else if (imageSetValue.includes('female') || imageSetValue.includes('woman')) {
        transformed.imageSet = 'female'
      } else {
        // Default to male if unclear
        transformed.imageSet = 'male'
        console.log(chalk.yellow(`    ⚠ Unclear imageSet for frame ${row.id}, defaulting to 'male'`))
      }
    } else {
      transformed.imageSet = 'male' // Default
    }

    // Handle tags
    if (row.tags) {
      const tagNames = TagsMigrator.parseTags(row.tags)
      const tagIds = await this.getTagIds(tagNames)
      if (tagIds.length > 0) {
        transformed.tags = tagIds
      }
    }

    // Handle media file (image or video)
    const mediaUrl = row.file_path || row.image_url || row.video_url || row.url
    
    if (mediaUrl) {
      if (!this.options.dryRun) {
        try {
          const uploadResult = await this.mediaTransfer.transferFile(
            mediaUrl,
            'frames',
            {
              name: transformed.name,
              imageSet: transformed.imageSet,
            }
          )

          if (uploadResult) {
            // Dimensions and duration will be auto-populated by Payload hooks
            this.mediaFilesTransferred++
            this.mediaSizeBytes += uploadResult.filesize
            
            console.log(chalk.green(`    ✓ Transferred media: ${uploadResult.filename}`))
          } else {
            throw new Error('Failed to transfer media file')
          }
        } catch (error) {
          console.error(chalk.red(`    ✗ Failed to transfer media: ${mediaUrl}`))
          throw error
        }
      } else {
        console.log(chalk.yellow(`    [DRY RUN] Would transfer media: ${mediaUrl}`))
      }
    } else {
      throw new Error(`No media file found for frame ${row.id}`)
    }

    return transformed
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

  async createDocument(data: any): Promise<void> {
    const created = await this.payload.create({
      collection: 'frames',
      data,
      depth: 0,
    })

    // Store the mapping of old ID to new ID
    if (data.legacyId) {
      this.frameIdMap.set(data.legacyId, created.id as string)
    }
  }

  getFrameIdMap(): Map<any, string> {
    return this.frameIdMap
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