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
