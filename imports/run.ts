#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Unified Seed Script Runner
 *
 * A simple CLI to run seed scripts with consistent argument handling.
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

import { spawn } from 'child_process'
import * as path from 'path'

const SCRIPTS: Record<string, string> = {
  storyblok: 'storyblok/import.ts',
  wemeditate: 'wemeditate/import.ts',
  meditations: 'meditations/import.ts',
  tags: 'tags/import.ts',
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
