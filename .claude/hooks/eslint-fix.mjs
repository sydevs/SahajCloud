#!/usr/bin/env node

/**
 * ESLint Auto-Fix Hook (PostToolUse)
 *
 * Runs ESLint with auto-fix on edited files.
 * Notifies Claude when files are modified by auto-fix.
 * Reports remaining issues for manual fixing.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'))

// Only process JS/TS files
const isLintableFile = (file) => /\.(js|jsx|ts|tsx|mjs)$/.test(file)
const files = input.files?.filter(isLintableFile) || []

if (files.length === 0) {
  console.log(
    JSON.stringify({
      continue: true,
      suppressOutput: true,
    }),
  )
  process.exit(0)
}

try {
  // Run ESLint with auto-fix and JSON output to detect changes
  const fileList = files.map((f) => `"${f}"`).join(' ')

  // First, check what issues exist before fixing
  let beforeOutput = '[]'
  try {
    const result = execSync(`npx eslint ${fileList} --format json`, {
      cwd: process.env.CLAUDE_PROJECT_DIR,
      encoding: 'utf-8',
    })
    beforeOutput = result || '[]'
  } catch (error) {
    // ESLint found issues - capture output
    beforeOutput = error.stdout || '[]'
  }

  // Now run with --fix
  try {
    execSync(`npx eslint ${fileList} --fix`, {
      cwd: process.env.CLAUDE_PROJECT_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
  } catch (_error) {
    // Ignore errors - we'll check the issues in the next step
  }

  // Check what issues remain after fix
  let afterOutput = '[]'
  try {
    const result = execSync(`npx eslint ${fileList} --format json`, {
      cwd: process.env.CLAUDE_PROJECT_DIR,
      encoding: 'utf-8',
    })
    afterOutput = result || '[]'
  } catch (error) {
    // ESLint found remaining issues
    afterOutput = error.stdout || '[]'
  }

  const beforeIssues = JSON.parse(beforeOutput)
  const afterIssues = JSON.parse(afterOutput)

  // Count fixable vs unfixable issues
  const beforeCount = beforeIssues.reduce(
    (sum, file) => sum + file.errorCount + file.warningCount,
    0,
  )
  const afterCount = afterIssues.reduce(
    (sum, file) => sum + file.errorCount + file.warningCount,
    0,
  )

  const fixedCount = beforeCount - afterCount

  if (afterCount > 0) {
    // There are remaining unfixable issues
    const output = afterIssues
      .map((file) => {
        if (file.messages.length === 0) return null
        return (
          `${file.filePath}:\n` +
          file.messages
            .map((msg) => `  Line ${msg.line}:${msg.column} - ${msg.message} (${msg.ruleId})`)
            .join('\n')
        )
      })
      .filter(Boolean)
      .join('\n\n')

    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `ESLint ${fixedCount > 0 ? `auto-fixed ${fixedCount} issue(s), but ` : ''}found ${afterCount} issue(s) that need manual fixing:\n\n${output}\n\nPlease review and fix these manually.`,
      }),
    )
  } else if (fixedCount > 0) {
    // All issues were auto-fixed
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `✓ ESLint auto-fixed ${fixedCount} issue(s). The file${files.length > 1 ? 's have' : ' has'} been updated.`,
      }),
    )
  } else {
    // No issues found
    console.log(
      JSON.stringify({
        continue: true,
        suppressOutput: true,
      }),
    )
  }

  process.exit(0)
} catch (error) {
  // Critical error running ESLint
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `ESLint encountered an error: ${error.message}\n\nYou may need to check your ESLint configuration.`,
    }),
  )
  process.exit(0)
}
