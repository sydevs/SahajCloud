#!/usr/bin/env node

/**
 * Payload Types Generation Hook (PostToolUse / Edit|Write)
 *
 * Regenerates TypeScript types when a Payload schema source changes.
 * Watched paths:
 *   - src/collections/
 *   - src/lib/richEditor/blocks/ (Lexical page-block configs live here,
 *     not src/blocks/)
 *   - src/fields/
 *   - src/globals/
 *   - src/payload.config.ts
 * The hook runs silently on success. It reports errors only.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const filePath = input?.tool_input?.file_path ?? ''

const projectDir = process.env.CLAUDE_PROJECT_DIR || ''
const rel = filePath.startsWith(projectDir + '/') ? filePath.slice(projectDir.length + 1) : filePath

const shouldRegenerate =
  /^src\/collections\//.test(rel) ||
  /^src\/lib\/richEditor\/blocks\//.test(rel) ||
  /^src\/fields\//.test(rel) ||
  /^src\/globals\//.test(rel) ||
  rel === 'src/payload.config.ts'

if (!shouldRegenerate) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
}

try {
  execSync('pnpm generate:types', {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 30000,
  })
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
} catch (error) {
  const output = (error.stdout || error.stderr || error.message || '')
    .toString()
    .split('\n')
    .slice(-20)
    .join('\n')
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `Failed to regenerate Payload types:\n\n${output}\n\nRun \`pnpm generate:types\` manually to see full output.`,
    }),
  )
  process.exit(0)
}
