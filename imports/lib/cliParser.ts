/**
 * CLI Argument Parser
 *
 * Simple utility for parsing command line arguments for import scripts.
 */

export interface CLIArgs {
  dryRun: boolean
  clearCache: boolean
  [key: string]: boolean | string | undefined
}

/**
 * Parse command line arguments
 *
 * @param additionalFlags - Additional string flags to parse (e.g., ['unit'] for --unit=1)
 * @returns Parsed arguments object
 */
export function parseArgs(additionalFlags?: string[]): CLIArgs {
  const args = process.argv.slice(2)

  const result: CLIArgs = {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
  }

  // Parse additional key=value flags
  if (additionalFlags) {
    for (const flag of additionalFlags) {
      const found = args.find((arg) => arg.startsWith(`--${flag}=`))
      if (found) {
        result[flag] = found.split('=')[1]
      }
    }
  }

  return result
}

/**
 * Print usage information for an import script
 *
 * @param scriptName - Name of the script (e.g., 'tags', 'meditations')
 * @param additionalOptions - Additional options to display
 */
export function printUsage(scriptName: string, additionalOptions?: string): void {
  console.log(`Usage: pnpm import ${scriptName} [options]`)
  console.log('\nOptions:')
  console.log('  --dry-run       Validate data without writing to database')
  console.log('  --clear-cache   Clear download cache before import')
  if (additionalOptions) {
    console.log(additionalOptions)
  }
}
