#!/usr/bin/env node

/**
 * Prettier Auto-Format Hook (PostToolUse / Edit|Write)
 *
 * Formats the single edited file with Prettier. Silent on no-op; reports
 * only when formatting changed the file.
 */

import { execSync } from 'child_process'
import { readFileSync, statSync } from 'fs'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const filePath = input?.tool_input?.file_path ?? ''

if (!filePath || !/\.(js|jsx|ts|tsx|json|css|md|mjs)$/.test(filePath)) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
}

try {
  const before = statSync(filePath).mtimeMs
  execSync(`npx prettier --write --log-level=warn "${filePath}"`, {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
  const after = statSync(filePath).mtimeMs
  if (after !== before) {
    const rel = process.env.CLAUDE_PROJECT_DIR
      ? filePath.replace(process.env.CLAUDE_PROJECT_DIR + '/', '')
      : filePath
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `Prettier reformatted ${rel}.`,
      }),
    )
  } else {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  }
  process.exit(0)
} catch (error) {
  const tail = (error.stderr || error.stdout || error.message || '')
    .toString()
    .split('\n')
    .slice(-3)
    .join('\n')
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `Prettier failed: ${tail}`,
    }),
  )
  process.exit(0)
}
