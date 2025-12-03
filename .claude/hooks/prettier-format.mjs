#!/usr/bin/env node

/**
 * Prettier Auto-Format Hook (PostToolUse)
 *
 * Automatically formats files with Prettier after edits.
 * Notifies Claude when files are modified by formatting.
 */

import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'))

// Get list of files to format
const files = input.files || []

if (files.length === 0) {
  console.log(
    JSON.stringify({
      continue: true,
      suppressOutput: true,
    }),
  )
  process.exit(0)
}

// Filter files that Prettier can format
const formattableExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.md', '.mjs']
const formattableFiles = files.filter((file) =>
  formattableExtensions.some((ext) => file.endsWith(ext)),
)

if (formattableFiles.length === 0) {
  console.log(
    JSON.stringify({
      continue: true,
      suppressOutput: true,
    }),
  )
  process.exit(0)
}

try {
  // Track which files were modified by comparing timestamps
  const modifiedFiles = []

  // Format each file
  for (const file of formattableFiles) {
    try {
      // Get file modification time before formatting
      const statBefore = statSync(file)

      execSync(`npx prettier --write "${file}"`, {
        cwd: process.env.CLAUDE_PROJECT_DIR,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      // Check if file was modified
      const statAfter = statSync(file)
      if (statAfter.mtimeMs !== statBefore.mtimeMs) {
        modifiedFiles.push(file.replace(process.env.CLAUDE_PROJECT_DIR + '/', ''))
      }
    } catch (err) {
      // Ignore individual file errors
    }
  }

  if (modifiedFiles.length > 0) {
    // Files were formatted
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `✓ Prettier formatted ${modifiedFiles.length} file(s): ${modifiedFiles.join(', ')}`,
      }),
    )
  } else {
    // No formatting changes needed
    console.log(
      JSON.stringify({
        continue: true,
        suppressOutput: true,
      }),
    )
  }

  process.exit(0)
} catch (error) {
  // Only report if there's a critical error
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `Prettier formatting encountered issues: ${error.message}`,
    }),
  )
  process.exit(0)
}
