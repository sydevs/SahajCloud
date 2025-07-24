#!/usr/bin/env tsx

import { program } from 'commander'
import { TagsImporter, NarratorsImporter, MusicImporter } from './collections'
import type { BaseImporter } from './BaseImporter'
import type { ImportOptions } from './types'

const IMPORTERS: Record<string, new () => BaseImporter> = {
  tags: TagsImporter,
  narrators: NarratorsImporter,
  music: MusicImporter,
}

program
  .name('import')
  .description('Import data into Payload CMS collections')
  .version('1.0.0')
  .argument('<collection>', 'Collection to import into (tags, narrators, music)')
  .argument('<file>', 'Path to CSV or JSON file to import')
  .option('-d, --dry-run', 'Perform a dry run without actually importing data')
  .option('-v, --validate-only', 'Only validate data without importing')
  .option('-b, --batch-size <size>', 'Number of records to process at once', '100')
  .option('-r, --report <path>', 'Path to save import report')
  .action(async (collection: string, file: string, options) => {
    try {
      // Validate collection
      const ImporterClass = IMPORTERS[collection.toLowerCase()]
      if (!ImporterClass) {
        console.error(`Invalid collection: ${collection}`)
        console.error(`Available collections: ${Object.keys(IMPORTERS).join(', ')}`)
        process.exit(1)
      }

      // Create importer instance
      const importer = new ImporterClass()
      await importer.initialize()

      // Prepare import options
      const importOptions: ImportOptions = {
        dryRun: options.dryRun || false,
        validateOnly: options.validateOnly || false,
        batchSize: parseInt(options.batchSize) || 100,
        onProgress: (current: number, total: number) => {
          const percentage = Math.round((current / total) * 100)
          process.stdout.write(`\rProgress: ${current}/${total} (${percentage}%)`)
        }
      }

      console.log(`Importing ${collection} from ${file}...`)
      if (options.dryRun) {
        console.log('🔍 Running in dry-run mode - no data will be imported')
      }
      if (options.validateOnly) {
        console.log('✓ Running in validate-only mode - only checking data validity')
      }

      // Perform import
      const result = file.endsWith('.json')
        ? await importer.importFromJSON(file, importOptions)
        : await importer.importFromCSV(file, importOptions)

      process.stdout.write('\n') // New line after progress

      // Generate report
      const report = await importer.generateImportReport(
        result,
        options.report
      )

      console.log('\n' + report)

      if (options.report) {
        console.log(`\n📄 Report saved to: ${options.report}`)
      }

      process.exit(result.success ? 0 : 1)
    } catch (error) {
      console.error('Import failed:', error)
      process.exit(1)
    }
  })

program.parse()

// Example usage:
// pnpm tsx src/scripts/import/import.ts tags ./data/tags.csv
// pnpm tsx src/scripts/import/import.ts narrators ./data/narrators.json --dry-run
// pnpm tsx src/scripts/import/import.ts music ./data/music.csv --validate-only --report ./import-report.txt