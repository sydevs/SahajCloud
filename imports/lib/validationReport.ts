/**
 * Validation Report Generator
 *
 * Generates detailed markdown reports for import validation results.
 * Tracks warnings, errors, field mappings, and record statistics.
 */

import { promises as fs } from 'fs'
import * as path from 'path'

export interface RecordsSummary {
  created: number
  skipped: number
  errors: number
  updated?: number
}

export interface FieldMapping {
  sourceField: string
  targetField: string
  notes?: string
}

export class ValidationReport {
  private warnings: string[] = []
  private errors: string[] = []
  private fieldMappings: FieldMapping[] = []
  private recordsSummary: RecordsSummary = { created: 0, skipped: 0, errors: 0 }
  private importName: string = ''
  private startTime: Date = new Date()

  /**
   * Add a warning message to the report
   */
  addWarning(message: string): void {
    this.warnings.push(message)
  }

  /**
   * Add an error message to the report
   */
  addError(message: string): void {
    this.errors.push(message)
  }

  /**
   * Document a field mapping transformation
   */
  addFieldMapping(sourceField: string, targetField: string, notes?: string): void {
    this.fieldMappings.push({ sourceField, targetField, notes })
  }

  /**
   * Set the records summary statistics
   */
  setRecordsSummary(summary: RecordsSummary): void {
    this.recordsSummary = summary
  }

  /**
   * Update records summary incrementally
   */
  incrementCreated(): void {
    this.recordsSummary.created++
  }

  incrementSkipped(): void {
    this.recordsSummary.skipped++
  }

  incrementErrors(): void {
    this.recordsSummary.errors++
  }

  incrementUpdated(): void {
    this.recordsSummary.updated = (this.recordsSummary.updated || 0) + 1
  }

  /**
   * Get the current summary
   */
  getSummary(): RecordsSummary {
    return { ...this.recordsSummary }
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warnings.length
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length
  }

  /**
   * Generate the validation report and write to file
   */
  async generate(outputPath: string, importName: string): Promise<string> {
    this.importName = importName
    const duration = this.calculateDuration()
    const report = this.buildReport(duration)

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    // Write report
    await fs.writeFile(outputPath, report, 'utf-8')

    return outputPath
  }

  /**
   * Calculate duration since start
   */
  private calculateDuration(): string {
    const endTime = new Date()
    const durationMs = endTime.getTime() - this.startTime.getTime()
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  /**
   * Build the markdown report content
   */
  private buildReport(duration: string): string {
    const lines: string[] = []

    // Header
    lines.push(`# ${this.importName} Import Validation Report`)
    lines.push('')
    lines.push(`**Generated**: ${new Date().toISOString()}`)
    lines.push(`**Duration**: ${duration}`)
    lines.push('')

    // Summary
    lines.push('## Summary')
    lines.push('')
    lines.push('| Metric | Count |')
    lines.push('|--------|-------|')
    lines.push(`| Created | ${this.recordsSummary.created} |`)
    if (this.recordsSummary.updated) {
      lines.push(`| Updated | ${this.recordsSummary.updated} |`)
    }
    lines.push(`| Skipped | ${this.recordsSummary.skipped} |`)
    lines.push(`| Errors | ${this.recordsSummary.errors} |`)
    lines.push(`| Warnings | ${this.warnings.length} |`)
    lines.push('')

    // Status indicator
    if (this.errors.length === 0) {
      lines.push('**Status**: ✅ Import completed successfully')
    } else {
      lines.push(`**Status**: ⚠️ Import completed with ${this.errors.length} error(s)`)
    }
    lines.push('')

    // Field Mappings
    if (this.fieldMappings.length > 0) {
      lines.push('## Field Mappings')
      lines.push('')
      lines.push('| Source Field | Target Field | Notes |')
      lines.push('|--------------|--------------|-------|')
      for (const mapping of this.fieldMappings) {
        lines.push(`| ${mapping.sourceField} | ${mapping.targetField} | ${mapping.notes || ''} |`)
      }
      lines.push('')
    }

    // Errors
    if (this.errors.length > 0) {
      lines.push('## Errors')
      lines.push('')
      for (const error of this.errors) {
        lines.push(`- ❌ ${error}`)
      }
      lines.push('')
    }

    // Warnings
    if (this.warnings.length > 0) {
      lines.push('## Warnings')
      lines.push('')
      for (const warning of this.warnings) {
        lines.push(`- ⚠️ ${warning}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Reset the report for reuse
   */
  reset(): void {
    this.warnings = []
    this.errors = []
    this.fieldMappings = []
    this.recordsSummary = { created: 0, skipped: 0, errors: 0 }
    this.importName = ''
    this.startTime = new Date()
  }
}
