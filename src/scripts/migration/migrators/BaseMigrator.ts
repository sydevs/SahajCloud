import type { Payload } from 'payload'
import type { DatabaseConnection } from '../config/database'
import type { FieldMapping, MigrationResult, MigrationError } from '../types'
import type { MediaTransfer } from '../utils/mediaTransfer'
import chalk from 'chalk'
import ora from 'ora'

export abstract class BaseMigrator {
  protected errors: MigrationError[] = []
  protected successCount: number = 0
  protected failedCount: number = 0

  constructor(
    protected db: DatabaseConnection,
    protected payload: Payload,
    protected mediaTransfer: MediaTransfer,
    protected mappings: FieldMapping[],
    protected options: { batchSize: number; dryRun: boolean }
  ) {}

  abstract getSourceTable(): string
  abstract getTargetCollection(): string
  abstract transformRow(row: any): Promise<any>

  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now()
    const tableName = this.getSourceTable()
    const collection = this.getTargetCollection()

    console.log(chalk.blue(`\n=== Migrating ${tableName} to ${collection} ===`))

    // Get total count
    const totalCount = await this.db.getTableCount(tableName)
    console.log(`Total records: ${totalCount}`)

    if (this.options.dryRun) {
      console.log(chalk.yellow('DRY RUN MODE - No data will be written'))
    }

    // Process in batches
    const batchSize = this.options.batchSize
    const totalBatches = Math.ceil(totalCount / batchSize)

    const spinner = ora('Processing...').start()

    for (let batch = 0; batch < totalBatches; batch++) {
      const offset = batch * batchSize
      spinner.text = `Processing batch ${batch + 1}/${totalBatches} (${offset}/${totalCount})`

      const rows = await this.db.query(
        `SELECT * FROM ${tableName} LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      )

      await this.processBatch(rows, offset)
    }

    spinner.succeed(`Completed migration of ${collection}`)

    const duration = (Date.now() - startTime) / 1000
    console.log(`Duration: ${duration.toFixed(2)} seconds`)

    return {
      collection,
      total: totalCount,
      success: this.successCount,
      failed: this.failedCount,
      errors: this.errors,
    }
  }

  protected async processBatch(rows: any[], offset: number): Promise<void> {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNumber = offset + i + 1

      try {
        // Apply field mappings
        const mappedData = this.applyMappings(row)
        
        // Apply custom transformations
        const transformedData = await this.transformRow(mappedData)

        // Validate data
        await this.validateData(transformedData)

        // Create document if not dry run
        if (!this.options.dryRun) {
          await this.createDocument(transformedData)
        }

        this.successCount++
      } catch (error) {
        this.failedCount++
        this.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : String(error),
          data: row,
        })

        if (this.errors.length <= 5) {
          console.error(chalk.red(`  Row ${rowNumber}: ${error}`))
        }
      }
    }
  }

  protected applyMappings(row: any): any {
    const mapped: any = {}

    for (const mapping of this.mappings) {
      const value = row[mapping.sourceColumn]
      
      if (value !== null && value !== undefined) {
        if (mapping.transform) {
          mapped[mapping.targetField] = mapping.transform(value, row)
        } else {
          mapped[mapping.targetField] = value
        }
      }
    }

    return mapped
  }

  protected async validateData(data: any): Promise<void> {
    // Basic validation - can be overridden by subclasses
    const collection = this.getTargetCollection()
    
    // Check required fields based on collection
    const requiredFields = this.getRequiredFields()
    
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`)
      }
    }
  }

  protected getRequiredFields(): string[] {
    const collection = this.getTargetCollection()
    
    const requiredFieldsMap: Record<string, string[]> = {
      tags: ['title'],
      music: ['title'],
      frames: ['name', 'imageSet'],
      meditations: ['title', 'locale'],
    }

    return requiredFieldsMap[collection] || []
  }

  protected async createDocument(data: any): Promise<void> {
    await this.payload.create({
      collection: this.getTargetCollection() as any,
      data,
      depth: 0,
    })
  }

  protected async handleRelationship(
    foreignId: any,
    targetCollection: string
  ): Promise<string | null> {
    if (!foreignId) return null

    // In a real migration, you'd need to map old IDs to new IDs
    // This is a simplified version
    try {
      const existing = await this.payload.find({
        collection: targetCollection as any,
        where: {
          legacyId: {
            equals: foreignId,
          },
        },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        return existing.docs[0].id
      }
    } catch {
      // Collection might not have legacyId field
    }

    return null
  }

  getResult(): MigrationResult {
    return {
      collection: this.getTargetCollection(),
      total: this.successCount + this.failedCount,
      success: this.successCount,
      failed: this.failedCount,
      errors: this.errors,
    }
  }
}