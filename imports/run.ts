#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Unified Import Script Runner
 *
 * A simple CLI to run import scripts with consistent argument handling.
 *
 * Usage:
 *   pnpm run import <script> [options]
 *
 * Scripts:
 *   storyblok    - Import Path Steps from Storyblok CMS
 *   wemeditate   - Import content from WeMeditate Rails database
 *   meditations  - Import meditation content from legacy database
 *   tags         - Import MeditationTags and MusicTags from Cloudinary
 *
 * Options:
 *   --dry-run      Validate data without writing to database
 *   --reset        Delete existing tagged records before import
 *   --clear-cache  Clear download cache before import
 *
 * Examples:
 *   pnpm import storyblok --dry-run
 *   pnpm import wemeditate --reset
 *   pnpm import meditations --dry-run
 *   pnpm import tags
 */

import { spawn } from 'child_process'
import * as path from 'path'

const SCRIPTS: Record<string, string> = {
  storyblok: 'storyblok/import.ts',
  wemeditate: 'wemeditate/import.ts',
  meditations: 'meditations/import.ts',
  tags: 'tags/import.ts',
}

const VALID_OPTIONS = ['--dry-run', '--reset', '--clear-cache']

function printUsage(): void {
  console.log(`
📦 Import Script Runner

Usage:
  pnpm run import <script> [options]

Available Scripts:
  storyblok     Import Path Steps from Storyblok CMS
  wemeditate    Import content from WeMeditate Rails database
  meditations   Import meditation content from legacy database
  tags          Import MeditationTags and MusicTags from Cloudinary

Options:
  --dry-run      Validate data without writing to database
  --reset        Delete existing tagged records before import
  --clear-cache  Clear download cache before import

Examples:
  pnpm run import storyblok --dry-run
  pnpm run import wemeditate --reset
  pnpm run import meditations --dry-run
  pnpm run import tags
`)
}

function printScripts(): void {
  console.log('\nAvailable scripts:')
  for (const [name, scriptPath] of Object.entries(SCRIPTS)) {
    console.log(`  ${name.padEnd(14)} → imports/${scriptPath}`)
  }
  console.log('')
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
  const scriptName = args[0]
  const scriptPath = SCRIPTS[scriptName]

  if (!scriptPath) {
    console.error(`❌ Unknown script: ${scriptName}`)
    printScripts()
    process.exit(1)
  }

  // Validate options
  const scriptArgs = args.slice(1)
  for (const arg of scriptArgs) {
    const isValidOption = VALID_OPTIONS.some((opt) => arg === opt)

    if (!isValidOption) {
      console.error(`❌ Unknown option: ${arg}`)
      console.error(`\nValid options: ${VALID_OPTIONS.join(', ')}`)
      process.exit(1)
    }
  }

  // Build full path to script
  const fullScriptPath = path.join(process.cwd(), 'imports', scriptPath)

  console.log(`\n🚀 Running: ${scriptName}`)
  if (scriptArgs.length > 0) {
    console.log(`   Options: ${scriptArgs.join(' ')}`)
  }
  console.log('')

  // Run the script using tsx
  const child = spawn('npx', ['tsx', fullScriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  })

  child.on('error', (error) => {
    console.error(`❌ Failed to run script: ${error.message}`)
    process.exit(1)
  })

  child.on('close', (code) => {
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
