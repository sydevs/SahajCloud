/** Markdown reports for import validation results. */

import { promises as fs } from 'fs'
import * as path from 'path'

export interface RecordsSummary {
  created: number
  skipped: number
  errors: number
  updated: number
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
  private recordsSummary: RecordsSummary = { created: 0, skipped: 0, errors: 0, updated: 0 }
  private importName: string = ''
  private startTime: Date = new Date()

  addWarning(message: string): void {
    this.warnings.push(message)
  }

  addError(message: string): void {
    this.errors.push(message)
  }

  addFieldMapping(sourceField: string, targetField: string, notes?: string): void {
    this.fieldMappings.push({ sourceField, targetField, notes })
  }

  setRecordsSummary(summary: RecordsSummary): void {
    this.recordsSummary = summary
  }

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
    this.recordsSummary.updated++
  }

  getSummary(): RecordsSummary {
    return { ...this.recordsSummary }
  }

  getWarningCount(): number {
    return this.warnings.length
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  getErrorCount(): number {
    return this.errors.length
  }

  getErrors(): string[] {
    return [...this.errors]
  }

  /** Generate the validation report and write to file */
  async generate(outputPath: string, importName: string): Promise<string> {
    this.importName = importName

    const duration = this.calculateDuration()
    const report = this.buildReport(duration)

    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    await fs.writeFile(outputPath, report, 'utf-8')

    return outputPath
  }

  /** Calculate duration since start */
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

  private buildReport(duration: string): string {
    const lines: string[] = []

    lines.push(`# ${this.importName} Import Validation Report`)
    lines.push('')
    lines.push(`**Generated**: ${new Date().toISOString()}`)
    lines.push(`**Duration**: ${duration}`)
    lines.push('')

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

    if (this.errors.length === 0) {
      lines.push('**Status**: ✅ Import completed successfully')
    } else {
      lines.push(`**Status**: ⚠️ Import completed with ${this.errors.length} error(s)`)
    }
    lines.push('')

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

    if (this.errors.length > 0) {
      lines.push('## Errors')
      lines.push('')
      for (const error of this.errors) {
        lines.push(`- ❌ ${error}`)
      }
      lines.push('')
    }

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

  /** Reset the report for reuse */
  reset(): void {
    this.warnings = []
    this.errors = []
    this.fieldMappings = []
    this.recordsSummary = { created: 0, skipped: 0, errors: 0, updated: 0 }
    this.importName = ''
    this.startTime = new Date()
  }
}
