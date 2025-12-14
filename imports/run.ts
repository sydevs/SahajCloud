#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Unified Seed Script Runner
 *
 * A CLI to run seed scripts with consistent argument handling and progress visualization.
 *
 * Usage:
 *   pnpm seed <script> [options]
 *
 * Scripts:
 *   storyblok    - Seed Path Steps from Storyblok CMS
 *   wemeditate   - Seed content from WeMeditate Rails database
 *   meditations  - Seed meditation content from legacy database
 *   tags         - Seed MeditationTags and MusicTags from Cloudinary
 *
 * Options:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 *
 * Examples:
 *   pnpm seed storyblok --dry-run
 *   pnpm seed wemeditate --clear-cache
 *   pnpm seed meditations --dry-run
 *   pnpm seed tags
 */

import 'dotenv/config'

import type { BaseImporter, BaseImportOptions } from './lib'

type ScriptName = 'storyblok' | 'wemeditate' | 'meditations' | 'tags'

const VALID_SCRIPTS: ScriptName[] = ['storyblok', 'wemeditate', 'meditations', 'tags']

const SCRIPT_DESCRIPTIONS: Record<ScriptName, string> = {
  storyblok: 'Seed Path Steps from Storyblok CMS',
  wemeditate: 'Seed content from WeMeditate Rails database',
  meditations: 'Seed meditation content from legacy database',
  tags: 'Seed MeditationTags and MusicTags from Cloudinary',
}

const VALID_OPTIONS = ['--dry-run', '--clear-cache']

function printUsage(): void {
  console.log(`
📦 Seed Script Runner

Usage:
  pnpm seed <script> [options]

Available Scripts:
  storyblok     Seed Path Steps from Storyblok CMS
  wemeditate    Seed content from WeMeditate Rails database
  meditations   Seed meditation content from legacy database
  tags          Seed MeditationTags and MusicTags from Cloudinary

Options:
  --dry-run      Validate data without writing to database
  --clear-cache  Clear download cache before import

Examples:
  pnpm seed storyblok --dry-run
  pnpm seed wemeditate --clear-cache
  pnpm seed meditations --dry-run
  pnpm seed tags
`)
}

function printScripts(): void {
  console.log('\nAvailable scripts:')
  for (const name of VALID_SCRIPTS) {
    console.log(`  ${name.padEnd(14)} → ${SCRIPT_DESCRIPTIONS[name]}`)
  }
  console.log('')
}

/**
 * Dynamically import and create importer instance
 */
async function createImporter(
  script: ScriptName,
  options: BaseImportOptions,
): Promise<BaseImporter> {
  switch (script) {
    case 'tags': {
      const { TagsImporter } = await import('./tags/import')
      return new TagsImporter(options)
    }
    case 'wemeditate': {
      const { WeMeditateImporter } = await import('./wemeditate/import')
      return new WeMeditateImporter(options)
    }
    case 'meditations': {
      const { MeditationsImporter } = await import('./meditations/import')
      return new MeditationsImporter(options)
    }
    case 'storyblok': {
      const token = process.env.STORYBLOK_ACCESS_TOKEN
      if (!token) {
        throw new Error('STORYBLOK_ACCESS_TOKEN environment variable is required')
      }
      const { StoryblokImporter } = await import('./storyblok/import')
      return new StoryblokImporter(options, token)
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Handle help flag
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage()
    process.exit(0)
  }

  // Handle list flag
  if (args.includes('--list') || args.includes('-l')) {
    printScripts()
    process.exit(0)
  }

  // Get script name
  const scriptName = args[0] as ScriptName

  if (!VALID_SCRIPTS.includes(scriptName)) {
    console.error(`❌ Unknown script: ${scriptName}`)
    printScripts()
    process.exit(1)
  }

  // Parse options
  const scriptArgs = args.slice(1)
  for (const arg of scriptArgs) {
    if (!VALID_OPTIONS.includes(arg)) {
      console.error(`❌ Unknown option: ${arg}`)
      console.error(`\nValid options: ${VALID_OPTIONS.join(', ')}`)
      process.exit(1)
    }
  }

  const options: BaseImportOptions = {
    dryRun: scriptArgs.includes('--dry-run'),
    clearCache: scriptArgs.includes('--clear-cache'),
  }

  console.log(`\n🚀 Running: ${scriptName}`)
  if (options.dryRun) console.log('   Mode: DRY RUN')
  if (options.clearCache) console.log('   Option: Clear cache')
  console.log('')

  // Create and run importer
  const importer = await createImporter(scriptName, options)
  await importer.run()

  // Exit with success
  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
