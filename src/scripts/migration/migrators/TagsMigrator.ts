import { BaseMigrator } from './BaseMigrator'
import chalk from 'chalk'

export class TagsMigrator extends BaseMigrator {
  private tagCache: Map<string, string> = new Map()
  private processedTags: Set<string> = new Set()

  getSourceTable(): string {
    return 'tags'
  }

  getTargetCollection(): string {
    return 'tags'
  }

  async migrate(): Promise<any> {
    console.log(chalk.blue('\n=== Migrating Tags (with comma-separated transformation) ==='))
    
    // First, collect all unique tags from all tables that might have comma-separated tags
    await this.collectAllTags()
    
    // Then create tag documents
    await this.createTagDocuments()
    
    return this.getResult()
  }

  private async collectAllTags(): Promise<void> {
    console.log('Collecting tags from source tables...')
    
    // Tables that might contain comma-separated tags
    const tagSources = [
      { table: 'tags', column: 'name' },
      { table: 'meditations', column: 'tags' },
      { table: 'music', column: 'tags' },
      { table: 'frames', column: 'tags' },
    ]

    for (const source of tagSources) {
      try {
        const rows = await this.db.query(
          `SELECT DISTINCT ${source.column} FROM ${source.table} WHERE ${source.column} IS NOT NULL`
        )
        
        for (const row of rows) {
          const tagValue = row[source.column]
          if (tagValue) {
            // Split by comma and process each tag
            const tags = tagValue.split(',').map((t: string) => t.trim()).filter(Boolean)
            tags.forEach((tag: string) => {
              this.processedTags.add(tag.toLowerCase())
            })
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`  Table ${source.table} not found or no ${source.column} column`))
      }
    }

    console.log(`  Found ${this.processedTags.size} unique tags`)
  }

  private async createTagDocuments(): Promise<void> {
    const totalTags = this.processedTags.size
    let current = 0

    for (const tag of this.processedTags) {
      current++
      try {
        const tagData = {
          title: {
            en: tag,
            it: tag, // Default to same value for Italian, can be updated later
          },
        }

        if (!this.options.dryRun) {
          const created = await this.payload.create({
            collection: 'tags',
            data: tagData,
            depth: 0,
          })
          
          // Cache the tag ID for use in other migrators
          this.tagCache.set(tag, created.id as string)
        }

        this.successCount++
        
        if (current % 10 === 0) {
          console.log(`  Progress: ${current}/${totalTags}`)
        }
      } catch (error) {
        this.failedCount++
        this.errors.push({
          row: current,
          message: error instanceof Error ? error.message : String(error),
          data: { tag },
        })
        console.error(chalk.red(`  Failed to create tag "${tag}": ${error}`))
      }
    }
  }

  async transformRow(row: any): Promise<any> {
    // This migrator doesn't use the standard row-by-row transformation
    // Instead, it processes all tags at once in the migrate() method
    return row
  }

  // Helper method to get tag IDs from tag names (for use by other migrators)
  async getTagIds(tagNames: string | string[]): Promise<string[]> {
    const names = Array.isArray(tagNames) ? tagNames : [tagNames]
    const ids: string[] = []

    for (const name of names) {
      const normalizedName = name.toLowerCase().trim()
      
      // Check cache first
      if (this.tagCache.has(normalizedName)) {
        ids.push(this.tagCache.get(normalizedName)!)
        continue
      }

      // Query from database
      try {
        const result = await this.payload.find({
          collection: 'tags',
          where: {
            title: {
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

  // Static helper to parse comma-separated tags
  static parseTags(tagString: string | null): string[] {
    if (!tagString) return []
    return tagString
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => tag.toLowerCase())
  }

  getTagCache(): Map<string, string> {
    return this.tagCache
  }
}