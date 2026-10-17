export interface CLIArgs {
  dryRun: boolean
  clearCache: boolean
  updateMode: boolean
  [key: string]: boolean | string | undefined
}

export function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)

  return {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
    updateMode: args.includes('--update'),
  }
}

/** `scriptName` is a seed script, for example 'tags'. */
export function printUsage(scriptName: string): void {
  console.log(`Usage: pnpm seed ${scriptName} [options]`)
  console.log('\nOptions:')
  console.log('  --dry-run       Validate data without writing to database')
  console.log('  --clear-cache   Clear download cache before import')
  console.log('  --update        Update existing records (default: skip existing)')
}
