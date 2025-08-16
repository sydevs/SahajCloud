import type { MigrationSummary, MigrationResult } from '../types'
import chalk from 'chalk'
import Table from 'cli-table3'

export class MigrationReporter {
  private summary: MigrationSummary

  constructor() {
    this.summary = {
      startTime: new Date(),
      endTime: new Date(),
      results: [],
      totalMediaTransferred: 0,
      totalMediaSizeBytes: 0,
    }
  }

  startMigration(): void {
    this.summary.startTime = new Date()
    console.log('\n' + '='.repeat(45))
    console.log(chalk.bold.cyan('        PAYLOAD CMS DATA MIGRATION'))
    console.log('='.repeat(45))
    console.log(`Start Time: ${this.summary.startTime.toLocaleString()}`)
    console.log('='.repeat(45))
  }

  addResult(result: MigrationResult): void {
    this.summary.results.push(result)
    
    if (result.mediaTransferred) {
      this.summary.totalMediaTransferred += result.mediaTransferred
    }
    
    if (result.mediaSizeBytes) {
      this.summary.totalMediaSizeBytes += result.mediaSizeBytes
    }
  }

  printSummary(dryRun: boolean = false): void {
    this.summary.endTime = new Date()
    
    console.log('\n' + '='.repeat(45))
    console.log(chalk.bold.cyan('        MIGRATION SUMMARY REPORT'))
    console.log('='.repeat(45))
    
    if (dryRun) {
      console.log(chalk.yellow.bold('DRY RUN MODE - No data was actually migrated'))
      console.log('='.repeat(45))
    }
    
    console.log(`Migration Date: ${this.summary.startTime.toLocaleString()}`)
    console.log(`Source: PostgreSQL (configured database)`)
    console.log()

    // Create results table
    const table = new Table({
      head: [
        chalk.white('Collection'),
        chalk.white('Total'),
        chalk.green('Success'),
        chalk.red('Failed'),
        chalk.blue('Media Files'),
      ],
      style: {
        head: [],
        border: [],
      },
    })

    let totalRecords = 0
    let totalSuccess = 0
    let totalFailed = 0

    for (const result of this.summary.results) {
      totalRecords += result.total
      totalSuccess += result.success
      totalFailed += result.failed

      const successRate = result.total > 0 
        ? Math.round((result.success / result.total) * 100) 
        : 0

      table.push([
        result.collection.toUpperCase(),
        result.total.toString(),
        chalk.green(`${result.success} (${successRate}%)`),
        result.failed > 0 ? chalk.red(result.failed.toString()) : '0',
        result.mediaTransferred ? result.mediaTransferred.toString() : '-',
      ])

      // Print first 3 errors for each collection
      if (result.errors.length > 0) {
        console.log(`\n${chalk.red('Errors for ' + result.collection + ':')}`)
        result.errors.slice(0, 3).forEach(error => {
          console.log(`  - Row ${error.row}: ${error.message}`)
        })
        if (result.errors.length > 3) {
          console.log(`  ... and ${result.errors.length - 3} more errors`)
        }
      }
    }

    // Add totals row
    table.push([
      chalk.bold('TOTAL'),
      chalk.bold(totalRecords.toString()),
      chalk.bold.green(totalSuccess.toString()),
      chalk.bold.red(totalFailed.toString()),
      chalk.bold.blue(this.summary.totalMediaTransferred.toString()),
    ])

    console.log(table.toString())

    // Duration and media stats
    const duration = (this.summary.endTime.getTime() - this.summary.startTime.getTime()) / 1000
    const minutes = Math.floor(duration / 60)
    const seconds = Math.round(duration % 60)
    
    console.log('\n' + '='.repeat(45))
    console.log(`Total duration: ${minutes} minutes ${seconds} seconds`)
    
    if (this.summary.totalMediaTransferred > 0) {
      const sizeInGB = (this.summary.totalMediaSizeBytes / (1024 * 1024 * 1024)).toFixed(2)
      console.log(`Media files transferred: ${this.summary.totalMediaTransferred} (${sizeInGB} GB total)`)
    }
    
    console.log('='.repeat(45))

    // Success message
    if (totalFailed === 0) {
      console.log(chalk.green.bold('\n✓ Migration completed successfully!'))
    } else if (totalSuccess > totalFailed) {
      console.log(chalk.yellow.bold(`\n⚠ Migration completed with ${totalFailed} errors`))
    } else {
      console.log(chalk.red.bold('\n✗ Migration failed with multiple errors'))
    }
  }

  printProgress(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const prefix = {
      info: chalk.blue('ℹ'),
      success: chalk.green('✓'),
      warning: chalk.yellow('⚠'),
      error: chalk.red('✗'),
    }

    console.log(`${prefix[type]} ${message}`)
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}