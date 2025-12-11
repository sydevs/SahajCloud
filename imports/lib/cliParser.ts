/**
 * CLI Argument Parser
 *
 * Simple utility for parsing command line arguments for import scripts.
 */

/* eslint-disable no-console */

export interface CLIArgs {
  dryRun: boolean
  clearCache: boolean
  [key: string]: boolean | string | undefined
}

/**
 * Parse command line arguments
 *
 * @returns Parsed arguments object
 */
export function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)

  return {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
  }
}

/**
 * Print usage information for an import script
 *
 * @param scriptName - Name of the script (e.g., 'tags', 'meditations')
 */
export function printUsage(scriptName: string): void {
  console.log(`Usage: pnpm import ${scriptName} [options]`)
  console.log('\nOptions:')
  console.log('  --dry-run       Validate data without writing to database')
  console.log('  --clear-cache   Clear download cache before import')
}
