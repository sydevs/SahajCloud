import { getPayload } from 'payload'
import type { Payload } from 'payload'
import configPromise from '@payload-config'
import fs from 'fs/promises'
import path from 'path'
import csv from 'csv-parse'
import { DataValidator } from './validation'
import type { 
  ImportResult, 
  ImportError, 
  ImportOptions, 
  CollectionImportConfig 
} from './types'

export abstract class BaseImporter {
  protected payload: Payload | null = null
  protected config: CollectionImportConfig
  protected validator: DataValidator

  constructor(config: CollectionImportConfig) {
    this.config = config
    this.validator = new DataValidator(config.validationRules)
  }

  async initialize(): Promise<void> {
    this.payload = await getPayload({ config: configPromise })
  }

  async importFromCSV(filePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const {
      dryRun = false,
      validateOnly = false,
      batchSize = 100,
      onProgress
    } = options

    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      errors: []
    }

    try {
      // Read and parse CSV file
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const records = await this.parseCSV(fileContent)
      
      const total = records.length
      console.log(`Found ${total} records to import`)

      // Process records in batches
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, Math.min(i + batchSize, records.length))
        const batchResult = await this.processBatch(batch, i, {
          dryRun,
          validateOnly
        })

        result.imported += batchResult.imported
        result.failed += batchResult.failed
        result.errors.push(...batchResult.errors)

        if (onProgress) {
          onProgress(Math.min(i + batchSize, total), total)
        }

        // Stop if too many errors
        if (result.errors.length > 100) {
          result.success = false
          console.error('Too many errors, stopping import')
          break
        }
      }

      result.success = result.errors.length === 0
    } catch (error) {
      result.success = false
      result.errors.push({
        row: 0,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }

    return result
  }

  async importFromJSON(filePath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const {
      dryRun = false,
      validateOnly = false,
      batchSize = 100,
      onProgress
    } = options

    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      errors: []
    }

    try {
      // Read and parse JSON file
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const records = JSON.parse(fileContent)
      
      if (!Array.isArray(records)) {
        throw new Error('JSON file must contain an array of records')
      }

      const total = records.length
      console.log(`Found ${total} records to import`)

      // Process records in batches
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, Math.min(i + batchSize, records.length))
        const batchResult = await this.processBatch(batch, i, {
          dryRun,
          validateOnly
        })

        result.imported += batchResult.imported
        result.failed += batchResult.failed
        result.errors.push(...batchResult.errors)

        if (onProgress) {
          onProgress(Math.min(i + batchSize, total), total)
        }

        // Stop if too many errors
        if (result.errors.length > 100) {
          result.success = false
          console.error('Too many errors, stopping import')
          break
        }
      }

      result.success = result.errors.length === 0
    } catch (error) {
      result.success = false
      result.errors.push({
        row: 0,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }

    return result
  }

  private async processBatch(
    records: Record<string, any>[], 
    startIndex: number,
    options: { dryRun: boolean; validateOnly: boolean }
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      errors: []
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const rowIndex = startIndex + i + 1 // +1 for header row

      try {
        // Validate record
        const validationErrors = this.validator.validate(record, rowIndex)
        if (validationErrors.length > 0) {
          result.errors.push(...validationErrors)
          result.failed++
          continue
        }

        // Transform data if needed
        let transformedData = record
        if (this.config.transform) {
          transformedData = this.config.transform(record)
        }

        // Run beforeImport hook if defined
        if (this.config.beforeImport) {
          transformedData = await this.config.beforeImport(transformedData)
        }

        // Skip actual import if validateOnly or dryRun
        if (options.validateOnly || options.dryRun) {
          result.imported++
          continue
        }

        // Import the record
        if (!this.payload) {
          throw new Error('Payload not initialized')
        }

        await this.payload.create({
          collection: this.config.collection,
          data: transformedData,
        })

        result.imported++
      } catch (error) {
        result.failed++
        result.errors.push({
          row: rowIndex,
          message: error instanceof Error ? error.message : 'Unknown error',
          data: record
        })
      }
    }

    return result
  }

  private async parseCSV(content: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      csv.parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }, (err, records) => {
        if (err) {
          reject(err)
        } else {
          resolve(records)
        }
      })
    })
  }

  async generateImportReport(result: ImportResult, outputPath?: string): Promise<string> {
    const report = `Import Report
==============
Status: ${result.success ? 'SUCCESS' : 'FAILED'}
Total Imported: ${result.imported}
Total Failed: ${result.failed}
Total Errors: ${result.errors.length}

${result.errors.length > 0 ? 'Errors:\n' + result.errors.map(error => 
  `Row ${error.row}: ${error.field ? `[${error.field}] ` : ''}${error.message}`
).join('\n') : 'No errors'}
`

    if (outputPath) {
      await fs.writeFile(outputPath, report, 'utf-8')
    }

    return report
  }
}