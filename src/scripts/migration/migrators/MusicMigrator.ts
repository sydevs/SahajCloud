import { BaseMigrator } from './BaseMigrator'
import { TagsMigrator } from './TagsMigrator'
import chalk from 'chalk'

export class MusicMigrator extends BaseMigrator {
  private tagCache: Map<string, string>
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
    return 'music'
  }

  getTargetCollection(): string {
    return 'music'
  }

  async transformRow(row: any): Promise<any> {
    const transformed: any = {
      title: {
        en: row.title || row.name || 'Untitled',
        it: row.title_it || row.title || row.name || 'Senza titolo',
      },
      // Slug will be auto-generated from title
      credit: {
        en: row.credit || row.artist || '',
        it: row.credit_it || row.credit || row.artist || '',
      },
      legacyId: row.id, // Store original ID for reference
    }

    // Handle tags
    if (row.tags) {
      const tagNames = TagsMigrator.parseTags(row.tags)
      const tagIds = await this.getTagIds(tagNames)
      if (tagIds.length > 0) {
        transformed.tags = tagIds
      }
    }

    // Handle audio file
    if (row.audio_file || row.file_path || row.url) {
      const audioUrl = row.audio_file || row.file_path || row.url
      
      if (!this.options.dryRun) {
        try {
          const uploadResult = await this.mediaTransfer.transferFile(
            audioUrl,
            'music',
            {
              title: transformed.title,
              credit: transformed.credit,
            }
          )

          if (uploadResult) {
            // The upload result contains the file data
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
    // For music collection, we need to handle the file upload specially
    // The file should already be transferred in transformRow
    await this.payload.create({
      collection: 'music',
      data,
      depth: 0,
    })
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